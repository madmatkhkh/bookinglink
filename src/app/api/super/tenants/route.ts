import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed, normalizePhone } from '@/lib/auth'
import { RESERVED_SLUGS, SLUG_PATTERN } from '@/lib/config'
import { getNiche, isPsychologyNiche } from '@/lib/niche'
import { MULTI_THERAPIST_FEATURE_KEY } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// شمارش سبک «آیا این tenant واقعا استفاده می‌شود؟» — هر نیچ جدول رکورد اصلی
// خودش را دارد (روانشناسی → پرونده، جنریک → رزرو). برای تعداد کم فعلی
// tenantها (فاز آنبوردینگ دستی)، یک شمارش جدا per-tenant به‌صرفه‌تر از یک
// ویو/RPC تازه است؛ اگر تعداد tenantها زیاد شد، این نقطه کاندید بهینه‌سازی است.
async function withRecordsCount<T extends { id: string; niche_key: string }>(tenants: T[]) {
  const psyIds = tenants.filter(t => isPsychologyNiche(t.niche_key)).map(t => t.id)
  const genericIds = tenants.filter(t => !isPsychologyNiche(t.niche_key)).map(t => t.id)
  const counts = new Map<string, number>()

  await Promise.all([
    ...psyIds.map(async id => {
      const { count } = await sb().from('psy_cases').select('id', { count: 'exact', head: true }).eq('tenant_id', id)
      counts.set(id, count || 0)
    }),
    ...genericIds.map(async id => {
      const { count } = await sb().from('bookings').select('id', { count: 'exact', head: true }).eq('tenant_id', id)
      counts.set(id, count || 0)
    }),
  ])
  return tenants.map(t => ({ ...t, records_count: counts.get(t.id) || 0 }))
}

export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await sb().from('tenants')
    .select('id, slug, status, plan, niche_key, owner_phone, custom_domain, domain_verified, created_at, tenant_profiles(display_name)')
    .order('created_at', { ascending: false })
  const tenants = await withRecordsCount(data || [])

  // درخواست‌های معلق «حالت کلینیک» — یک کوئری برای همه، نه per-tenant، تا
  // سوپرادمین لازم نباشد یکی‌یکی وارد جزئیات هر tenant شود تا بفهمد کسی درخواست داده.
  const { data: pendingRows } = await sb().from('tenant_features')
    .select('tenant_id, enabled, config').eq('feature_key', MULTI_THERAPIST_FEATURE_KEY)
  const pendingTenantIds = new Set(
    (pendingRows || []).filter(r => !r.enabled && !!(r.config as any)?.requested).map(r => r.tenant_id)
  )
  const tenantsWithRequests = tenants.map(t => ({ ...t, clinic_mode_requested: pendingTenantIds.has(t.id) }))

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const byNiche: Record<string, number> = {}
  for (const t of tenants) byNiche[t.niche_key] = (byNiche[t.niche_key] || 0) + 1

  const summary = {
    total: tenants.length,
    active: tenants.filter(t => t.status === 'active').length,
    suspended: tenants.filter(t => t.status === 'suspended').length,
    pending: tenants.filter(t => t.status === 'pending').length,
    recent_7d: tenants.filter(t => new Date(t.created_at).getTime() >= sevenDaysAgo).length,
    inactive: tenants.filter(t => t.records_count === 0).length,
    clinic_mode_requests: pendingTenantIds.size,
    by_niche: byNiche,
  }

  return NextResponse.json({ tenants: tenantsWithRequests, summary })
}

