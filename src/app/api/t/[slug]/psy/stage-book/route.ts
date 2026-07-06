import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { STAGE_STATUS } from '@/lib/flow'
import { getClientPhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// مراجع برای مرحله‌ی جاریِ پرونده‌اش (مصاحبه یا ارزیابی، فرقی نمی‌کند) وقت می‌گیرد.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { case_number, stage_id, session_date, session_time } = await req.json()
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کدِ یک‌بارمصرف وارد شوید' }, { status: 401 })
  if (!session_date || !session_time) return NextResponse.json({ error: 'زمان ناقص است' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases').select('id, resource_id, father_phone, mother_phone, current_stage_id')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.father_phone !== phone && booking.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })
  if (!stage_id || booking.current_stage_id !== stage_id)
    return NextResponse.json({ error: 'این مرحله در دسترس نیست' }, { status: 400 })

  const { data: stage } = await sb().from('psy_stages').select('id, status').eq('id', stage_id).eq('tenant_id', t.id).single()
  if (!stage || stage.status !== STAGE_STATUS.AWAITING_BOOKING)
    return NextResponse.json({ error: 'این مرحله در دسترس نیست' }, { status: 400 })

  const db = sb()
  const [{ data: takenS }, { data: takenSt }] = await Promise.all([
    db.from('psy_sessions').select('id').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).eq('session_date', session_date).eq('session_time', session_time),
    db.from('psy_stages').select('id').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).eq('session_date', session_date).eq('session_time', session_time).neq('id', stage_id),
  ])
  if ((takenS && takenS.length) || (takenSt && takenSt.length))
    return NextResponse.json({ error: 'این ساعت قبلاً رزرو شده. لطفاً زمان دیگری انتخاب کنید.' }, { status: 409 })

  const { error } = await sb().from('psy_stages')
    .update({ session_date, session_time, status: STAGE_STATUS.BOOKED, cancel_notice: null })
    .eq('id', stage_id).eq('tenant_id', t.id)
  if (error) { console.error('psy/stage-book error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
