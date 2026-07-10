import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { getResourcePricing, resolvePrice, redeemDiscountCodeByCode } from '@/lib/psy'
import { recordLedgerEntry } from '@/lib/ledger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()

  // جلسه همیشه resource_id را از پرونده‌ی صاحبش به ارث می‌برد — نه از ورودی کاربر
  let caseQ = sb().from('psy_cases').select('resource_id').eq('tenant_id', a.tenant.id).eq('case_number', body.case_number)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)
  const { data: parentCase } = await caseQ.maybeSingle()
  if (!parentCase) return NextResponse.json({ error: 'پرونده یافت نشد یا دسترسی ندارید' }, { status: 404 })

  const count = await sb().from('psy_sessions').select('id', { count: 'exact' })
    .eq('tenant_id', a.tenant.id).eq('case_number', body.case_number)
  const { paid, price, resource_id: _ignored, ...rest } = body
  // قیمت: اگر دکتر خودش عددی داده همان، وگرنه از روی تنظیمات خودش برای نوع این جلسه
  let finalPrice = typeof price === 'number' && price >= 0 ? price : undefined
  if (finalPrice === undefined) {
    const pricing = await getResourcePricing(parentCase.resource_id)
    finalPrice = resolvePrice(rest.session_type, pricing)
  }
  const { data } = await sb().from('psy_sessions').insert([{
    ...rest, tenant_id: a.tenant.id, resource_id: parentCase.resource_id,
    session_number: (count.count || 0) + 1, price: finalPrice,
    status: 'confirmed', paid: paid === true,
  }]).select().single()

  // اگر دکتر جلسه را همان لحظه paid ثبت کرد (کارت‌به‌کارت حضوری) → دفتر حساب
  if (paid === true && data) {
    await recordLedgerEntry({
      tenantId: a.tenant.id,
      resourceId: data.resource_id || null,
      caseNumber: data.case_number,
      purpose: 'session',
      method: 'card_to_card',
      amount: data.price || 0,
      commissionAmount: 0,
      doctorAmount: data.price || 0,
      sourceTable: 'psy_sessions',
      sourceId: data.id,
      recordedBy: a.isOwner ? 'owner' : 'staff',
    })
  }
  return NextResponse.json({ session: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id, resource_id: _ignored, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  const { data: before } = await sb().from('psy_sessions').select('*').eq('id', id).eq('tenant_id', a.tenant.id).maybeSingle()

  let q = sb().from('psy_sessions').update(updates).eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data, error } = await q.select().single()
  if (error) { console.error('src/app/api/t/[slug]/panel/psy/sessions/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }

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
