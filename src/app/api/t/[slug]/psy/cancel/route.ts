import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { requireModule } from '@/lib/modules'
import { jalaliDateTimeToTimestamp } from '@/lib/calendar'
import { getCancellationPolicy } from '@/lib/psy'
import { getClientPhone, matchesClientIdentity } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const gate = await requireModule(t.id, 'patient_self_cancel')
  if (gate) return gate
  const { session_id, case_number, refund_card } = await req.json()
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کد یک‌بارمصرف وارد شوید' }, { status: 401 })

  const { data: booking } = await sb().from('psy_cases').select('contact_phone, contact2_phone, contact_email, contact2_email')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || !matchesClientIdentity(booking, phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const { data: session } = await sb().from('psy_sessions').select('*')
    .eq('id', session_id).eq('tenant_id', t.id).single()
  if (!session) return NextResponse.json({ error: 'جلسه یافت نشد' }, { status: 404 })
  if (session.case_number !== case_number) return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })
  if (session.status !== 'confirmed' || !session.session_date || !session.session_time)
    return NextResponse.json({ error: 'این جلسه قابل کنسل نیست' }, { status: 400 })

  const policy = session.resource_id ? await getCancellationPolicy(session.resource_id) : null
  if (policy && !policy.enabled)
    return NextResponse.json({ error: 'کنسلی خودکار برای این پرونده غیرفعال است — با دکتر هماهنگ کنید' }, { status: 403 })

  const ts = jalaliDateTimeToTimestamp(session.session_date, session.session_time)
  const hours = ts === null ? null : (ts - Date.now()) / (1000 * 60 * 60)
  if (hours === null || hours <= 0) return NextResponse.json({ error: 'زمان این جلسه گذشته است' }, { status: 400 })

  if (!session.paid) {
    await sb().from('psy_sessions').update({ session_date: '', session_time: '' }).eq('id', session_id)
    return NextResponse.json({ success: true, outcome: 'unpaid_released' })
  }

  const thresholdHours = policy?.threshold_hours ?? 12
  const earlyPercent = policy?.early_refund_percent ?? 50
  const latePercent = policy?.late_refund_percent ?? 0

  if (hours >= thresholdHours) {
    const card = (refund_card || '').toString().trim()
    await sb().from('psy_sessions').update({
      session_date: '', session_time: '', status: 'forfeited',
      refund_percent: earlyPercent,
      refund_card: earlyPercent > 0 ? (card || null) : null,
      refund_status: earlyPercent > 0 && card ? 'pending' : null,
    }).eq('id', session_id)
    return NextResponse.json({ success: true, outcome: earlyPercent > 0 ? 'partial_refund' : 'forfeited', refund_percent: earlyPercent })
  } else {
    const card = (refund_card || '').toString().trim()
    await sb().from('psy_sessions').update({
      session_date: '', session_time: '', status: 'forfeited',
      refund_percent: latePercent,
      refund_card: latePercent > 0 ? (card || null) : null,
      refund_status: latePercent > 0 && card ? 'pending' : null,
    }).eq('id', session_id)
    return NextResponse.json({ success: true, outcome: latePercent > 0 ? 'partial_refund' : 'forfeited', refund_percent: latePercent })
  }
}
