import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { FLOW } from '@/lib/flow'
import { verifyZarinpalPayment } from '@/lib/zarinpal'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// زرین‌پال کاربر را با GET و Authority/Status به همین آدرس برمی‌گرداند.
// موفقیت اینجا دقیقاً همان کاری را می‌کند که تاییدِ دستیِ دکتر در پنل می‌کرد —
// یعنی مرحله بدونِ نیاز به تاییدِ دکتر جلو می‌رود.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  const q = req.nextUrl.searchParams
  const intentId = q.get('intent')
  const authority = q.get('Authority')
  const status = q.get('Status')
  const base = `${req.nextUrl.origin}/${params.slug}/my`

  if (!t || !intentId) return NextResponse.redirect(`${base}?payment=error`)

  const { data: intent } = await sb().from('psy_payment_intents').select('*').eq('id', intentId).eq('tenant_id', t.id).maybeSingle()
  if (!intent) return NextResponse.redirect(`${base}?payment=error`)

  const redirectBase = `${base}?phone=${encodeURIComponent(intent.phone)}&case=${encodeURIComponent(intent.case_number)}`

  if (status !== 'OK' || !authority) {
    await sb().from('psy_payment_intents').update({ status: 'failed' }).eq('id', intentId)
    return NextResponse.redirect(`${redirectBase}&payment=cancelled`)
  }
  if (intent.status === 'paid') {
    // قبلاً پردازش شده (مثلاً کاربر رفرش کرده) — دوباره finalize نکن، فقط برگردان
    return NextResponse.redirect(`${redirectBase}&payment=success`)
  }

  const verify = await verifyZarinpalPayment(intent.amount, authority)
  if (!verify.ok) {
    await sb().from('psy_payment_intents').update({ status: 'failed' }).eq('id', intentId)
    return NextResponse.redirect(`${redirectBase}&payment=failed`)
  }

  await sb().from('psy_payment_intents').update({ status: 'paid' }).eq('id', intentId)

  // finalize — دقیقاً معادلِ تاییدِ دستیِ دکتر برای همان نوع پرداخت
  if (intent.purpose === 'interview') {
    const { data: c } = await sb().from('psy_cases').select('id').eq('tenant_id', t.id).eq('case_number', intent.case_number).maybeSingle()
    if (c) await sb().from('psy_cases').update({ flow_status: FLOW.INTERVIEW_AWAITING_BOOKING, interview_paid: true, status: 'confirmed' }).eq('id', c.id)
  } else if (intent.purpose === 'assessment') {
    const { data: c } = await sb().from('psy_cases').select('id').eq('tenant_id', t.id).eq('case_number', intent.case_number).maybeSingle()
    if (c) await sb().from('psy_cases').update({ flow_status: FLOW.ASSESSMENT_AWAITING_BOOKING, assessment_paid: true }).eq('id', c.id)
  } else if (intent.purpose === 'package' && intent.ref_id) {
    await sb().from('psy_packages').update({ paid: true }).eq('id', intent.ref_id).eq('tenant_id', t.id)
  } else if (intent.purpose === 'session' && intent.ref_id) {
    await sb().from('psy_sessions').update({ paid: true }).eq('id', intent.ref_id).eq('tenant_id', t.id)
  }

  return NextResponse.redirect(`${redirectBase}&payment=success`)
}
