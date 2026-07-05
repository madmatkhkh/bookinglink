import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { FLOW } from '@/lib/flow'
import { getPaymentMethods } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { case_number, phone, stage, payment_ref } = await req.json()

  const { data: c } = await sb().from('psy_cases')
    .select('id, resource_id, father_phone, mother_phone, flow_status')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!c || (c.father_phone !== phone && c.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  if (c.resource_id) {
    const methods = await getPaymentMethods(c.resource_id)
    if (!methods.card_to_card) return NextResponse.json({ error: 'پرداختِ کارت‌به‌کارت برای این مجموعه فعال نیست' }, { status: 400 })
  }

  let patch: Record<string, any> = {}
  if (stage === 'interview') {
    if (c.flow_status !== FLOW.INTERVIEW_AWAITING_PAYMENT)
      return NextResponse.json({ error: 'این مرحله در حالتِ پرداخت نیست' }, { status: 400 })
    patch = { flow_status: FLOW.INTERVIEW_PAYMENT_SUBMITTED, interview_payment_ref: payment_ref || null }
  } else if (stage === 'assessment') {
    if (c.flow_status !== FLOW.ASSESSMENT_AWAITING_PAYMENT)
      return NextResponse.json({ error: 'این مرحله در حالتِ پرداخت نیست' }, { status: 400 })
    patch = { flow_status: FLOW.ASSESSMENT_PAYMENT_SUBMITTED, assessment_payment_ref: payment_ref || null }
  } else {
    return NextResponse.json({ error: 'مرحله نامعتبر است' }, { status: 400 })
  }

  const { error } = await sb().from('psy_cases').update(patch).eq('id', c.id).eq('tenant_id', t.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
