import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { verifyZibalPayment } from '@/lib/zibal'
import { recordLedgerEntry, LedgerPurpose } from '@/lib/ledger'
import { redeemDiscountCode } from '@/lib/psy'
import { activatePendingLocks, releaseLockBySlot, releaseLocks } from '@/lib/slotLocks'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// زیبال کاربر را با GET و trackId/success به همین آدرس برمی‌گرداند.
// موفقیت اینجا دقیقا همان کاری را می‌کند که تایید دستی دکتر در پنل می‌کرد —
// یعنی مرحله بدون نیاز به تایید دکتر جلو می‌رود.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  const q = req.nextUrl.searchParams
  const intentId = q.get('intent')
  const trackId = q.get('trackId')
  const success = q.get('success')
  const base = `${req.nextUrl.origin}/${params.slug}/my`

  if (!t || !intentId) return NextResponse.redirect(`${base}?payment=error`)

  const { data: intent } = await sb().from('psy_payment_intents').select('*').eq('id', intentId).eq('tenant_id', t.id).maybeSingle()
  if (!intent) return NextResponse.redirect(`${base}?payment=error`)

  // بدون phone/case در URL — صفحه‌ی /my آن‌ها را نمی‌خواند و شماره‌تلفن در URL
  // (تاریخچه‌ی مرورگر/لاگ‌ها) نشت می‌کرد
  const redirectBase = base

  // trackId باید مال همین intent باشد — وگرنه می‌شد با رسید یک پرداخت
  // ارزان دیگر (که واقعا paid است)، یک intent گران را نهایی کرد.
  // اگر authority اصلا ثبت نشده (update بعد request شکست خورده)، دیگر «رد شدن
  // از چک» مجاز نیست — intent بدون authority هرگز finalize نمی‌شود.
  if (!intent.authority || !trackId || String(intent.authority) !== String(trackId)) {
    if (success !== '1' || !trackId) {
      await sb().from('psy_payment_intents').update({ status: 'failed' }).eq('id', intentId)
      return NextResponse.redirect(`${redirectBase}?payment=cancelled`)
    }
    return NextResponse.redirect(`${redirectBase}?payment=error`)
  }

  if (success !== '1') {
    await sb().from('psy_payment_intents').update({ status: 'failed' }).eq('id', intentId)
    return NextResponse.redirect(`${redirectBase}?payment=cancelled`)
  }
  if (intent.status === 'paid') {
    // قبلا پردازش شده (مثلا کاربر رفرش کرده) — دوباره finalize نکن، فقط برگردان
    return NextResponse.redirect(`${redirectBase}?payment=success`)
  }

  const verify = await verifyZibalPayment(trackId)
  if (!verify.ok) {
    await sb().from('psy_payment_intents').update({ status: 'failed' }).eq('id', intentId)
    return NextResponse.redirect(`${redirectBase}?payment=failed`)
  }
  // دفاع دوم: مبلغ verifyشده‌ی زیبال (ریال) باید دقیقا همان مبلغ intent باشد
  // (پروژه تومان نگه می‌دارد → ×۱۰). اگر زیبال amount برنگرداند، به چک authority
  // بالا تکیه می‌کنیم؛ اگر برگرداند و نخواند، finalize نمی‌کنیم.
  if (verify.amountRial !== null && verify.amountRial !== Math.round((intent.amount || 0) * 10)) {
    console.error('zibal amount mismatch:', { intentId, expected: (intent.amount || 0) * 10, got: verify.amountRial })
    return NextResponse.redirect(`${redirectBase}?payment=error`)
  }

  const bankRef = verify.refNumber != null ? String(verify.refNumber) : null
  await sb().from('psy_payment_intents').update({ status: 'paid', bank_ref_number: bankRef }).eq('id', intentId)

  // ثبت در دفتر حساب — منبع حقیقت حسابداری. purpose از خود intent می‌آید؛
  // «stage» به interview/assessment ترجمه می‌شود چون ledger این دو را جدا نگه می‌دارد.
  let ledgerPurpose: LedgerPurpose = 'session'
  let stageCase: string | null = null
  if (intent.purpose === 'stage' && intent.ref_id) {
    const { data: st } = await sb().from('psy_stages').select('case_number, stage_type').eq('id', intent.ref_id).maybeSingle()
    stageCase = st?.case_number || null
    ledgerPurpose = st?.stage_type === 'assessment' ? 'assessment' : 'interview'
  } else if (intent.purpose === 'package') ledgerPurpose = 'package'
  else if (intent.purpose === 'session') ledgerPurpose = 'session'
  else if (intent.purpose === 'extra_charge') ledgerPurpose = 'extra_charge'

  await recordLedgerEntry({
    tenantId: t.id,
    resourceId: intent.resource_id || null,
    caseNumber: intent.case_number || stageCase,
    purpose: ledgerPurpose,
    method: 'online',
    amount: intent.amount || 0,
    commissionAmount: intent.commission_amount || 0,
    doctorAmount: (intent.amount || 0) - (intent.commission_amount || 0),
    sourceTable: 'psy_payment_intents',
    sourceId: intent.id,
    paymentIntentId: intent.id,
    splitApplied: intent.split_applied || false,
    bankRefNumber: bankRef,
    recordedBy: 'zibal_callback',
  })

  // finalize — دقیقا معادل تایید دستی دکتر برای همان نوع پرداخت
  const discountPatch = intent.discount_code_id
    ? { discount_code: intent.discount_code, original_price: intent.original_amount }
    : {}
  // پرداخت آنلاین مرحله: وقت را خود مراجع قبل از رفتن به درگاه انتخاب کرده و
  // روی intent نشسته — حالا که پرداخت تایید شد، همان وقت ثبت می‌شود (status =
  // booked) و مراجع دیگر کار دیگری ندارد.
  //
  // اگر در همان چند دقیقه‌ای که مراجع در صفحه‌ی زیبال بود کس دیگری همان ساعت را
  // گرفته باشد، unique index (migration 0019) update را با 23505 رد می‌کند. در
  // آن حالت پول پرداخت‌شده می‌ماند و مرحله به awaiting_booking می‌رود تا مراجع
  // فقط وقت دیگری انتخاب کند — هیچ پولی گم نمی‌شود و هیچ رزرو دوگانه‌ای هم ثبت
  // نمی‌شود. intentهای قدیمی (قبل از این تغییر) booking_date ندارند و همان
  // مسیر قدیمی awaiting_booking را می‌روند.
  let slotTakenFallback = false
  if (intent.purpose === 'stage' && intent.ref_id) {
    const wantsSlot = !!(intent.booking_date && intent.booking_time)
    let booked = false
    if (wantsSlot) {
      // قفل موقت این اسلات موقع رفتن به درگاه گرفته شده بود؛ حالا active می‌شود.
      await activatePendingLocks(t.id, intent.resource_id, intent.case_number, { table: 'psy_stages' })
      const { error: bookErr } = await sb().from('psy_stages').update({
        paid: true, status: 'booked', price: intent.amount,
        session_date: intent.booking_date, session_time: intent.booking_time,
        cancel_notice: null, ...discountPatch,
      }).eq('id', intent.ref_id).eq('tenant_id', t.id)
      if (!bookErr) booked = true
      else if ((bookErr as any).code === '23505') {
        // نباید رخ دهد (قفل داشتیم) ولی دفاع دولایه: اسلات را آزاد کن
        await releaseLockBySlot(t.id, intent.resource_id, { session_date: intent.booking_date, session_time: intent.booking_time })
        slotTakenFallback = true
      } else console.error('pay-online callback: stage book failed:', bookErr)
    }
    if (!booked) {
      await sb().from('psy_stages').update({ paid: true, status: 'awaiting_booking', price: intent.amount, ...discountPatch })
        .eq('id', intent.ref_id).eq('tenant_id', t.id)
    }
    const { data: stage } = await sb().from('psy_stages').select('case_number').eq('id', intent.ref_id).maybeSingle()
    if (stage) {
      await sb().from('psy_cases').update({ status: 'confirmed' }).eq('tenant_id', t.id).eq('case_number', stage.case_number).eq('status', 'pending')
    }
  } else if (intent.purpose === 'package' && intent.ref_id) {
    // پرداخت موفق پروتکل: قفل‌های موقت را active کن و جلسات واقعی را از
    // اسلات‌های ذخیره‌شده‌ی intent بساز (گزینه الف).
    await sb().from('psy_packages').update({ paid: true, price: intent.amount, ...discountPatch }).eq('id', intent.ref_id).eq('tenant_id', t.id)
    const slots = Array.isArray(intent.package_slots) ? intent.package_slots : []
    if (slots.length) {
      await activatePendingLocks(t.id, intent.resource_id, intent.case_number, { table: 'psy_sessions' })
      const { count } = await sb().from('psy_sessions').select('id', { count: 'exact' })
        .eq('tenant_id', t.id).eq('case_number', intent.case_number)
      const toInsert = slots.map((s: any, i: number) => ({
        tenant_id: t.id, resource_id: intent.resource_id, case_number: intent.case_number,
        package_id: intent.ref_id, session_number: (count || 0) + i + 1,
        session_date: s.session_date, session_time: s.session_time,
        session_type: s.session_type || null, attendee: s.attendee || 'primary',
        status: 'confirmed', paid: true, price: null,
      }))
      const { error: insErr } = await sb().from('psy_sessions').insert(toInsert)
      if (insErr) {
        // نباید رخ دهد (قفل داشتیم). لاگ کن؛ جلسات با «انتخاب روزهای جلسات»
        // قابل بازسازی‌اند و قفل‌ها active مانده‌اند تا جای کسی گرفته نشود.
        console.error('pay-online callback: package sessions insert failed:', insErr)
      }
    }
  } else if (intent.purpose === 'session' && intent.ref_id) {
    await sb().from('psy_sessions').update({ paid: true, price: intent.amount, ...discountPatch }).eq('id', intent.ref_id).eq('tenant_id', t.id)
  } else if (intent.purpose === 'extra_charge' && intent.ref_id) {
    await sb().from('psy_extra_charges').update({ status: 'paid' }).eq('id', intent.ref_id).eq('tenant_id', t.id)
  }
  if (intent.discount_code_id) await redeemDiscountCode(intent.discount_code_id)

  return NextResponse.redirect(`${redirectBase}?payment=${slotTakenFallback ? 'success_slot_taken' : 'success'}`)
}
