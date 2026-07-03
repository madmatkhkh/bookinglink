import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { date, available_times, is_off, slot_types, slot_locs } = await req.json()
  if (!date) return NextResponse.json({ error: 'تاریخ ناقص است' }, { status: 400 })

  const { data: existing } = await sb().from('psy_schedules').select('id')
    .eq('tenant_id', t.id).eq('date', date).maybeSingle()
  const payload = {
    available_times: available_times || [], is_off: !!is_off,
    slot_types: slot_types || {}, slot_locs: slot_locs || {},
  }
  let saveError = null
  if (existing) {
    saveError = (await sb().from('psy_schedules').update(payload).eq('id', existing.id)).error
  } else {
    saveError = (await sb().from('psy_schedules').insert({ tenant_id: t.id, date, ...payload })).error
  }
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

  // آزادسازیِ جلسه‌هایی که ساعتشان دیگر در دسترس نیست (یا روز تعطیل شد)
  const newTimes: string[] = is_off ? [] : (available_times || [])
  const { data: booked } = await sb().from('psy_sessions').select('id, session_time')
    .eq('tenant_id', t.id).eq('session_date', date).eq('status', 'confirmed')
  const toRelease = (booked || []).filter(s => s.session_time && !newTimes.includes(s.session_time))
  const releasedIds = toRelease.map(s => s.id)
  if (releasedIds.length) {
    await sb().from('psy_sessions').update({ session_date: '', session_time: '', status: 'confirmed' })
      .in('id', releasedIds)
  }
  return NextResponse.json({ success: true, released: releasedIds.length }, { headers: NO_STORE })
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const q = req.nextUrl.searchParams
  const date = q.get('date'), year = q.get('year'), month = q.get('month')
  const db = sb()

  if (date) {
    const { data } = await db.from('psy_schedules').select('*').eq('tenant_id', t.id).eq('date', date).maybeSingle()
    return NextResponse.json({ schedule: data || null }, { headers: NO_STORE })
  }
  if (year && month) {
    const padded = month.padStart(2, '0'), unpadded = String(parseInt(month))
    const { data } = await db.from('psy_schedules').select('*').eq('tenant_id', t.id)
      .or(`date.like.${year}/${padded}/%,date.like.${year}/${unpadded}/%`).order('date')
    return NextResponse.json({ schedules: data || [] }, { headers: NO_STORE })
  }
  const { data } = await db.from('psy_schedules').select('*').eq('tenant_id', t.id).order('date')
  return NextResponse.json({ schedules: data || [] }, { headers: NO_STORE })
}
