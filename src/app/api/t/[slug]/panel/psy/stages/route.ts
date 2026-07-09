import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { STAGE_TYPES, STAGE_STATUS } from '@/lib/flow'
import { getResourcePricing, resolvePrice, redeemDiscountCodeByCode } from '@/lib/psy'
import { recordLedgerEntry } from '@/lib/ledger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET ?case_number=X            → تاریخچه‌ی کاملِ مراحلِ یک پرونده
// GET ?pending=true             → همه‌ی مراحلی که منتظرِ تأییدِ پرداختِ دکترند
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const q = req.nextUrl.searchParams

  if (q.get('pending')) {
    let query = sb().from('psy_stages').select('*').eq('tenant_id', a.tenant.id)
      .eq('status', STAGE_STATUS.PAYMENT_SUBMITTED).order('created_at', { ascending: false })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ stages: data || [] })
  }

  if (q.get('all')) {
    let query = sb().from('psy_stages')
      .select('id, case_number, stage_type, session_date, session_time, status, delay_minutes')
      .eq('tenant_id', a.tenant.id).neq('session_date', '').order('session_date', { ascending: true })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ stages: data || [] })
  }

  const case_number = q.get('case_number')
  if (!case_number) return NextResponse.json({ error: 'case_number لازم است' }, { status: 400 })
  let query = sb().from('psy_stages').select('*').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
    .order('created_at', { ascending: true })
  if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
  const { data } = await query
  return NextResponse.json({ stages: data || [] })
}

// POST → دکتر یک مرحله‌ی تازه برای پرونده تعریف می‌کند (مصاحبه‌ی دیگر/ارزیابی).
// فقط وقتی مجاز است که پرونده الان مرحله‌ی «در جریان»ی نداشته باشد.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()
  const { case_number, stage_type, price } = body
  if (!case_number || !(STAGE_TYPES as readonly string[]).includes(stage_type))
    return NextResponse.json({ error: 'نوعِ مرحله نامعتبر است' }, { status: 400 })

  let caseQ = sb().from('psy_cases').select('id, resource_id, current_stage_id, session_type').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)
  const { data: c } = await caseQ.maybeSingle()
  if (!c) return NextResponse.json({ error: 'پرونده یافت نشد یا دسترسی ندارید' }, { status: 404 })
  if (c.current_stage_id) return NextResponse.json({ error: 'این پرونده الان یک مرحله‌ی بازِ دیگر دارد — اول آن را تمام کنید' }, { status: 400 })

  const { data: stage, error } = await sb().from('psy_stages').insert({
    tenant_id: a.tenant.id, resource_id: c.resource_id, case_number, stage_type,
    price: typeof price === 'number' && price >= 0 ? price : resolvePrice(c.session_type, await getResourcePricing(c.resource_id)),
    status: STAGE_STATUS.AWAITING_PAYMENT,
  }).select().single()
  if (error || !stage) {
    console.error('panel/psy/stages POST error:', error)
    return NextResponse.json({ error: 'مشکلی در ثبتِ مرحله پیش آمد.' }, { status: 500 })
  }

  await sb().from('psy_cases').update({ current_stage_id: stage.id }).eq('id', c.id)
  return NextResponse.json({ success: true, stage })
}

