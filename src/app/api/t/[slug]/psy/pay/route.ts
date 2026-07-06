import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getPaymentMethods } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { package_id, session_id, stage_id, case_number, phone, payment_ref } = await req.json()

  const { data: booking } = await sb().from('psy_cases').select('resource_id, father_phone, mother_phone, current_stage_id')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.father_phone !== phone && booking.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  if (booking.resource_id) {
    const methods = await getPaymentMethods(booking.resource_id)
    if (!methods.card_to_card) return NextResponse.json({ error: 'پرداختِ کارت‌به‌کارت برای این مجموعه فعال نیست' }, { status: 400 })
  }

  if (stage_id) {
    if (booking.current_stage_id !== stage_id) return NextResponse.json({ error: 'این مرحله در دسترس نیست' }, { status: 400 })
    await sb().from('psy_stages').update({ payment_submitted: true, payment_ref: payment_ref || null, status: 'payment_submitted' })
      .eq('id', stage_id).eq('tenant_id', t.id).eq('case_number', case_number).eq('status', 'awaiting_payment')
    return NextResponse.json({ success: true })
  }
  if (session_id) {
    await sb().from('psy_sessions').update({ payment_submitted: true, payment_ref: payment_ref || null })
      .eq('id', session_id).eq('tenant_id', t.id).eq('case_number', case_number)
    return NextResponse.json({ success: true })
  }
  await sb().from('psy_packages').update({ payment_submitted: true, payment_ref: payment_ref || null })
    .eq('id', package_id).eq('tenant_id', t.id)
  return NextResponse.json({ success: true })
}
