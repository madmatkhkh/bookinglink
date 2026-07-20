import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse, type Tenant } from '@/lib/tenant'
import { createPanelSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// همه‌ی tenantهایی که همین هویت (owner_phone یا owner_email) صاحبشان است.
// امن است: session فعلی ثابت می‌کند که این هویت با OTP وارد این tenant شده؛
// tenantهای دیگری که همین owner_phone/owner_email را دارند هم مال همین شخص‌اند
// (می‌تواند با همان شماره برای آن‌ها هم OTP بگیرد). فقط برای owner.
async function ownerPanels(tenant: Tenant) {
  const orParts: string[] = []
  if (tenant.owner_phone) orParts.push(`owner_phone.eq.${tenant.owner_phone}`)
  if (tenant.owner_email) orParts.push(`owner_email.eq.${tenant.owner_email}`)
  if (!orParts.length) return []
  const { data: tenants } = await sb().from('tenants')
    .select('id, slug, status').or(orParts.join(',')).eq('status', 'active')
  const list = tenants || []
  const ids = list.map(t => t.id)
  const { data: profs } = ids.length
    ? await sb().from('tenant_profiles').select('tenant_id, display_name').in('tenant_id', ids)
    : { data: [] as { tenant_id: string; display_name: string }[] }
  const nameById = new Map((profs || []).map(p => [p.tenant_id, p.display_name]))
  return list.map(t => ({
    slug: t.slug,
    display_name: nameById.get(t.id) || t.slug,
    current: t.id === tenant.id,
  }))
}

// فهرست پنل‌های همین صاحب — برای سوییچر در «حساب من»
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ panels: [] })
  return NextResponse.json({ panels: await ownerPanels(a.tenant) })
}

// سوییچ بدون OTP دوباره — فقط اگر هویت (owner_phone/owner_email) مقصد دقیقا با
// tenant فعلی یکی باشد. آن‌وقت یک session تازه برای مقصد صادر و کوکی عوض می‌شود.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const { targetSlug } = await req.json().catch(() => ({}))
  if (!targetSlug) return NextResponse.json({ error: 'ناقص' }, { status: 400 })

  const { data: target } = await sb().from('tenants')
    .select('id, slug, status, owner_phone, owner_email')
    .eq('slug', targetSlug).maybeSingle()
  if (!target || target.status !== 'active')
    return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  // هویت مقصد باید دقیقا با هویت فعلی یکی باشد (همان صاحب)
  const samePhone = !!a.tenant.owner_phone && a.tenant.owner_phone === target.owner_phone
  const sameEmail = !!a.tenant.owner_email && a.tenant.owner_email === target.owner_email
  if (!samePhone && !sameEmail)
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const res = NextResponse.json({ success: true, slug: target.slug })
  await createPanelSession(res, target.id)
  return res
}
