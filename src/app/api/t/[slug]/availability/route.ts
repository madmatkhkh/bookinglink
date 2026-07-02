import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requireTenant, isTenantResponse } from '@/lib/tenant'
import { computeDaySlots, computeMonthAvailability } from '@/lib/slots'
import { toLatinNum } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ?service=<id>&month=YYYY/MM  → تعدادِ اسلاتِ خالیِ هر روزِ ماه
// ?service=<id>&date=YYYY/MM/DD → لیستِ ساعت‌های خالیِ آن روز
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requireTenant(params.slug)
  if (isTenantResponse(t)) return t

  const serviceId = req.nextUrl.searchParams.get('service')
  if (!serviceId) return NextResponse.json({ error: 'service لازم است' }, { status: 400 })
  const { data: service } = await sb().from('services')
    .select('id, duration_minutes, mode').eq('id', serviceId).eq('tenant_id', t.id).eq('is_active', true).single()
  if (!service) return NextResponse.json({ error: 'سرویس یافت نشد' }, { status: 404 })

  const month = req.nextUrl.searchParams.get('month')
  if (month) {
    const [jy, jm] = toLatinNum(month).split('/').map(Number)
    if (!jy || !jm || jm < 1 || jm > 12) return NextResponse.json({ error: 'ماه نامعتبر' }, { status: 400 })
    const days = await computeMonthAvailability(t.id, service, jy, jm)
    return NextResponse.json({ days })
  }

  const date = req.nextUrl.searchParams.get('date')
  if (date) {
    const [jy, jm, jd] = toLatinNum(date).split('/').map(Number)
    if (!jy || !jm || !jd) return NextResponse.json({ error: 'تاریخ نامعتبر' }, { status: 400 })
    const slots = await computeDaySlots(t.id, service, jy, jm, jd)
    return NextResponse.json({ slots })
  }

  return NextResponse.json({ error: 'month یا date لازم است' }, { status: 400 })
}
