import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { getNiche } from '@/lib/niche'
import { normalizePhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET ?phone=… → پرونده‌ی یک مشتری + تعریف فیلدهای نیچ
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const phone = normalizePhone(req.nextUrl.searchParams.get('phone') || '')
  const niche = await getNiche(t.niche_key)
  const fields = niche?.record_fields || []
  if (!phone) return NextResponse.json({ fields, record: null })

  const { data: record } = await sb().from('client_records').select('*')
    .eq('tenant_id', t.id).eq('client_phone', phone).single()
  // تاریخچه‌ی نوبت‌های همین مشتری هم مفید است
  const { data: history } = await sb().from('bookings')
    .select('id, booking_date, booking_time, status, services(name)')
    .eq('tenant_id', t.id).eq('client_phone', phone)
    .order('booking_ts', { ascending: false }).limit(50)
  return NextResponse.json({ fields, record: record || null, history: history || [] })
}

// PUT {phone, name, data} → ذخیره‌ی پرونده (select-then-update/insert، بدون اتکا به upsert)
export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const body = await req.json()
  const phone = normalizePhone(body.phone || '')
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره نامعتبر' }, { status: 400 })

  const patch = {
    client_name: String(body.name || '').trim().slice(0, 60),
    data: typeof body.data === 'object' && body.data ? body.data : {},
    updated_at: new Date().toISOString(),
  }
  const { data: existing } = await sb().from('client_records').select('id')
    .eq('tenant_id', t.id).eq('client_phone', phone).single()
  if (existing) {
    await sb().from('client_records').update(patch).eq('id', existing.id)
  } else {
    await sb().from('client_records').insert({ tenant_id: t.id, client_phone: phone, ...patch })
  }
  return NextResponse.json({ success: true })
}
