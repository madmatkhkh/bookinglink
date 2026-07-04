import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { FLOW } from '@/lib/flow'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { case_number, phone, assessment_date, assessment_time } = await req.json()
  if (!assessment_date || !assessment_time) return NextResponse.json({ error: 'زمان ناقص است' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases').select('id, father_phone, mother_phone, flow_status')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.father_phone !== phone && booking.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })
  if (booking.flow_status !== FLOW.ASSESSMENT_AWAITING_BOOKING)
    return NextResponse.json({ error: 'این مرحله در دسترس نیست' }, { status: 400 })

  const db = sb()
  const [{ data: takenS }, { data: takenB }, { data: takenA }] = await Promise.all([
    db.from('psy_sessions').select('id').eq('tenant_id', t.id).eq('session_date', assessment_date).eq('session_time', assessment_time),
    db.from('psy_cases').select('id, status').eq('tenant_id', t.id).eq('booking_date', assessment_date).eq('booking_time', assessment_time),
    db.from('psy_cases').select('id').eq('tenant_id', t.id).eq('assessment_date', assessment_date).eq('assessment_time', assessment_time),
  ])
  const bClash = (takenB || []).some((b: any) => b.status !== 'cancelled')
  if ((takenS && takenS.length) || bClash || (takenA && takenA.length))
    return NextResponse.json({ error: 'این ساعت قبلاً رزرو شده. لطفاً زمان دیگری انتخاب کنید.' }, { status: 409 })

  const { error } = await sb().from('psy_cases')
    .update({ assessment_date, assessment_time, flow_status: FLOW.ASSESSMENT_BOOKED })
    .eq('id', booking.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
