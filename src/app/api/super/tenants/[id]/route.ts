import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed, normalizePhone, signImpersonateToken } from '@/lib/auth'
import { getNiche, isPsychologyNiche } from '@/lib/niche'
import { MULTI_THERAPIST_FEATURE_KEY, CARD_TO_CARD_FEATURE_KEY } from '@/lib/psy'
import { getModuleCatalog } from '@/lib/modules'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// لیست fallback برای وقتی کاتالوگ modules هنوز ساخته نشده (migration 0029
// اجرا نشده) — همان دو کلید قدیمی، تا صفحه‌ی سوپرادمین قبل از migration هم
// دقیقا مثل قبل کار کند.
const FALLBACK_FEATURE_LABELS: Record<string, string> = {
  patient_buy_extra_session: 'خرید جلسه‌ی جایگزین',
  patient_self_cancel: 'کنسل خودکار توسط مراجع',
}

// جزئیات کامل یک tenant: پروفایل، منابع (پرسنل)، آمار برحسب نیچ، ماژول‌ها.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = params.id

  const { data: tenant } = await sb().from('tenants')
    .select('id, slug, status, plan, niche_key, owner_phone, custom_domain, domain_verified, created_at, tenant_profiles(display_name, theme_color)')
    .eq('id', id).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const profileRow = Array.isArray((tenant as any).tenant_profiles)
    ? (tenant as any).tenant_profiles[0] : (tenant as any).tenant_profiles
  const niche = await getNiche(tenant.niche_key)

  const { data: resources } = await sb().from('resources')
    .select('id, name, title, phone, is_active, is_selectable, sort_order, created_at')
    .eq('tenant_id', id).order('sort_order').order('created_at')

  // وضعیت شبای تسویه (فقط روانشناسی، فقط برای نمایش — تصمیم‌گیری تسویه‌ی دستی)
  let shebaByResource = new Map<string, boolean>()
  if (isPsychologyNiche(tenant.niche_key) && resources?.length) {
    const { data: profiles } = await sb().from('psy_resource_profiles')
      .select('resource_id, settlement_sheba').in('resource_id', resources.map(r => r.id))
    shebaByResource = new Map((profiles || []).map(p => [p.resource_id, !!p.settlement_sheba]))
  }

  // آمار: هرکدام از دو خانواده‌ی نیچ، جدول‌های خودشان را دارند.
  let stats: Record<string, number> = {}
  if (isPsychologyNiche(tenant.niche_key)) {
    const [cases, sessions, packages] = await Promise.all([
      sb().from('psy_cases').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      sb().from('psy_sessions').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      sb().from('psy_packages').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    ])
    stats = { cases: cases.count || 0, sessions: sessions.count || 0, packages: packages.count || 0 }
  } else {
    const [bookings, services, records] = await Promise.all([
      sb().from('bookings').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      sb().from('services').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      sb().from('client_records').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    ])
    stats = { bookings: bookings.count || 0, services: services.count || 0, records: records.count || 0 }
  }

  // ── ماژول‌ها از روی کاتالوگ (فاز 1 سیستم ماژولار — MODULES.md) ─────────
  // فقط ماژول‌های enforced (که کد واقعا گیتشان می‌کند) سوییچ می‌گیرند تا سوییچ
  // «الکی» به سوپرادمین نشان ندهیم. «حالت کلینیک» و «کارت‌به‌کارت» UI اختصاصی
  // خودشان را پایین‌تر در همین صفحه دارند و از این لیست حذف می‌شوند.
  let features: { feature_key: string; label: string; enabled: boolean; scope?: string }[] = []
  let multiTherapist = false
  let multiTherapistRequested = false
  let cardToCard = false
  {
    const { data: rows } = await sb().from('tenant_features').select('feature_key, enabled, config')
      .eq('tenant_id', id)
    const rowBy = new Map((rows || []).map(r => [r.feature_key, r]))

    const catalog = await getModuleCatalog()
    if (catalog.length > 0) {
      const scopes = new Set(['platform', isPsychologyNiche(tenant.niche_key) ? 'psychology' : tenant.niche_key])
      const SPECIAL = new Set([MULTI_THERAPIST_FEATURE_KEY, CARD_TO_CARD_FEATURE_KEY])
      features = catalog
        .filter(m => m.is_active && m.enforced && scopes.has(m.scope) && !SPECIAL.has(m.key))
        .map(m => ({
          feature_key: m.key, label: m.display_name, scope: m.scope,
          enabled: (rowBy.get(m.key)?.enabled as boolean | undefined) ?? m.default_on,
        }))
    } else if (isPsychologyNiche(tenant.niche_key)) {
      // fallback قبل از اجرای migration — رفتار قدیمی عینا
      features = Object.entries(FALLBACK_FEATURE_LABELS).map(([key, label]) => ({
        feature_key: key, label,
        enabled: (rowBy.get(key)?.enabled as boolean | undefined) ?? true,
      }))
    }

    // «حالت کلینیک» و «کارت‌به‌کارت» پیش‌فرضشان خاموش است
    const mtRow = rowBy.get(MULTI_THERAPIST_FEATURE_KEY)
    multiTherapist = (mtRow?.enabled as boolean | undefined) ?? false
    multiTherapistRequested = !multiTherapist && !!(mtRow?.config as any)?.requested
    cardToCard = (rowBy.get(CARD_TO_CARD_FEATURE_KEY)?.enabled as boolean | undefined) ?? false
  }

  return NextResponse.json({
    tenant: {
      id: tenant.id, slug: tenant.slug, status: tenant.status, plan: tenant.plan,
      niche_key: tenant.niche_key, owner_phone: tenant.owner_phone,
      custom_domain: tenant.custom_domain, domain_verified: tenant.domain_verified,
      created_at: tenant.created_at,
      display_name: profileRow?.display_name || '', theme_color: profileRow?.theme_color || '',
    },
    niche: niche ? {
      key: niche.key, display_name: niche.display_name,
      resource_label: niche.resource_label, client_label: niche.client_label, booking_label: niche.booking_label,
    } : null,
    resources: (resources || []).map(r => ({ ...r, has_sheba: shebaByResource.get(r.id) || false })),
    stats,
    features,
    multi_therapist: multiTherapist,
    multi_therapist_requested: multiTherapistRequested,
    card_to_card: cardToCard,
    // توکن کوتاه‌عمر impersonate — فقط از همین پاسخ احرازشده قابل‌دریافت است (ضد CSRF)
    impersonate_token: signImpersonateToken(tenant.id),
  })
}