// ساخت tenant تازه با نیچ انتخابی: {slug, owner_phone, display_name, niche_key}
export async function POST(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json()

  const slug = String(b.slug || '').trim().toLowerCase()
  if (!SLUG_PATTERN.test(slug)) return NextResponse.json({ error: 'slug نامعتبر (لاتین کوچک، عدد، خط تیره)' }, { status: 400 })
  if (RESERVED_SLUGS.includes(slug)) return NextResponse.json({ error: 'این slug رزرو سیستم است' }, { status: 400 })
  const phone = normalizePhone(b.owner_phone)
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })

  const nicheKey = String(b.niche_key || 'psychology')
  const niche = await getNiche(nicheKey)
  if (!niche) return NextResponse.json({ error: 'نیچ نامعتبر است' }, { status: 400 })

  const { data: tenant, error } = await sb().from('tenants')
    .insert({ slug, owner_phone: phone, niche_key: nicheKey }).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این slug قبلا گرفته شده' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const displayName = String(b.display_name || '').trim().slice(0, 60)
  // پروفایل با رنگ پیش‌فرض نیچ
  await sb().from('tenant_profiles').insert({
    tenant_id: tenant.id, display_name: displayName, theme_color: niche.default_theme,
  })
  // منبع پیش‌فرض («خودم») تا tenant از روز اول قابل رزرو باشد
  const { data: res } = await sb().from('resources').insert({
    tenant_id: tenant.id, name: displayName || 'خودم', is_selectable: true, sort_order: 0,
  }).select('id').single()
  // سرویس‌های نمونه‌ی نیچ (قیمت صفر تا خودش تنظیم کند)
  if (niche.sample_services?.length) {
    await sb().from('services').insert(
      niche.sample_services.map((s: any, i: number) => ({
        tenant_id: tenant.id, name: s.name, duration_minutes: s.duration_minutes,
        price: s.price || 0, mode: s.mode || 'both', sort_order: i,
      }))
    )
  }
  // ماژول‌های پیش‌فرض نیچ — source='niche_default' (فاز 1 سیستم ماژولار)؛
  // اگر migration 0029 هنوز اجرا نشده (ستون source نیست)، بدون آن retry می‌شود
  // تا ساخت tenant هرگز نشکند (fail-open).
  if (niche.default_features?.length) {
    const rows = niche.default_features.map((key: string) => ({
      tenant_id: tenant.id, feature_key: key, enabled: true, source: 'niche_default',
    }))
    const { error: featErr } = await sb().from('tenant_features').insert(rows)
    if (featErr) {
      console.error('default_features insert with source failed, retrying without:', featErr.message)
      await sb().from('tenant_features').insert(rows.map(({ source, ...r }: any) => r))
    }
  }
  // نیچ روانشناسی (تک‌درمانگر یا کلینیک): تنظیمات کلینیک (سطح tenant) + پروفایل دکتر پیش‌فرض با badge نمونه
  // (نام/عنوان از قبل روی resources نشسته؛ بج‌ها per-resource‌اند، قابل ویرایش از پنل → تنظیمات)
  if (isPsychologyNiche(nicheKey)) {
    await sb().from('psy_clinic_settings').insert({ tenant_id: tenant.id })
    if (res?.id) {
      await sb().from('psy_resource_profiles').insert({
        resource_id: res.id,
        badges: ['📍 شهر و منطقه‌ی خودتان', '⏱ پاسخ در 2 ساعت', '⭐ 4.9 از 5'],
        session_modes: 'both',
      })
    }
    // انتخاب صریح تمپلیت «کلینیک» توسط سوپرادمین یعنی حالت کلینیک را همین
    // الان لازم دارد — نیازی به فلوی درخواست/تایید جدا نیست (خود سوپرادمین
    // دارد این tenant را می‌سازد).
    if (nicheKey === 'psychology_clinic') {
      const { error: mtErr } = await sb().from('tenant_features').insert({ tenant_id: tenant.id, feature_key: MULTI_THERAPIST_FEATURE_KEY, enabled: true, source: 'niche_default' })
      if (mtErr) await sb().from('tenant_features').insert({ tenant_id: tenant.id, feature_key: MULTI_THERAPIST_FEATURE_KEY, enabled: true })
    }
  }
  return NextResponse.json({ tenant })
}

// {id, status} یا {id, custom_domain} یا {id, domain_verified}
export async function PATCH(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json()
  if (!b.id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  const patch: Record<string, any> = {}
  if (b.status !== undefined) {
    if (!['active', 'suspended'].includes(b.status))
      return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
    patch.status = b.status
  }
  if (b.custom_domain !== undefined) {
    const d = String(b.custom_domain || '').trim().toLowerCase()
    patch.custom_domain = d || null
    patch.domain_verified = false // با تغییر دامنه، تایید صفر می‌شود
  }
  if (b.domain_verified !== undefined) patch.domain_verified = !!b.domain_verified
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'چیزی برای تغییر نیست' }, { status: 400 })

  const { error } = await sb().from('tenants').update(patch).eq('id', b.id)
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این دامنه قبلا ثبت شده' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
