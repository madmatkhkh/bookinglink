import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requireTenant, isTenantResponse } from '@/lib/tenant'
import { getClientPhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requireTenant(params.slug)
  if (isTenantResponse(t)) return t
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id, payment_ref } = await req.json()
  const { data: booking } = await sb().from('bookings').select('id, status')
    .eq('id', booking_id).eq('tenant_id', t.id).eq('client_phone', phone).single()
  if (!booking) return NextResponse.json({ error: 'رزرو یافت نشد' }, { status: 404 })
  if (booking.status !== 'pending_payment')
    return NextResponse.json({ error: 'این رزرو در حالتِ پرداخت نیست' }, { status: 400 })

  await sb().from('bookings')
    .update({ status: 'payment_submitted', payment_ref: String(payment_ref || '').slice(0, 60) })
    .eq('id', booking.id)
  return NextResponse.json({ success: true })
}
