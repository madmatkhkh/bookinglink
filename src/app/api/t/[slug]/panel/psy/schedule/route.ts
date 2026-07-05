import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// هر دکتر (resource) برنامه‌ی روزمحورِ مستقلِ خودش دارد؛ owner باید مشخص کند
// برنامه‌ی کدام دکتر را می‌بیند/ویرایش می‌کند (پیش‌فرض: تنها منبع، برای تک‌دکترها).
async function resolveResourceId(req: NextRequest, tenantId: string, isOwner: boolean, ownResourceId: string | null, bodyResourceId?: string): Promise<string | null> {
  if (!isOwner) return ownResourceId
  const fromQuery = req.nextUrl.searchParams.get('resource_id')
  if (bodyResourceId) return bodyResourceId
  if (fromQuery) return fromQuery
  const { data } = await sb().from('resources').select('id').eq('tenant_id', tenantId)
    .order('sort_order').order('created_at').limit(1).maybeSingle()
  return data?.id || null
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { date, available_times, is_off, slot_types, slot_locs, resource_id } = await req.json()
  if (!date) return NextResponse.json({ error: 'تاریخ ناقص است' }, { status: 400 })
  const resourceId = await resolveResourceId(req, a.tenant.id, a.isOwner, a.resourceId, resource_id)
  if (!resourceId) return NextResponse.json({ error: 'منبعی یافت نشد' }, { status: 404 })

  const { data: existing } = await sb().from('psy_schedules').select('id')
    .eq('tenant_id', a.tenant.id).eq('resource_id', resourceId).eq('date', date).maybeSingle()
  const payload = {
    available_times: available_times || [], is_off: !!is_off,
    slot_types: slot_types || {}, slot_locs: slot_locs || {},
  }
  let saveError = null
  if (existing) {
    saveError = (await sb().from('psy_schedules').update(payload).eq('id', existing.id)).error
  } else {
    saveError = (await sb().from('psy_schedules').insert({ tenant_id: a.tenant.id, resource_id: resourceId, date, ...payload })).error
  }
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

  // آزادسازیِ جلسه‌هایی که ساعتشان دیگر در دسترس نیست (یا روز تعطیل شد) — فقط برای همین دکتر
  const newTimes: string[] = is_off ? [] : (available_times || [])
  const { data: booked } = await sb().from('psy_sessions').select('id, session_time')
    .eq('tenant_id', a.tenant.id).eq('resource_id', resourceId).eq('session_date', date).eq('status', 'confirmed')
  const toRelease = (booked || []).filter(s => s.session_time && !newTimes.includes(s.session_time))
  const releasedIds = toRelease.map(s => s.id)
  if (releasedIds.length) {
    await sb().from('psy_sessions').update({ session_date: '', session_time: '', status: 'confirmed' })
      .in('id', releasedIds)
  }
  return NextResponse.json({ success: true, released: releasedIds.length }, { headers: NO_STORE })
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const resourceId = await resolveResourceId(req, a.tenant.id, a.isOwner, a.resourceId)
  if (!resourceId) return NextResponse.json({ schedules: [], schedule: null }, { headers: NO_STORE })

  const q = req.nextUrl.searchParams
  const date = q.get('date'), year = q.get('year'), month = q.get('month')
  const db = sb()

  if (date) {
    const { data } = await db.from('psy_schedules').select('*')
      .eq('tenant_id', a.tenant.id).eq('resource_id', resourceId).eq('date', date).maybeSingle()
    return NextResponse.json({ schedule: data || null }, { headers: NO_STORE })
  }
  if (year && month) {
    const padded = month.padStart(2, '0'), unpadded = String(parseInt(month))
    const { data } = await db.from('psy_schedules').select('*').eq('tenant_id', a.tenant.id).eq('resource_id', resourceId)
      .or(`date.like.${year}/${padded}/%,date.like.${year}/${unpadded}/%`).order('date')
    return NextResponse.json({ schedules: data || [] }, { headers: NO_STORE })
  }
  const { data } = await db.from('psy_schedules').select('*').eq('tenant_id', a.tenant.id).eq('resource_id', resourceId).order('date')
  return NextResponse.json({ schedules: data || [] }, { headers: NO_STORE })
}
