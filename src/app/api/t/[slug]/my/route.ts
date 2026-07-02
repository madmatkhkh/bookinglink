import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requireTenant, isTenantResponse } from '@/lib/tenant'
import { getClientPhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requireTenant(params.slug)
  if (isTenantResponse(t)) return t
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await sb().from('bookings')
    .select('id, booking_date, booking_time, booking_ts, status, price_snapshot, payment_ref, services(name, mode, duration_minutes)')
    .eq('tenant_id', t.id).eq('client_phone', phone)
    .order('booking_ts', { ascending: false }).limit(50)
  return NextResponse.json({ phone, bookings: data || [] })
}

// لغوِ رزرو توسطِ مراجع — فاز ۱: فقط رزروهای آینده، بدونِ سازوکارِ بازپرداخت
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requireTenant(params.slug)
  if (isTenantResponse(t)) return t
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id } = await req.json()
  const { data: b } = await sb().from('bookings').select('id, status, booking_ts')
    .eq('id', booking_id).eq('tenant_id', t.id).eq('client_phone', phone).single()
  if (!b) return NextResponse.json({ error: 'رزرو یافت نشد' }, { status: 404 })
  if (!['pending_payment', 'payment_submitted', 'confirmed'].includes(b.status))
    return NextResponse.json({ error: 'این رزرو قابلِ لغو نیست' }, { status: 400 })
  if (b.booking_ts <= Date.now())
    return NextResponse.json({ error: 'زمانِ این نوبت گذشته است' }, { status: 400 })

  await sb().from('bookings').update({ status: 'cancelled' }).eq('id', b.id)
  return NextResponse.json({ success: true })
}
