import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { STAGE_TYPES, STAGE_STATUS } from '@/lib/flow'
import { getResourcePricing, resolvePrice, redeemDiscountCodeByCode } from '@/lib/psy'
import { recordLedgerEntry } from '@/lib/ledger'
import { releaseLockBySlot } from '@/lib/slotLocks'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET ?case_number=X            → تاریخچه‌ی کامل مراحل یک پرونده
// GET ?pending=true             → همه‌ی مراحلی که منتظر تأیید پرداخت دکترند
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
      .select('id, case_number, stage_type, title, is_first, held, session_date, session_time, status, session_type, meet_channel, delay_minutes')
      .eq('tenant_id', a.tenant.id).neq('session_date', '').order('session_date', { ascending: true })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ stages: data || [] })
  }

  if (q.get('refunds')) {
    let query = sb().from('psy_stages').select('*').eq('tenant_id', a.tenant.id)
      .eq('refund_status', 'pending').order('created_at', { ascending: false })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ stages: (data || []).map(s => ({ ...s, _kind: 'stage' })) })
  }

  const case_number = q.get('case_number')
  if (!case_number) return NextResponse.json({ error: 'case_number لازم است' }, { status: 400 })
  let query = sb().from('psy_stages').select('*').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
    .order('created_at', { ascending: true })
  if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
  const { data } = await query
  return NextResponse.json({ stages: data || [] })
}

// POST → دکتر یک جلسه‌ی تازه برای پرونده تعریف می‌کند (مصاحبه/ارزیابی/دلخواه).
// این تنها مسیر «دادن جلسه به مراجع» است — مراجع در پنل خودش وارد چرخه‌ی
// «پرداخت → گرفتن وقت» می‌شود. فقط وقتی مجاز است که پرونده الان جلسه‌ی بازی
// نداشته باشد.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()
  const { case_number, stage_type, price } = body
  if (!case_number || !(STAGE_TYPES as readonly string[]).includes(stage_type))
    return NextResponse.json({ error: 'نوع جلسه نامعتبر است' }, { status: 400 })

  // عنوان فقط برای نوع دلخواه معنا دارد و در آن حالت اجباری است — وگرنه مرحله
  // بدون عنوان می‌ماند و در پنل مراجع برچسب عمومی «جلسه» می‌گیرد.
  const title = String(body.title || '').trim().slice(0, 60)
  if (stage_type === 'custom' && !title)
    return NextResponse.json({ error: 'برای جلسه‌ی دلخواه، عنوان لازم است' }, { status: 400 })

  let caseQ = sb().from('psy_cases').select('id, resource_id, current_stage_id, session_type').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)
  const { data: c } = await caseQ.maybeSingle()
  if (!c) return NextResponse.json({ error: 'پرونده یافت نشد یا دسترسی ندارید' }, { status: 404 })
  if (c.current_stage_id) return NextResponse.json({ error: 'این پرونده الان یک جلسه‌ی باز دیگر دارد — اول آن را تمام کنید' }, { status: 400 })

  // نوع این جلسه (آنلاین/حضوری) می‌تواند مستقل از نوع کلی پرونده باشد؛ اگر
  // فرستاده نشود، از نوع پرونده ارث می‌برد.
  const stSessionType = body.session_type === 'online' || body.session_type === 'offline' ? body.session_type : null
  const effectiveType = stSessionType || c.session_type

  const { data: stage, error } = await sb().from('psy_stages').insert({
    tenant_id: a.tenant.id, resource_id: c.resource_id, case_number, stage_type,
    title: stage_type === 'custom' ? title : null,
    session_type: stSessionType,
    price: typeof price === 'number' && price >= 0 ? price : resolvePrice(effectiveType, await getResourcePricing(c.resource_id)),
    status: STAGE_STATUS.AWAITING_PAYMENT,
  }).select().single()
  if (error || !stage) {
    console.error('panel/psy/stages POST error:', error)
    return NextResponse.json({ error: 'مشکلی در ثبت مرحله پیش آمد.' }, { status: 500 })
  }

  await sb().from('psy_cases').update({ current_stage_id: stage.id }).eq('id', c.id)
  return NextResponse.json({ success: true, stage })
}

