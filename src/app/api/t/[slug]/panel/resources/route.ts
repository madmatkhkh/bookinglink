import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { normalizePhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function clean(body: any) {
  const phone = body.phone ? normalizePhone(body.phone) : null
  return {
    name: String(body.name || '').trim().slice(0, 60),
    title: String(body.title || '').trim().slice(0, 80),
    avatar_url: String(body.avatar_url || '').slice(0, 500) || null,
    is_selectable: body.is_selectable !== false,
    is_active: body.is_active !== false,
    sort_order: parseInt(body.sort_order) || 0,
    // شماره‌ی ورودِ کارمند — اختیاری؛ اگر خالی بگذارید آن نفر نمی‌تواند مستقل لاگین کند
    phone: phone && /^09\d{9}$/.test(phone) ? phone : null,
  }
}

// مدیریتِ لیستِ پرسنل (staff) کارِ صاحبِ مجموعه است؛ کارمند نمی‌تواند همکارانش را ببیند/ویرایش کند.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const { data } = await sb().from('resources').select('*').eq('tenant_id', a.tenant.id)
    .order('sort_order').order('created_at')
  return NextResponse.json({ resources: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const r = clean(await req.json())
  if (!r.name) return NextResponse.json({ error: 'نام لازم است' }, { status: 400 })
  const { data, error } = await sb().from('resources').insert({ ...r, tenant_id: a.tenant.id }).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این شماره قبلاً برای یک کارمند دیگر ثبت شده' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // پروفایلِ خالیِ پیش‌فرض برای نیچِ روانشناسی
  await sb().from('psy_resource_profiles').insert({ resource_id: data.id })
  return NextResponse.json({ resource: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })
  const r = clean(body)
  if (!r.name) return NextResponse.json({ error: 'نام لازم است' }, { status: 400 })
  const { data, error } = await sb().from('resources').update(r)
    .eq('id', body.id).eq('tenant_id', a.tenant.id).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این شماره قبلاً برای یک کارمند دیگر ثبت شده' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ resource: data })
}

// حذفِ نرم: غیرفعال می‌کنیم تا رزروهای قدیمی که به منبع ارجاع دارند نشکنند.
// جلوگیری از حذفِ آخرین منبعِ فعال.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  const { id } = await req.json()
  const { data: actives } = await sb().from('resources').select('id')
    .eq('tenant_id', a.tenant.id).eq('is_active', true)
  if ((actives || []).length <= 1)
    return NextResponse.json({ error: 'حداقل یک نفر باید فعال بماند' }, { status: 400 })
  await sb().from('resources').update({ is_active: false }).eq('id', id).eq('tenant_id', a.tenant.id)
  return NextResponse.json({ success: true })
}
