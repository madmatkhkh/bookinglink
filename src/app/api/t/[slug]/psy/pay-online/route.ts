import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { FLOW } from '@/lib/flow'
import { PSY_PRICING, getPaymentMethods } from '@/lib/psy'
import { requestZarinpalPayment } from '@/lib/zarinpal'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Purpose = 'interview' | 'assessment' | 'package' | 'session'

function pkgAmount(p: any): number {
  return (p.child_sessions * (p.child_session_type === 'online' ? PSY_PRICING.sessionOnline : PSY_PRICING.sessionOffline))
    + (p.parent_sessions * (p.parent_session_type === 'online' ? PSY_PRICING.sessionOnline : PSY_PRICING.sessionOffline))
}

// نقطه‌ی واحد برای شروعِ پرداختِ آنلاین در همه‌ی مراحل (مصاحبه/ارزیابی/پروتکل/جلسه).
// موفقیت‌آمیز بودنِ پرداخت را callback تایید می‌کند و همان کاری را می‌کند که تاییدِ
// دستیِ دکتر می‌کرد — یعنی مراجع بدونِ صبر برای تاییدِ دکتر می‌تواند ادامه دهد.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const { case_number, phone, purpose, ref_id } = await req.json() as { case_number: string; phone: string; purpose: Purpose; ref_id?: string }

  const { data: c } = await sb().from('psy_cases')
    .select('id, resource_id, father_phone, mother_phone, flow_status, interview_price, assessment_price')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!c || (c.father_phone !== phone && c.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })
  if (!c.resource_id) return NextResponse.json({ error: 'منبعی برای این پرونده ثبت نشده' }, { status: 400 })

  const methods = await getPaymentMethods(c.resource_id)
  if (!methods.online) return NextResponse.json({ error: 'پرداختِ آنلاین برای این مجموعه فعال نیست' }, { status: 400 })

  let amount = 0
  let description = ''
  if (purpose === 'interview') {
    if (c.flow_status !== FLOW.INTERVIEW_AWAITING_PAYMENT)
      return NextResponse.json({ error: 'این مرحله در حالتِ پرداخت نیست' }, { status: 400 })
    amount = c.interview_price || PSY_PRICING.interview
    description = 'هزینه‌ی مصاحبه‌ی اولیه'
  } else if (purpose === 'assessment') {
    if (c.flow_status !== FLOW.ASSESSMENT_AWAITING_PAYMENT)
      return NextResponse.json({ error: 'این مرحله در حالتِ پرداخت نیست' }, { status: 400 })
    amount = c.assessment_price || PSY_PRICING.assessment
    description = 'هزینه‌ی ارزیابی'
  } else if (purpose === 'package') {
    if (!ref_id) return NextResponse.json({ error: 'شناسه‌ی پروتکل لازم است' }, { status: 400 })
    const { data: pkg } = await sb().from('psy_packages').select('*').eq('id', ref_id).eq('tenant_id', t.id).eq('case_number', case_number).single()
    if (!pkg) return NextResponse.json({ error: 'پروتکل یافت نشد' }, { status: 404 })
    if (pkg.paid) return NextResponse.json({ error: 'قبلاً پرداخت شده' }, { status: 400 })
    amount = pkgAmount(pkg)
    description = 'هزینه‌ی پروتکلِ درمان'
  } else if (purpose === 'session') {
    if (!ref_id) return NextResponse.json({ error: 'شناسه‌ی جلسه لازم است' }, { status: 400 })
    const { data: s } = await sb().from('psy_sessions').select('*').eq('id', ref_id).eq('tenant_id', t.id).eq('case_number', case_number).single()
    if (!s) return NextResponse.json({ error: 'جلسه یافت نشد' }, { status: 404 })
    if (s.paid) return NextResponse.json({ error: 'قبلاً پرداخت شده' }, { status: 400 })
    amount = s.price || PSY_PRICING.sessionOffline
    description = 'هزینه‌ی جلسه'
  } else {
    return NextResponse.json({ error: 'نوعِ پرداخت نامعتبر است' }, { status: 400 })
  }

  const { data: intent, error: intentErr } = await sb().from('psy_payment_intents').insert({
    tenant_id: t.id, resource_id: c.resource_id, case_number, phone, purpose, ref_id: ref_id || null, amount,
  }).select().single()
  if (intentErr || !intent) return NextResponse.json({ error: 'خطا در ایجادِ پرداخت' }, { status: 500 })

  const callbackUrl = `${req.nextUrl.origin}/api/t/${params.slug}/psy/pay-online/callback?intent=${intent.id}`
  const result = await requestZarinpalPayment(amount, description, callbackUrl, phone)
  if (!result.ok) {
    await sb().from('psy_payment_intents').update({ status: 'failed' }).eq('id', intent.id)
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  await sb().from('psy_payment_intents').update({ authority: result.authority }).eq('id', intent.id)
  return NextResponse.json({ success: true, url: result.url })
}