// PATCH → تأیید/ردِ پرداخت، ثبتِ یادداشت، یا ثبتِ برگزاریِ مرحله (held)
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  let stageQ = sb().from('psy_stages').select('*').eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) stageQ = stageQ.eq('resource_id', a.resourceId)
  const { data: stage } = await stageQ.maybeSingle()
  if (!stage) return NextResponse.json({ error: 'مرحله یافت نشد یا دسترسی ندارید' }, { status: 404 })

  const ALLOWED = ['notes', 'session_date', 'session_time', 'cancel_notice', 'delay_minutes']
  const patch: Record<string, any> = {}
  for (const k of ALLOWED) if (body[k] !== undefined) patch[k] = body[k]

  if (body.confirm_payment) { patch.paid = true; patch.status = STAGE_STATUS.AWAITING_BOOKING }
  if (body.reject_payment) {
    patch.paid = false; patch.payment_submitted = false; patch.status = STAGE_STATUS.AWAITING_PAYMENT
    patch.cancel_notice = body.reject_reason ? `پرداخت تأیید نشد: ${body.reject_reason}` : (stage.cancel_notice || null)
  }
  if (body.clear_booking) { patch.session_date = ''; patch.session_time = ''; patch.status = STAGE_STATUS.AWAITING_BOOKING }
  if (body.mark_held) patch.held = true

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'چیزی برای بروزرسانی نیست' }, { status: 400 })

  const { error } = await sb().from('psy_stages').update(patch).eq('id', id).eq('tenant_id', a.tenant.id)
  if (error) { console.error('panel/psy/stages PATCH error:', error); return NextResponse.json({ error: 'مشکلی در ذخیره‌ی تغییرات پیش آمد.' }, { status: 500 }) }

  // تأییدِ پرداختِ اولین مرحله (همیشه مصاحبه) پرونده را از pending به confirmed می‌برد
  if (body.confirm_payment) {
    await sb().from('psy_cases').update({ status: 'confirmed' }).eq('tenant_id', a.tenant.id).eq('case_number', stage.case_number).eq('status', 'pending')
    // ثبت در دفترِ حساب — پرداختِ کارت‌به‌کارت مستقیم بینِ مراجع و دکتر است، سهمِ
    // پلتفرم = 0. idempotent: اگر قبلاً ثبت شده (دابل‌کلیک) دوباره ثبت نمی‌شود.
    const freshEntry = await recordLedgerEntry({
      tenantId: a.tenant.id,
      resourceId: stage.resource_id || null,
      caseNumber: stage.case_number,
      purpose: stage.stage_type === 'assessment' ? 'assessment' : 'interview',
      method: 'card_to_card',
      amount: stage.price || 0,
      commissionAmount: 0,
      doctorAmount: stage.price || 0,
      sourceTable: 'psy_stages',
      sourceId: stage.id,
      recordedBy: a.isOwner ? 'owner' : 'staff',
    })
    // مصرفِ کدِ تخفیفِ کارت‌به‌کارت این‌جا ثبت می‌شود (نه لحظه‌ی «ادعای» پرداخت
    // توسطِ مراجع در /psy/pay) — و فقط وقتی ثبتِ ledger تازه بود، تا تاییدِ
    // تکراری/دابل‌کلیک دو بار used_count را بالا نبرد.
    if (freshEntry && stage.discount_code && stage.resource_id)
      await redeemDiscountCodeByCode(stage.resource_id, stage.discount_code)
  }

  // وقتی مرحله برگزار شد (held)، پرونده آزاد می‌شود تا دکتر مرحله‌ی بعد را مشخص کند
  if (body.mark_held) {
    await sb().from('psy_cases').update({ current_stage_id: null }).eq('tenant_id', a.tenant.id).eq('case_number', stage.case_number).eq('current_stage_id', id)
  }
  return NextResponse.json({ success: true })
}

// DELETE → حذفِ کاملِ یک مرحله (مثلاً اگر دکتر اشتباهی اضافه کرده بود)
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  let stageQ = sb().from('psy_stages').select('case_number').eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) stageQ = stageQ.eq('resource_id', a.resourceId)
  const { data: stage } = await stageQ.maybeSingle()
  if (!stage) return NextResponse.json({ error: 'یافت نشد یا دسترسی ندارید' }, { status: 404 })

  // اگر همین مرحله، مرحله‌ی جاریِ پرونده بود، پرونده هم آزاد شود
  await sb().from('psy_cases').update({ current_stage_id: null }).eq('tenant_id', a.tenant.id).eq('case_number', stage.case_number).eq('current_stage_id', id)
  const { error } = await sb().from('psy_stages').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (error) { console.error('panel/psy/stages DELETE error:', error); return NextResponse.json({ error: 'مشکلی در حذف پیش آمد.' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
