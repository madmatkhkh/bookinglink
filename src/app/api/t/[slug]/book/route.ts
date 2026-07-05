import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requireTenant, isTenantResponse } from '@/lib/tenant'
import { getClientPhone } from '@/lib/auth'
import { findFreeResource } from '@/lib/slots'
import { toLatinNum, jalaliDateTimeToTimestamp } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requireTenant(params.slug)
  if (isTenantResponse(t)) return t
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا شماره‌ی خود را تایید کنید' }, { status: 401 })

  const { service_id, resource_id, date, time, client_name, client_note } = await req.json()
  const name = String(client_name || '').trim()
  if (!name) return NextResponse.json({ error: 'نام لازم است' }, { status: 400 })

  const { data: service } = await sb().from('services')
    .select('id, duration_minutes, mode, price').eq('id', service_id).eq('tenant_id', t.id).eq('is_active', true).single()
  if (!service) return NextResponse.json({ error: 'سرویس یافت نشد' }, { status: 404 })

  const dateStr = toLatinNum(String(date || '')), timeStr = toLatinNum(String(time || ''))
  const [jy, jm, jd] = dateStr.split('/').map(Number)
  if (!jy || !jm || !jd) return NextResponse.json({ error: 'تاریخ نامعتبر' }, { status: 400 })

  // منبعِ آزاد برای این ساعت پیدا کن (resource_id مشخص یا «هر منبع»)
  const reqResource = resource_id ? String(resource_id) : null
  const freeResource = await findFreeResource(t.id, service, dateStr, timeStr, reqResource)
  if (!freeResource)
    return NextResponse.json({ error: 'این ساعت دیگر خالی نیست؛ ساعتِ دیگری انتخاب کنید' }, { status: 409 })

  const booking_ts = jalaliDateTimeToTimestamp(dateStr, timeStr)!
  const { data, error } = await sb().from('bookings').insert({
    tenant_id: t.id, resource_id: freeResource, service_id: service.id,
    booking_date: dateStr, booking_time: timeStr, booking_ts,
    client_name: name, client_phone: phone,
    client_note: String(client_note || '').slice(0, 500),
    price_snapshot: service.price, status: 'pending_payment',
  }).select('id').single()

  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'این ساعت همین الان رزرو شد؛ ساعتِ دیگری انتخاب کنید' }, { status: 409 })
    console.error('book POST error:', error)
    return NextResponse.json({ error: 'مشکلی در ثبتِ رزرو پیش آمد. دوباره تلاش کنید.' }, { status: 500 })
  }

  const { data: profile } = await sb().from('tenant_profiles')
    .select('card_number, card_holder_name').eq('tenant_id', t.id).single()
  return NextResponse.json({
    success: true, booking_id: data.id, amount: service.price,
    card_number: profile?.card_number || '', card_holder_name: profile?.card_holder_name || '',
  })
}
