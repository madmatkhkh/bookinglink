import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { requireModule } from '@/lib/modules'
import { getClientPhone, matchesClientIdentity } from '@/lib/auth'
import { jalaliDateTimeToTimestamp } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// مراجع فقط برای دکتری که واقعا نزدش جلسه‌ای داشته (تاریخ گذشته، نه صرفا
// رزروشده) می‌تواند نظر بگذارد — و فقط یک نظر برای هر دکتر (unique constraint
// دیتابیس هم همین را تضمین می‌کند). نظرها تا تایید دکتر برای عموم نمایش داده
// نمی‌شوند (status='pending' پیش‌فرض).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const gate = await requireModule(t.id, 'reviews')
  if (gate) return gate
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کد یک‌بارمصرف وارد شوید' }, { status: 401 })

  const { case_number, resource_id, rating, comment } = await req.json()
  const ratingNum = Number(rating)
  if (!case_number || !resource_id) return NextResponse.json({ error: 'ناقص' }, { status: 400 })
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5)
    return NextResponse.json({ error: 'امتیاز باید بین ۱ تا ۵ باشد' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases').select('contact_phone, contact2_phone, contact_email, contact2_email')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || !matchesClientIdentity(booking, phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  // چک: واقعا جلسه‌ی گذشته‌ای با این دکتر داشته (session یا stage held/booked با تاریخ گذشته)
  const db = sb()
  const [{ data: sessions }, { data: stages }] = await Promise.all([
    db.from('psy_sessions').select('session_date, session_time').eq('tenant_id', t.id).eq('case_number', case_number)
      .eq('resource_id', resource_id).eq('status', 'confirmed').neq('session_date', ''),
    db.from('psy_stages').select('session_date, session_time').eq('tenant_id', t.id).eq('case_number', case_number)
      .eq('resource_id', resource_id).eq('held', true).neq('session_date', ''),
  ])
  const hadPastSession = [...(sessions || []), ...(stages || [])].some(row => {
    const ts = jalaliDateTimeToTimestamp(row.session_date, row.session_time || '00:00')
    return ts !== null && ts < Date.now()
  })
  if (!hadPastSession)
    return NextResponse.json({ error: 'فقط بعد از برگزاری جلسه می‌توانید نظر بگذارید' }, { status: 403 })

  const { error } = await sb().from('psy_reviews').upsert({
    tenant_id: t.id, resource_id, case_number, rating: ratingNum, comment: String(comment || '').trim().slice(0, 500),
    status: 'pending',
  }, { onConflict: 'tenant_id,case_number,resource_id' })
  if (error) { console.error('psy/reviews POST error:', error); return NextResponse.json({ error: 'ثبت نظر ناموفق بود' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
