import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { verifyZibalPayment } from '@/lib/zibal'
import { recordLedgerEntry, LedgerPurpose } from '@/lib/ledger'
import { redeemDiscountCode } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// زیبال کاربر را با GET و trackId/success به همین آدرس برمی‌گرداند.
// موفقیت اینجا دقیقاً همان کاری را می‌کند که تاییدِ دستیِ دکتر در پنل می‌کرد —
// یعنی مرحله بدونِ نیاز به تاییدِ دکتر جلو می‌رود.
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

  // بدونِ phone/case در URL — صفحه‌ی /my آن‌ها را نمی‌خواند و شماره‌تلفن در URL
  // (تاریخچه‌ی مرورگر/لاگ‌ها) نشت می‌کرد
  const redirectBase = base

  // trackId باید مالِ همین intent باشد — وگرنه می‌شد با رسیدِ یک پرداختِ
  // ارزانِ دیگر (که واقعاً paid است)، یک intentِ گران را نهایی کرد
  if (intent.authority && trackId && String(intent.authority) !== String(trackId)) {
    return NextResponse.redirect(`${redirectBase}?payment=error`)
  }

  if (success !== '1' || !trackId) {
    await sb().from('psy_payment_intents').update({ status: 'failed' }).eq('id', intentId)
    return NextResponse.redirect(`${redirectBase}?payment=cancelled`)
  }
  if (intent.status === 'paid') {
    // قبلاً پردازش شده (مثلاً کاربر رفرش کرده) — دوباره finalize نکن، فقط برگردان
    return NextResponse.redirect(`${redirectBase}?payment=success`)
  }

  const verify = await verifyZibalPayment(trackId)
  if (!verify.ok) {
    await sb().from('psy_payment_intents').update({ status: 'failed' }).eq('id', intentId)
    return NextResponse.redirect(`${redirectBase}?payment=failed`)
  }

  await sb().from('psy_payment_intents').update({ status: 'paid' }).eq('id', intentId)

  // ثبت در دفترِ حساب — منبعِ حقیقتِ حسابداری. purpose از خودِ intent می‌آید؛
  // «stage» به interview/assessment ترجمه می‌شود چون ledger این دو را جدا نگه می‌دارد.
  let ledgerPurpose: LedgerPurpose = 'session'
  let stageCase: string | null = null
  if (intent.purpose === 'stage' && intent.ref_id) {
    const { data: st } = await sb().from('psy_stages').select('case_number, stage_type').eq('id', intent.ref_id).maybeSingle()
    stageCase = st?.case_number || null
    ledgerPurpose = st?.stage_type === 'assessment' ? 'assessment' : 'interview'
  } else if (intent.purpose === 'package') ledgerPurpose = 'package'
  else if (intent.purpose === 'session') ledgerPurpose = 'session'

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
    recordedBy: 'zibal_callback',
  })

  // finalize — دقیقاً معادلِ تاییدِ دستیِ دکتر برای همان نوع پرداخت
  const discountPatch = intent.discount_code_id
    ? { discount_code: intent.discount_code, original_price: intent.original_amount }
    : {}
  if (intent.purpose === 'stage' && intent.ref_id) {
    await sb().from('psy_stages').update({ paid: true, status: 'awaiting_booking', price: intent.amount, ...discountPatch }).eq('id', intent.ref_id).eq('tenant_id', t.id)
    const { data: stage } = await sb().from('psy_stages').select('case_number').eq('id', intent.ref_id).maybeSingle()
    if (stage) {
      await sb().from('psy_cases').update({ status: 'confirmed' }).eq('tenant_id', t.id).eq('case_number', stage.case_number).eq('status', 'pending')
    }
  } else if (intent.purpose === 'package' && intent.ref_id) {
    await sb().from('psy_packages').update({ paid: true, price: intent.amount, ...discountPatch }).eq('id', intent.ref_id).eq('tenant_id', t.id)
  } else if (intent.purpose === 'session' && intent.ref_id) {
    await sb().from('psy_sessions').update({ paid: true, price: intent.amount, ...discountPatch }).eq('id', intent.ref_id).eq('tenant_id', t.id)
  }
  if (intent.discount_code_id) await redeemDiscountCode(intent.discount_code_id)

  return NextResponse.redirect(`${redirectBase}?payment=success`)
}
