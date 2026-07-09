import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getPaymentMethods, effectivePaymentMethods, checkDiscountCode, redeemDiscountCode } from '@/lib/psy'
import { getClientPhone, getPayCase } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { package_id, session_id, stage_id, case_number, payment_ref, discount_code } = await req.json()
  // auth با کوکیِ امضاشده — نه شماره‌ای که کلاینت در body می‌فرستد. دو راهِ مجاز:
  // 1) کوکیِ مراجعِ OTPشده که شماره‌اش روی پرونده باشد (پنلِ /my)
  // 2) کوکیِ مجوزِ پرداختِ همین پرونده (فلوِ مصاحبه‌ی اولیه، درست بعد از ثبتِ فرم)
  const phone = getClientPhone(req)
  const grantedCase = getPayCase(req)

  const { data: booking } = await sb().from('psy_cases').select('resource_id, contact_phone, contact2_phone, current_stage_id')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking) return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })
  const viaPhone = !!phone && (booking.contact_phone === phone || booking.contact2_phone === phone)
  const viaGrant = !!grantedCase && grantedCase === case_number
  if (!viaPhone && !viaGrant)
    return NextResponse.json({ error: 'ابتدا با کدِ یک‌بارمصرف وارد شوید' }, { status: 401 })

  if (booking.resource_id) {
    const methods = effectivePaymentMethods(await getPaymentMethods(booking.resource_id), t.plan)
    if (!methods.card_to_card) return NextResponse.json({ error: 'پرداختِ کارت‌به‌کارت برای این مجموعه فعال نیست' }, { status: 400 })
  }

  // کدِ تخفیف (اختیاری) — قیمتِ ذخیره‌شده‌ی همان رکورد را قبل از ثبتِ ارجاعِ
  // پرداخت کم می‌کند؛ اصلِ قیمت برایِ حسابرسی در original_price می‌ماند.
  const bookingResourceId = booking.resource_id
  async function applyDiscount(table: 'psy_stages' | 'psy_sessions' | 'psy_packages', id: string, currentPrice: number) {
    if (!discount_code || !bookingResourceId) return
    const check = await checkDiscountCode(bookingResourceId, discount_code, currentPrice)
    if (!check.ok) return // کدِ نامعتبر را بی‌سروصدا نادیده می‌گیریم؛ اعتبارسنجیِ واقعی سمتِ کلاینت قبل از رسیدن به اینجا انجام می‌شود
    await sb().from(table).update({ price: check.discountedAmount, discount_code: check.code, original_price: currentPrice }).eq('id', id)
    await redeemDiscountCode(check.id)
  }

  if (stage_id) {
    if (booking.current_stage_id !== stage_id) return NextResponse.json({ error: 'این مرحله در دسترس نیست' }, { status: 400 })
    const { data: stage } = await sb().from('psy_stages').select('price').eq('id', stage_id).eq('tenant_id', t.id).maybeSingle()
    if (stage) await applyDiscount('psy_stages', stage_id, stage.price || 0)
    await sb().from('psy_stages').update({ payment_submitted: true, payment_ref: payment_ref || null, status: 'payment_submitted' })
      .eq('id', stage_id).eq('tenant_id', t.id).eq('case_number', case_number).eq('status', 'awaiting_payment')
    return NextResponse.json({ success: true })
  }
  if (session_id) {
    const { data: s } = await sb().from('psy_sessions').select('price').eq('id', session_id).eq('tenant_id', t.id).maybeSingle()
    if (s) await applyDiscount('psy_sessions', session_id, s.price || 0)
    await sb().from('psy_sessions').update({ payment_submitted: true, payment_ref: payment_ref || null })
      .eq('id', session_id).eq('tenant_id', t.id).eq('case_number', case_number)
    return NextResponse.json({ success: true })
  }
  const { data: pkg } = await sb().from('psy_packages').select('price').eq('id', package_id).eq('tenant_id', t.id).maybeSingle()
  if (pkg) await applyDiscount('psy_packages', package_id, pkg.price || 0)
  await sb().from('psy_packages').update({ payment_submitted: true, payment_ref: payment_ref || null })
    .eq('id', package_id).eq('tenant_id', t.id)
  return NextResponse.json({ success: true })
}
