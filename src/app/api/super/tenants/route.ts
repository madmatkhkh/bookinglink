import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed, normalizePhone } from '@/lib/auth'
import { RESERVED_SLUGS, SLUG_PATTERN } from '@/lib/config'
import { getNiche } from '@/lib/niche'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: tenants } = await sb().from('tenants')
    .select('id, slug, status, plan, niche_key, owner_phone, custom_domain, domain_verified, created_at, tenant_profiles(display_name)')
    .order('created_at', { ascending: false })
  return NextResponse.json({ tenants: tenants || [] })
}

// ساختِ tenant تازه با نیچِ انتخابی: {slug, owner_phone, display_name, niche_key}
export async function POST(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json()

  const slug = String(b.slug || '').trim().toLowerCase()
  if (!SLUG_PATTERN.test(slug)) return NextResponse.json({ error: 'slug نامعتبر (لاتینِ کوچک، عدد، خطِ تیره)' }, { status: 400 })
  if (RESERVED_SLUGS.includes(slug)) return NextResponse.json({ error: 'این slug رزروِ سیستم است' }, { status: 400 })
  const phone = normalizePhone(b.owner_phone)
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })

  const nicheKey = String(b.niche_key || 'psychology')
  const niche = await getNiche(nicheKey)
  if (!niche) return NextResponse.json({ error: 'نیچ نامعتبر است' }, { status: 400 })

  const { data: tenant, error } = await sb().from('tenants')
    .insert({ slug, owner_phone: phone, niche_key: nicheKey }).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این slug قبلاً گرفته شده' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const displayName = String(b.display_name || '').trim().slice(0, 60)
  // پروفایل با رنگِ پیش‌فرضِ نیچ
  await sb().from('tenant_profiles').insert({
    tenant_id: tenant.id, display_name: displayName, theme_color: niche.default_theme,
  })
  // منبعِ پیش‌فرض («خودم») تا tenant از روزِ اول قابلِ رزرو باشد
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
  // ماژول‌های پیش‌فرضِ نیچ
  if (niche.default_features?.length) {
    await sb().from('tenant_features').insert(
      niche.default_features.map((key: string) => ({
        tenant_id: tenant.id, feature_key: key, enabled: true,
      }))
    )
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
    patch.domain_verified = false // با تغییرِ دامنه، تایید صفر می‌شود
  }
  if (b.domain_verified !== undefined) patch.domain_verified = !!b.domain_verified
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'چیزی برای تغییر نیست' }, { status: 400 })

  const { error } = await sb().from('tenants').update(patch).eq('id', b.id)
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این دامنه قبلاً ثبت شده' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
