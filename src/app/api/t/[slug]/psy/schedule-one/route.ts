import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { session_id, case_number, phone, session_date, session_time } = await req.json()
  if (!session_id || !session_date || !session_time) return NextResponse.json({ error: 'ناقص' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases').select('father_phone, mother_phone')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.father_phone !== phone && booking.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const { data: session } = await sb().from('psy_sessions').select('*')
    .eq('id', session_id).eq('tenant_id', t.id).single()
  if (!session || session.case_number !== case_number) return NextResponse.json({ error: 'جلسه یافت نشد' }, { status: 404 })
  if (session.status !== 'confirmed') return NextResponse.json({ error: 'این جلسه قابل زمان‌بندی نیست' }, { status: 400 })
  if (!session.paid) return NextResponse.json({ error: 'ابتدا باید هزینه‌ی این جلسه پرداخت شود' }, { status: 400 })

  const db = sb()
  const [{ data: takenS }, { data: takenB }] = await Promise.all([
    db.from('psy_sessions').select('id').eq('tenant_id', t.id).eq('session_date', session_date).eq('session_time', session_time).neq('id', session_id),
    db.from('psy_cases').select('id, status').eq('tenant_id', t.id).eq('booking_date', session_date).eq('booking_time', session_time),
  ])
  const bookingClash = (takenB || []).some((b: any) => b.status !== 'cancelled')
  if ((takenS && takenS.length > 0) || bookingClash)
    return NextResponse.json({ error: 'این ساعت قبلاً رزرو شده. لطفاً زمان دیگری انتخاب کنید.' }, { status: 409 })

  const { error } = await sb().from('psy_sessions').update({ session_date, session_time }).eq('id', session_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
