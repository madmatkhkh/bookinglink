import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { getResourcePricing, reverseVatSplit, redeemDiscountCodeByCode } from '@/lib/psy'
import { recordLedgerEntry } from '@/lib/ledger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// POST عمدا حذف شده: ساختن «جلسه‌ی تکی» مسیر دوم موازی «دادن جلسه به مراجع»
// بود کنار psy_stages، و همان چیزی که دکترها مدام با آن یکی اشتباه می‌گرفتند.
// حالا تنها مسیر ساخت جلسه‌ی تازه، POST روی panel/psy/stages است. جلسه‌های زیر
// پروتکل درمان همچنان توسط روت packages ساخته می‌شوند (سمت سرور)، و ردیف‌های
// قدیمی psy_sessions با همین GET/PATCH/DELETE خوانده و مدیریت می‌شوند.

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const q = req.nextUrl.searchParams
  const db = sb()

  if (q.get('pending')) {
    let query = db.from('psy_sessions').select('*').eq('tenant_id', a.tenant.id)
      .eq('payment_submitted', true).eq('paid', false).order('created_at', { ascending: false })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ sessions: data || [] })
  }
  if (q.get('refunds')) {
    let query = db.from('psy_sessions').select('*').eq('tenant_id', a.tenant.id)
      .eq('refund_status', 'pending').order('created_at', { ascending: false })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ sessions: data || [] })
  }
  if (q.get('all')) {
    let query = db.from('psy_sessions')
      .select('id, case_number, session_date, session_time, session_type, attendee, status, delay_minutes')
      .eq('tenant_id', a.tenant.id).neq('session_date', '').order('session_date', { ascending: true })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ sessions: data || [] })
  }
  const case_number = q.get('case_number')
  let query = db.from('psy_sessions').select('*')
    .eq('tenant_id', a.tenant.id).eq('case_number', case_number).order('created_at', { ascending: true })
  if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
  const { data } = await query
  return NextResponse.json({ sessions: data || [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id, resource_id: _ignored, doctor_cancel, ...body } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  // فقط ستون‌های مجاز از بدنه پذیرفته می‌شوند. بدون این whitelist، بدنه مستقیم
  // spread می‌شد و کاربر احرازشده می‌توانست ستون‌های هویتی/مالی را هم ست کند —
  // مثلا tenant_id (انتقال ردیف به مستأجر دیگر) یا price/refund_amount/case_number.
  // ستون‌های حساس (tenant_id, resource_id, case_number, package_id, session_number,
  // price, original_price, created_at, reminder_sent, refund_percent/amount/card,
  // discount_code, cancelled_by) عمدا این‌جا نیستند.
  const ALLOWED = [
    'session_goals', 'session_summary', 'doctor_notes_private', 'doctor_note_for_patient', 'notes',
    'status', 'paid', 'payment_submitted', 'payment_ref', 'payment_reject_reason', 'delay_minutes',
    'refund_status', 'refund_ref', 'session_date', 'session_time', 'session_type', 'attendee', 'held', 'meet_link', 'cancel_notice',
  ]
  const updates: Record<string, any> = {}
  for (const k of ALLOWED) if (body[k] !== undefined) updates[k] = body[k]

  const { data: before } = await sb().from('psy_sessions').select('*').eq('id', id).eq('tenant_id', a.tenant.id).maybeSingle()

  // شماره پیگیری بازپرداخت اجباری است — هنگام نهایی‌کردن بازپرداخت باید ثبت شده
  // باشد (کلاینت هم الزام می‌کند، ولی سرور هم تضمین می‌کند تا شماره پیگیری‌ای که
  // به مراجع نشان داده می‌شود هیچ‌وقت خالی نماند).
  if (updates.refund_status === 'done' && !String(updates.refund_ref ?? before?.refund_ref ?? '').trim())
    return NextResponse.json({ error: 'برای ثبت بازپرداخت، شماره پیگیری لازم است' }, { status: 400 })

  // لغو نوبت توسط مطب = خالی‌کردن زمان + پاک‌کردن تاخیر قبلی. قفل اسلات نگه داشته
  // می‌شود (بلاک) و فلگ روی همان خانه‌ی زمانی ثبت می‌شود.
  if (doctor_cancel) { updates.session_date = ''; updates.session_time = ''; updates.delay_minutes = null }

  let q = sb().from('psy_sessions').update(updates).eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data, error } = await q.select().single()
  if (error) { console.error('src/app/api/t/[slug]/panel/psy/sessions/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }

  if (doctor_cancel && before?.session_date && before?.session_time) {
    await sb().from('psy_cancelled_slots').insert({
      tenant_id: a.tenant.id, resource_id: before.resource_id || null, case_number: before.case_number,
      session_date: before.session_date, session_time: before.session_time, cancelled_by: 'doctor',
    })
  }

  // گذار به paid (تایید کارت‌به‌کارت جلسه‌ی جایگزین) → دفتر حساب
  if (updates.paid === true && before && !before.paid && data) {
    const sessVat = reverseVatSplit(data.price || 0, await getResourcePricing(data.resource_id))
    const freshEntry = await recordLedgerEntry({
      tenantId: a.tenant.id, resourceId: data.resource_id || null, caseNumber: data.case_number,
      purpose: 'session', method: 'card_to_card', amount: data.price || 0,
      commissionAmount: 0, sessionBaseAmount: sessVat.base, sessionVatAmount: sessVat.vat, doctorAmount: data.price || 0,
      sourceTable: 'psy_sessions', sourceId: data.id, recordedBy: a.isOwner ? 'owner' : 'staff',
    })
    // مصرف کد تخفیف کارت‌به‌کارت فقط لحظه‌ی تایید واقعی — و فقط یک بار (گیت روی ثبت تازه‌ی ledger)
    if (freshEntry && data.discount_code && data.resource_id)
      await redeemDiscountCodeByCode(data.resource_id, data.discount_code)
  }
  // ثبت بازپرداخت وقتی refund نهایی می‌شود → ردیف outflow (پول برگشتی به مراجع)
  if (updates.refund_status === 'done' && before && before.refund_status !== 'done' && data) {
    const full = data.price || 0
    const refundAmount = data.refund_amount || Math.round(full * (100 - (data.refund_percent || 0)) / 100)
    if (refundAmount > 0) {
      await recordLedgerEntry({
        tenantId: a.tenant.id, resourceId: data.resource_id || null, caseNumber: data.case_number,
        purpose: 'refund', method: 'card_to_card', direction: 'outflow', amount: refundAmount,
        commissionAmount: 0, doctorAmount: refundAmount,
        sourceTable: 'psy_sessions', sourceId: data.id, note: `بازپرداخت ${data.refund_percent || 0}٪`,
        recordedBy: a.isOwner ? 'owner' : 'staff',
      })
    }
  }
  return NextResponse.json({ session: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id } = await req.json()
  let q = sb().from('psy_sessions').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  await q
  return NextResponse.json({ success: true })
}
