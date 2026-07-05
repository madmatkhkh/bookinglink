import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { FLOW } from '@/lib/flow'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { case_number, phone, interview_date, interview_time } = await req.json()
  if (!interview_date || !interview_time) return NextResponse.json({ error: 'زمان ناقص است' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases').select('id, resource_id, father_phone, mother_phone, flow_status')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.father_phone !== phone && booking.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })
  if (booking.flow_status !== FLOW.INTERVIEW_AWAITING_BOOKING)
    return NextResponse.json({ error: 'این مرحله در دسترس نیست' }, { status: 400 })

  const db = sb()
  const [{ data: takenS }, { data: takenB }, { data: takenI }, { data: takenA }] = await Promise.all([
    db.from('psy_sessions').select('id').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).eq('session_date', interview_date).eq('session_time', interview_time),
    db.from('psy_cases').select('id, status').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).eq('booking_date', interview_date).eq('booking_time', interview_time),
    db.from('psy_cases').select('id').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).eq('interview_date', interview_date).eq('interview_time', interview_time).neq('id', booking.id),
    db.from('psy_cases').select('id').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).eq('assessment_date', interview_date).eq('assessment_time', interview_time),
  ])
  const bClash = (takenB || []).some((b: any) => b.status !== 'cancelled')
  if ((takenS && takenS.length) || bClash || (takenI && takenI.length) || (takenA && takenA.length))
    return NextResponse.json({ error: 'این ساعت قبلاً رزرو شده. لطفاً زمان دیگری انتخاب کنید.' }, { status: 409 })

  const { error } = await sb().from('psy_cases').update({
    interview_date, interview_time, booking_date: interview_date, booking_time: interview_time,
    flow_status: FLOW.INTERVIEW_BOOKED, status: 'confirmed',
  }).eq('id', booking.id)
  if (error) { console.error('src/app/api/t/[slug]/psy/interview-book/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
