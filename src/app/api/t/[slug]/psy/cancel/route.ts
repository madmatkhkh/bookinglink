import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { requireModule } from '@/lib/modules'
import { jalaliDateTimeToTimestamp } from '@/lib/calendar'
import { getCancellationPolicy } from '@/lib/psy'
import { releaseLockBySlot } from '@/lib/slotLocks'
import { getClientPhone, matchesClientIdentity } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const gate = await requireModule(t.id, 'patient_self_cancel')
  if (gate) return gate
  const { session_id, stage_id, case_number, refund_card } = await req.json()
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کد یک‌بارمصرف وارد شوید' }, { status: 401 })

  const { data: booking } = await sb().from('psy_cases').select('contact_phone, contact2_phone, contact_email, contact2_email')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || !matchesClientIdentity(booking, phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  // ── کنسلی جلسه‌ی تکی (مرحله) — هم‌تراز با جلسه‌ی پروتکل ────────────────────
  if (stage_id) {
    const { data: stage } = await sb().from('psy_stages').select('*')
      .eq('id', stage_id).eq('tenant_id', t.id).single()
    if (!stage || stage.case_number !== case_number)
      return NextResponse.json({ error: 'جلسه یافت نشد' }, { status: 404 })
    if (stage.status !== 'booked' || !stage.session_date || !stage.session_time)
      return NextResponse.json({ error: 'این جلسه قابل کنسل نیست' }, { status: 400 })

    const stPolicy = stage.resource_id ? await getCancellationPolicy(stage.resource_id) : null
    if (stPolicy && !stPolicy.enabled)
      return NextResponse.json({ error: 'کنسلی خودکار برای این پرونده غیرفعال است — با دکتر هماهنگ کنید' }, { status: 403 })

    const sts = jalaliDateTimeToTimestamp(stage.session_date, stage.session_time)
    const stHours = sts === null ? null : (sts - Date.now()) / (1000 * 60 * 60)
    if (stHours === null || stHours <= 0)
      return NextResponse.json({ error: 'زمان این جلسه گذشته است' }, { status: 400 })

    const stFreed = { session_date: stage.session_date, session_time: stage.session_time }
    const releaseStageSlot = () => stage.resource_id
      ? releaseLockBySlot(t.id, stage.resource_id, stFreed)
      : Promise.resolve()
    // فلگ «لغو توسط مراجع» روی همان خانه‌ی زمانی — تا در برنامه‌ی متخصص دیده شود
    const flagClientCancel = () => sb().from('psy_cancelled_slots').insert({
      tenant_id: t.id, resource_id: stage.resource_id || null, case_number,
      session_date: stage.session_date, session_time: stage.session_time, cancelled_by: 'client',
    })

    // پرداخت‌نشده: زمان آزاد می‌شود و مرحله «کنسل توسط مراجع» علامت می‌خورد
    if (!stage.paid) {
      await sb().from('psy_stages').update({ session_date: '', session_time: '', status: 'cancelled', cancelled_by: 'client' }).eq('id', stage_id)
      await sb().from('psy_cases').update({ current_stage_id: null }).eq('tenant_id', t.id).eq('case_number', case_number).eq('current_stage_id', stage_id)
      await releaseStageSlot(); await flagClientCancel()
      return NextResponse.json({ success: true, outcome: 'unpaid_released' })
    }

    const stThreshold = stPolicy?.threshold_hours ?? 12
    const stPercent = stHours >= stThreshold ? (stPolicy?.early_refund_percent ?? 50) : (stPolicy?.late_refund_percent ?? 0)
    const stCard = (refund_card || '').toString().trim()
    await sb().from('psy_stages').update({
      session_date: '', session_time: '', status: 'cancelled', cancelled_by: 'client',
      refund_percent: stPercent,
      refund_card: stPercent > 0 ? (stCard || null) : null,
      refund_status: stPercent > 0 && stCard ? 'pending' : null,
    }).eq('id', stage_id)
    // مرحله بسته شد → پرونده آزاد می‌شود تا دکتر مرحله‌ی بعد را تعیین کند
    await sb().from('psy_cases').update({ current_stage_id: null }).eq('tenant_id', t.id).eq('case_number', case_number).eq('current_stage_id', stage_id)
    await releaseStageSlot(); await flagClientCancel()
    return NextResponse.json({ success: true, outcome: stPercent > 0 ? 'partial_refund' : 'forfeited', refund_percent: stPercent })
  }

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

  // اسلات آزادشده باید از slot_locks هم حذف شود تا فورا برای دیگران آزاد شود.
  // مختصات را قبل از پاک‌کردن نگه می‌داریم و در هر مسیر خروج آزاد می‌کنیم.
  const freedSlot = { session_date: session.session_date, session_time: session.session_time }
  const releaseSlot = () => session.resource_id
    ? releaseLockBySlot(t.id, session.resource_id, freedSlot)
    : Promise.resolve()
  const flagClientCancel = () => sb().from('psy_cancelled_slots').insert({
    tenant_id: t.id, resource_id: session.resource_id || null, case_number,
    session_date: session.session_date, session_time: session.session_time, cancelled_by: 'client',
  })

  if (!session.paid) {
    await sb().from('psy_sessions').update({ session_date: '', session_time: '', status: 'forfeited', cancelled_by: 'client' }).eq('id', session_id)
    await releaseSlot(); await flagClientCancel()
    return NextResponse.json({ success: true, outcome: 'unpaid_released' })
  }

  const thresholdHours = policy?.threshold_hours ?? 12
  const earlyPercent = policy?.early_refund_percent ?? 50
  const latePercent = policy?.late_refund_percent ?? 0

  if (hours >= thresholdHours) {
    const card = (refund_card || '').toString().trim()
    await sb().from('psy_sessions').update({
      session_date: '', session_time: '', status: 'forfeited', cancelled_by: 'client',
      refund_percent: earlyPercent,
      refund_card: earlyPercent > 0 ? (card || null) : null,
      refund_status: earlyPercent > 0 && card ? 'pending' : null,
    }).eq('id', session_id)
    await releaseSlot(); await flagClientCancel()
    return NextResponse.json({ success: true, outcome: earlyPercent > 0 ? 'partial_refund' : 'forfeited', refund_percent: earlyPercent })
  } else {
    const card = (refund_card || '').toString().trim()
    await sb().from('psy_sessions').update({
      session_date: '', session_time: '', status: 'forfeited', cancelled_by: 'client',
      refund_percent: latePercent,
      refund_card: latePercent > 0 ? (card || null) : null,
      refund_status: latePercent > 0 && card ? 'pending' : null,
    }).eq('id', session_id)
    await releaseSlot(); await flagClientCancel()
    return NextResponse.json({ success: true, outcome: latePercent > 0 ? 'partial_refund' : 'forfeited', refund_percent: latePercent })
  }
}