// PATCH → تأیید/رد پرداخت، ثبت یادداشت، یا ثبت برگزاری مرحله (held)
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

  const ALLOWED = ['notes', 'session_date', 'session_time', 'cancel_notice', 'delay_minutes', 'refund_status', 'refund_ref']
  const patch: Record<string, any> = {}
  for (const k of ALLOWED) if (body[k] !== undefined) patch[k] = body[k]

  if (body.confirm_payment) {
    // پاک‌کردن صریح دلیل رد قبلی — وگرنه بعد از تایید نهایی هم پیام رد
    // قدیمی برای مراجع می‌ماند (باگ قبلی: با تایید پرداخت، پیام رد قبلی تازه
    // زیر «انتخاب زمان جدید» ظاهر می‌شد، چون هیچ‌جا پاک نمی‌شد).
    patch.paid = true; patch.status = STAGE_STATUS.AWAITING_BOOKING; patch.payment_reject_reason = null
  }
  if (body.reject_payment) {
    patch.paid = false; patch.payment_submitted = false; patch.status = STAGE_STATUS.AWAITING_PAYMENT
    // ستون اختصاصی — قبلا از cancel_notice استفاده می‌شد که مصرف دیگری هم
    // دارد (پیام لغو نوبت توسط مطب) و فقط زیر وضعیت awaiting_booking به
    // مراجع نشان داده می‌شد؛ یعنی دلیل رد پرداخت (که مرحله را به
    // awaiting_payment برمی‌گرداند) اصلا دیده نمی‌شد.
    patch.payment_reject_reason = body.reject_reason ? String(body.reject_reason).trim() : (stage.payment_reject_reason || null)
  }
  if (body.clear_booking) { patch.session_date = ''; patch.session_time = ''; patch.status = STAGE_STATUS.AWAITING_BOOKING; patch.delay_minutes = null }
  if (body.mark_held) patch.held = true

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'چیزی برای بروزرسانی نیست' }, { status: 400 })

  const { error } = await sb().from('psy_stages').update(patch).eq('id', id).eq('tenant_id', a.tenant.id)
  if (error) { console.error('panel/psy/stages PATCH error:', error); return NextResponse.json({ error: 'مشکلی در ذخیره‌ی تغییرات پیش آمد.' }, { status: 500 }) }

  // لغو نوبت توسط دکتر: اسلات آزادشده باید از slot_locks هم حذف شود تا واقعا
  // آزاد شود (وگرنه «قفل» می‌ماند و نه خود مراجع و نه کس دیگری نمی‌تواند بگیرد).
  if (body.clear_booking && stage.session_date && stage.session_time && stage.resource_id) {
    await releaseLockBySlot(a.tenant.id, stage.resource_id, { session_date: stage.session_date, session_time: stage.session_time })
  }

  // تأیید پرداخت اولین مرحله (همیشه مصاحبه) پرونده را از pending به confirmed می‌برد
  if (body.confirm_payment) {
    await sb().from('psy_cases').update({ status: 'confirmed' }).eq('tenant_id', a.tenant.id).eq('case_number', stage.case_number).eq('status', 'pending')
    // ثبت در دفتر حساب — پرداخت کارت‌به‌کارت مستقیم بین مراجع و دکتر است، سهم
    // پلتفرم = 0. idempotent: اگر قبلا ثبت شده (دابل‌کلیک) دوباره ثبت نمی‌شود.
    const freshEntry = await recordLedgerEntry({
      tenantId: a.tenant.id,
      resourceId: stage.resource_id || null,
      caseNumber: stage.case_number,
      purpose: 'stage',
      method: 'card_to_card',
      amount: stage.price || 0,
      commissionAmount: 0,
      doctorAmount: stage.price || 0,
      sourceTable: 'psy_stages',
      sourceId: stage.id,
      recordedBy: a.isOwner ? 'owner' : 'staff',
    })
    // مصرف کد تخفیف کارت‌به‌کارت این‌جا ثبت می‌شود (نه لحظه‌ی «ادعای» پرداخت
    // توسط مراجع در /psy/pay) — و فقط وقتی ثبت ledger تازه بود، تا تایید
    // تکراری/دابل‌کلیک دو بار used_count را بالا نبرد.
    if (freshEntry && stage.discount_code && stage.resource_id)
      await redeemDiscountCodeByCode(stage.resource_id, stage.discount_code)
  }

  // وقتی مرحله برگزار شد (held)، پرونده آزاد می‌شود تا دکتر مرحله‌ی بعد را مشخص کند
  if (body.mark_held) {
    await sb().from('psy_cases').update({ current_stage_id: null }).eq('tenant_id', a.tenant.id).eq('case_number', stage.case_number).eq('current_stage_id', id)
  }

  // ثبت بازپرداخت کنسلی مرحله وقتی نهایی می‌شود → ردیف outflow (پول برگشتی به مراجع)
  // هم‌فرمول با psy_sessions تا حساب‌ها یکدست بماند.
  if (body.refund_status === 'done' && stage.refund_status !== 'done') {
    const full = stage.price || 0
    const refundAmount = Math.round(full * (100 - (stage.refund_percent || 0)) / 100)
    if (refundAmount > 0) {
      await recordLedgerEntry({
        tenantId: a.tenant.id, resourceId: stage.resource_id || null, caseNumber: stage.case_number,
        purpose: 'refund', method: 'card_to_card', direction: 'outflow', amount: refundAmount,
        commissionAmount: 0, doctorAmount: refundAmount,
        sourceTable: 'psy_stages', sourceId: stage.id, note: `بازپرداخت ${stage.refund_percent || 0}٪`,
        recordedBy: a.isOwner ? 'owner' : 'staff',
      })
    }
  }
  return NextResponse.json({ success: true })
}

// DELETE → حذف کامل یک مرحله (مثلا اگر دکتر اشتباهی اضافه کرده بود)
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  let stageQ = sb().from('psy_stages').select('case_number').eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) stageQ = stageQ.eq('resource_id', a.resourceId)
  const { data: stage } = await stageQ.maybeSingle()
  if (!stage) return NextResponse.json({ error: 'یافت نشد یا دسترسی ندارید' }, { status: 404 })

  // اگر همین مرحله، مرحله‌ی جاری پرونده بود، پرونده هم آزاد شود
  await sb().from('psy_cases').update({ current_stage_id: null }).eq('tenant_id', a.tenant.id).eq('case_number', stage.case_number).eq('current_stage_id', id)
  const { error } = await sb().from('psy_stages').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (error) { console.error('panel/psy/stages DELETE error:', error); return NextResponse.json({ error: 'مشکلی در حذف پیش آمد.' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
