import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getPaymentMethods, effectivePaymentMethods, isCardToCardAllowed, getResourceProfile, isValidSheba, getResourcePricing, packageAmount, resolvePrice, checkDiscountCode } from '@/lib/psy'
import { requestZibalPayment, PLATFORM_COMMISSION_PERCENT, MULTIPLEXING_ENABLED } from '@/lib/zibal'
import { getClientPhone, getPayCase, matchesClientIdentity } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Purpose = 'stage' | 'package' | 'session'

// نقطه‌ی واحد برای شروع پرداخت آنلاین در همه‌ی مراحل (مصاحبه/ارزیابی/پروتکل/جلسه).
// موفقیت‌آمیز بودن پرداخت را callback تایید می‌کند و همان کاری را می‌کند که تایید
// دستی دکتر می‌کرد — یعنی مراجع بدون صبر برای تایید دکتر می‌تواند ادامه دهد.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const { case_number, purpose, ref_id, discount_code } = await req.json() as { case_number: string; purpose: Purpose; ref_id?: string; discount_code?: string }
  // auth با کوکی امضاشده — نه شماره‌ای که کلاینت در body می‌فرستد. دو راه مجاز:
  // 1) کوکی مراجع OTPشده که شماره‌اش روی پرونده باشد (پنل /my)
  // 2) کوکی مجوز پرداخت همین پرونده (فلو مصاحبه‌ی اولیه، درست بعد از ثبت فرم)
  const cookiePhone = getClientPhone(req)
  const grantedCase = getPayCase(req)

  const { data: c } = await sb().from('psy_cases')
    .select('id, resource_id, contact_phone, contact2_phone, contact_email, contact2_email, current_stage_id')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!c) return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })
  const viaPhone = !!cookiePhone && matchesClientIdentity(c, cookiePhone)
  const viaGrant = !!grantedCase && grantedCase === case_number
  if (!viaPhone && !viaGrant)
    return NextResponse.json({ error: 'ابتدا با کد یک‌بارمصرف وارد شوید' }, { status: 401 })
  // شماره برای درگاه (فیلد اختیاری mobile در زیبال) — از خود پرونده، نه ورودی کلاینت
  const phone = c.contact_phone
  if (!c.resource_id) return NextResponse.json({ error: 'منبعی برای این پرونده ثبت نشده' }, { status: 400 })

  const methods = effectivePaymentMethods(await getPaymentMethods(c.resource_id), await isCardToCardAllowed(t.id))
  if (!methods.online) return NextResponse.json({ error: 'پرداخت آنلاین برای این مجموعه فعال نیست' }, { status: 400 })

  let amount = 0
  let description = ''
  const resourcePricing = await getResourcePricing(c.resource_id)
  if (purpose === 'stage') {
    if (!ref_id || c.current_stage_id !== ref_id) return NextResponse.json({ error: 'این مرحله در دسترس نیست' }, { status: 400 })
    const { data: stage } = await sb().from('psy_stages').select('*').eq('id', ref_id).eq('tenant_id', t.id).single()
    if (!stage || stage.status !== 'awaiting_payment') return NextResponse.json({ error: 'این مرحله در حالت پرداخت نیست' }, { status: 400 })
    amount = stage.price || 0
    description = stage.stage_type === 'assessment' ? 'هزینه‌ی ارزیابی' : 'هزینه‌ی مصاحبه‌ی اولیه'
  } else if (purpose === 'package') {
    if (!ref_id) return NextResponse.json({ error: 'شناسه‌ی پروتکل لازم است' }, { status: 400 })
    const { data: pkg } = await sb().from('psy_packages').select('*').eq('id', ref_id).eq('tenant_id', t.id).eq('case_number', case_number).single()
    if (!pkg) return NextResponse.json({ error: 'پروتکل یافت نشد' }, { status: 404 })
    if (pkg.paid) return NextResponse.json({ error: 'قبلا پرداخت شده' }, { status: 400 })
    // ردیف‌های قدیمی ممکن است price ذخیره‌شده نداشته باشند (۰) — برای آن‌ها با
    // قیمت فعلی دکتر بازمحاسبه می‌شود؛ ردیف‌های تازه از روی price ذخیره‌شده‌ی خودشان می‌آیند.
    amount = pkg.price || packageAmount(pkg, resourcePricing)
    description = 'هزینه‌ی پروتکل درمان'
  } else if (purpose === 'session') {
    if (!ref_id) return NextResponse.json({ error: 'شناسه‌ی جلسه لازم است' }, { status: 400 })
    const { data: s } = await sb().from('psy_sessions').select('*').eq('id', ref_id).eq('tenant_id', t.id).eq('case_number', case_number).single()
    if (!s) return NextResponse.json({ error: 'جلسه یافت نشد' }, { status: 404 })
    if (s.paid) return NextResponse.json({ error: 'قبلا پرداخت شده' }, { status: 400 })
    amount = s.price || resolvePrice(s.session_type, resourcePricing)
    description = 'هزینه‌ی جلسه'
  } else {
    return NextResponse.json({ error: 'نوع پرداخت نامعتبر است' }, { status: 400 })
  }

  const originalAmount = amount
  let discountCodeCheck: Awaited<ReturnType<typeof checkDiscountCode>> | null = null
  if (discount_code) {
    discountCodeCheck = await checkDiscountCode(c.resource_id, discount_code, amount)
    if (discountCodeCheck.ok) amount = discountCodeCheck.discountedAmount
  }

  const commissionPercent = PLATFORM_COMMISSION_PERCENT
  const commissionAmount = Math.round(amount * (commissionPercent / 100))
  const profile = await getResourceProfile(c.resource_id)
  const shebaOk = isValidSheba(profile.settlement_sheba)
  const doctorAmount = amount - commissionAmount

  const { data: intent, error: intentErr } = await sb().from('psy_payment_intents').insert({
    tenant_id: t.id, resource_id: c.resource_id, case_number, phone, purpose, ref_id: ref_id || null, amount,
    commission_percent: commissionPercent, commission_amount: commissionAmount,
    settlement_sheba: shebaOk ? profile.settlement_sheba : null,
    ...(discountCodeCheck?.ok ? {
      discount_code_id: discountCodeCheck.id, discount_code: discountCodeCheck.code,
      discount_amount: discountCodeCheck.discountAmount, original_amount: originalAmount,
    } : {}),
  }).select().single()
  if (intentErr || !intent) return NextResponse.json({ error: 'خطا در ایجاد پرداخت' }, { status: 500 })

  const callbackUrl = `${req.nextUrl.origin}/api/t/${params.slug}/psy/pay-online/callback?intent=${intent.id}`
  const willSplit = MULTIPLEXING_ENABLED && shebaOk && doctorAmount > 0
  const result = await requestZibalPayment(
    amount, description, callbackUrl, phone,
    willSplit ? { sheba: profile.settlement_sheba, doctorAmountToman: doctorAmount } : undefined
  )
  if (!result.ok) {
    await sb().from('psy_payment_intents').update({ status: 'failed' }).eq('id', intent.id)
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  await sb().from('psy_payment_intents')
    .update({ authority: String(result.trackId), split_applied: willSplit }).eq('id', intent.id)
  return NextResponse.json({ success: true, url: result.url })
}
