import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { requireModule } from '@/lib/modules'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// یک متخصص فقط کدهای خودش را می‌بیند/می‌سازد؛ owner برای resource درحال‌مشاهده
// (همان الگوی سوییچر دکتر در تنظیمات) با ?resource_id=
async function resolveResourceId(req: NextRequest, a: { isOwner: boolean; resourceId: string | null; tenant: { id: string } }) {
  if (a.isOwner) {
    const q = req.nextUrl.searchParams.get('resource_id')
    if (q) return q
    // اگر owner و resource_id نداده، اولین منبع فعال خودش را بگیر
    const { data } = await sb().from('resources').select('id').eq('tenant_id', a.tenant.id).eq('is_active', true).order('sort_order').limit(1).maybeSingle()
    return data?.id || null
  }
  return a.resourceId
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const gate = await requireModule(a.tenant.id, 'discount_codes', a.tenant.plan)
  if (gate) return gate
  const resourceId = await resolveResourceId(req, a)
  if (!resourceId) return NextResponse.json({ codes: [] })
  const { data } = await sb().from('psy_discount_codes').select('*').eq('resource_id', resourceId).order('created_at', { ascending: false })
  return NextResponse.json({ codes: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const gate = await requireModule(a.tenant.id, 'discount_codes', a.tenant.plan)
  if (gate) return gate
  const b = await req.json().catch(() => ({}))
  const resourceId = b.resource_id && a.isOwner ? b.resource_id : (await resolveResourceId(req, a))
  if (!resourceId) return NextResponse.json({ error: 'منبع نامعتبر' }, { status: 400 })

  const code = String(b.code || '').trim().toUpperCase().replace(/\s/g, '')
  if (!/^[A-Z0-9]{3,20}$/.test(code)) return NextResponse.json({ error: 'کد باید ۳ تا ۲۰ حرف/عدد لاتین باشد' }, { status: 400 })
  const discountType = b.discount_type === 'fixed' ? 'fixed' : 'percent'
  const discountValue = Number(b.discount_value)
  if (!Number.isFinite(discountValue) || discountValue <= 0) return NextResponse.json({ error: 'مقدار تخفیف نامعتبر است' }, { status: 400 })
  if (discountType === 'percent' && discountValue > 100) return NextResponse.json({ error: 'درصد تخفیف نمی‌تواند بیش از ۱۰۰ باشد' }, { status: 400 })
  const maxUses = b.max_uses ? Math.max(1, parseInt(b.max_uses)) : null
  const expiresAt = b.expires_at ? new Date(b.expires_at).toISOString() : null

  const { data, error } = await sb().from('psy_discount_codes').insert({
    tenant_id: a.tenant.id, resource_id: resourceId, code,
    discount_type: discountType, discount_value: discountValue, max_uses: maxUses, expires_at: expiresAt,
  }).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این کد قبلا برای همین متخصص ثبت شده' }, { status: 409 })
    console.error('panel/psy/discount-codes POST error:', error)
    return NextResponse.json({ error: 'ثبت کد ناموفق بود', detail: `${error.code || ''} ${error.message || ''}`.trim() }, { status: 500 })
  }
  return NextResponse.json({ code: data })
}

// PATCH {id, is_active?} — فعلا فقط روشن/خاموش‌کردن (تغییر درصد بعد ساخت منطقی نیست، کد تازه بساز)
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const gate = await requireModule(a.tenant.id, 'discount_codes', a.tenant.plan)
  if (gate) return gate
  const b = await req.json().catch(() => ({}))
  if (!b.id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })
  let q = sb().from('psy_discount_codes').update({ is_active: !!b.is_active }).eq('id', b.id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { error } = await q
  if (error) return NextResponse.json({ error: 'ذخیره ناموفق بود' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const gate = await requireModule(a.tenant.id, 'discount_codes', a.tenant.plan)
  if (gate) return gate
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })
  let q = sb().from('psy_discount_codes').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  await q
  return NextResponse.json({ success: true })
}
