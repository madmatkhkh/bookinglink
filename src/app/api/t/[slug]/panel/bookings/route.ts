import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SELECT = 'id, booking_date, booking_time, booking_ts, client_name, client_phone, status, payment_ref, price_snapshot, client_note, services(name, mode, duration_minutes)'

// ?scope=pending → منتظر تایید پرداخت | ?scope=upcoming → آینده‌ی زنده | ?date=YYYY/MM/DD → یک روز
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t

  const q = req.nextUrl.searchParams
  let query = sb().from('bookings').select(SELECT).eq('tenant_id', t.id)

  const date = q.get('date')
  if (date) query = query.eq('booking_date', date).order('booking_time')
  else if (q.get('scope') === 'pending')
    query = query.eq('status', 'payment_submitted').order('created_at', { ascending: false })
  else // upcoming
    query = query.in('status', ['pending_payment', 'payment_submitted', 'confirmed'])
      .gte('booking_ts', Date.now()).order('booking_ts')

  const { data } = await query.limit(200)
  return NextResponse.json({ bookings: data || [] })
}

// {id, action: confirm | reject | cancel | complete | no_show}
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t

  const { id, action } = await req.json()
  const { data: b } = await sb().from('bookings').select('id, status')
    .eq('id', id).eq('tenant_id', t.id).single()
  if (!b) return NextResponse.json({ error: 'رزرو یافت نشد' }, { status: 404 })

  let patch: Record<string, any> | null = null
  if (action === 'confirm' && b.status === 'payment_submitted') patch = { status: 'confirmed' }
  else if (action === 'reject' && b.status === 'payment_submitted') patch = { status: 'pending_payment', payment_ref: null }
  else if (action === 'cancel' && ['pending_payment', 'payment_submitted', 'confirmed'].includes(b.status)) patch = { status: 'cancelled' }
  else if (action === 'complete' && b.status === 'confirmed') patch = { status: 'completed' }
  else if (action === 'no_show' && b.status === 'confirmed') patch = { status: 'no_show' }
  if (!patch) return NextResponse.json({ error: 'این تغییر وضعیت مجاز نیست' }, { status: 400 })

  await sb().from('bookings').update(patch).eq('id', b.id)
  return NextResponse.json({ success: true })
}