// ویرایش فیلدهای tenant: {owner_phone?, display_name?, status?, plan?, custom_domain?, domain_verified?}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = params.id
  const b = await req.json().catch(() => ({}))

  const { data: existing } = await sb().from('tenants').select('id, niche_key').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const tenantPatch: Record<string, any> = {}
  if (b.status !== undefined) {
    if (!['active', 'suspended', 'pending'].includes(b.status))
      return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
    tenantPatch.status = b.status
  }
  if (b.plan !== undefined) {
    if (!['free', 'pro'].includes(b.plan)) return NextResponse.json({ error: 'پلن نامعتبر' }, { status: 400 })
    tenantPatch.plan = b.plan
  }
  if (b.owner_phone !== undefined) {
    const phone = normalizePhone(b.owner_phone)
    if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })
    tenantPatch.owner_phone = phone
  }
  if (b.custom_domain !== undefined) {
    const d = String(b.custom_domain || '').trim().toLowerCase()
    tenantPatch.custom_domain = d || null
    tenantPatch.domain_verified = false // با تغییر دامنه، تایید صفر می‌شود
  }
  if (b.domain_verified !== undefined) tenantPatch.domain_verified = !!b.domain_verified

  if (Object.keys(tenantPatch).length) {
    const { error } = await sb().from('tenants').update(tenantPatch).eq('id', id)
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'این دامنه قبلا ثبت شده' }, { status: 409 })
      console.error('super/tenants/[id] PATCH (tenants) error:', error)
      return NextResponse.json({ error: 'ذخیره‌ی تغییرات ناموفق بود', detail: `${error.code || ''} ${error.message || ''}`.trim() }, { status: 500 })
    }
  }

  // نکته: کارت‌به‌کارت دیگر به پلن گره نخورده — با فلگ tenant_features به کلید
  // card_to_card کنترل می‌شود (روت features). پاک‌سازی دیتای ذخیره‌شده هنگام
  // خاموش‌شدن آن فلگ هم همان‌جا انجام می‌شود، نه این‌جا.

  if (b.display_name !== undefined) {
    const displayName = String(b.display_name || '').trim().slice(0, 60)
    const { error } = await sb().from('tenant_profiles').upsert({ tenant_id: id, display_name: displayName })
    if (error) {
      console.error('super/tenants/[id] PATCH (tenant_profiles) error:', error)
      return NextResponse.json({ error: 'ذخیره‌ی نام نمایشی ناموفق بود', detail: `${error.code || ''} ${error.message || ''}`.trim() }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}

// حذف کامل tenant (بازگشت‌ناپذیر — همه‌ی جدول‌های وابسته با on delete cascade پاک می‌شوند)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = params.id

  const { data: existing } = await sb().from('tenants').select('id, slug').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const { error } = await sb().from('tenants').delete().eq('id', id)
  if (error) {
    console.error('super/tenants/[id] DELETE error:', error)
    return NextResponse.json({ error: 'حذف ناموفق بود', detail: `${error.code || ''} ${error.message || ''}`.trim() }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
