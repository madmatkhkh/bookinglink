import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { jalaliDateTimeToTimestamp } from '@/lib/calendar'
import { PSY_CANCEL } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { session_id, case_number, phone, refund_card } = await req.json()

  const { data: booking } = await sb().from('psy_cases').select('father_phone, mother_phone')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.father_phone !== phone && booking.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const { data: session } = await sb().from('psy_sessions').select('*')
    .eq('id', session_id).eq('tenant_id', t.id).single()
  if (!session) return NextResponse.json({ error: 'جلسه یافت نشد' }, { status: 404 })
  if (session.case_number !== case_number) return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })
  if (session.status !== 'confirmed' || !session.session_date || !session.session_time)
    return NextResponse.json({ error: 'این جلسه قابل کنسل نیست' }, { status: 400 })

  const ts = jalaliDateTimeToTimestamp(session.session_date, session.session_time)
  const hours = ts === null ? null : (ts - Date.now()) / (1000 * 60 * 60)
  if (hours === null || hours <= 0) return NextResponse.json({ error: 'زمان این جلسه گذشته است' }, { status: 400 })

  if (!session.paid) {
    await sb().from('psy_sessions').update({ session_date: '', session_time: '' }).eq('id', session_id)
    return NextResponse.json({ success: true, outcome: 'unpaid_released' })
  }

  if (hours >= PSY_CANCEL.partialHours) {
    const card = (refund_card || '').toString().trim()
    await sb().from('psy_sessions').update({
      session_date: '', session_time: '', status: 'forfeited',
      refund_percent: PSY_CANCEL.partialPercent,
      refund_card: card || null,
      refund_status: card ? 'pending' : null,
    }).eq('id', session_id)
    return NextResponse.json({ success: true, outcome: 'partial_refund', refund_percent: PSY_CANCEL.partialPercent })
  } else {
    await sb().from('psy_sessions').update({
      session_date: '', session_time: '', status: 'forfeited', refund_percent: 0,
    }).eq('id', session_id)
    return NextResponse.json({ success: true, outcome: 'forfeited' })
  }
}
