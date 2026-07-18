import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { redeemDiscountCodeByCode } from '@/lib/psy'
import { recordLedgerEntry } from '@/lib/ledger'
import { releaseLockBySlot } from '@/lib/slotLocks'

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
  const { id, resource_id: _ignored, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  const { data: before } = await sb().from('psy_sessions').select('*').eq('id', id).eq('tenant_id', a.tenant.id).maybeSingle()

  // لغو نوبت توسط دکتر = خالی‌کردن زمان؛ تاخیر نوبت قبلی هم باید پاک شود تا روی
  // نوبت بعدی نماند.
  if (updates.session_date === '' && (updates.delay_minutes === undefined)) updates.delay_minutes = null

  let q = sb().from('psy_sessions').update(updates).eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data, error } = await q.select().single()
  if (error) { console.error('src/app/api/t/[slug]/panel/psy/sessions/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }

  // اسلات آزادشده از slot_locks حذف شود تا واقعا آزاد شود
  if (updates.session_date === '' && before?.session_date && before?.session_time && before?.resource_id) {
    await releaseLockBySlot(a.tenant.id, before.resource_id, { session_date: before.session_date, session_time: before.session_time })
  }

  // گذار به paid (تایید کارت‌به‌کارت جلسه‌ی جایگزین) → دفتر حساب
  if (updates.paid === true && before && !before.paid && data) {
    const freshEntry = await recordLedgerEntry({
      tenantId: a.tenant.id, resourceId: data.resource_id || null, caseNumber: data.case_number,
      purpose: 'session', method: 'card_to_card', amount: data.price || 0,
      commissionAmount: 0, doctorAmount: data.price || 0,
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
