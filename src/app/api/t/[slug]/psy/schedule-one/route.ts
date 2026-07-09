import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { validateClientSlot } from '@/lib/psy'
import { getClientPhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { session_id, case_number, session_date, session_time } = await req.json()
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کدِ یک‌بارمصرف وارد شوید' }, { status: 401 })
  if (!session_id || !session_date || !session_time) return NextResponse.json({ error: 'ناقص' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases').select('resource_id, contact_phone, contact2_phone')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.contact_phone !== phone && booking.contact2_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const { data: session } = await sb().from('psy_sessions').select('*')
    .eq('id', session_id).eq('tenant_id', t.id).single()
  if (!session || session.case_number !== case_number) return NextResponse.json({ error: 'جلسه یافت نشد' }, { status: 404 })
  if (session.status !== 'confirmed') return NextResponse.json({ error: 'این جلسه قابل زمان‌بندی نیست' }, { status: 400 })
  if (!session.paid) return NextResponse.json({ error: 'ابتدا باید هزینه‌ی این جلسه پرداخت شود' }, { status: 400 })

  // اعتبارسنجیِ سمتِ سرور: زمان در آینده + جزوِ برنامه‌ی منتشرشده‌ی همان دکتر
  const slotOk = await validateClientSlot(t.id, booking.resource_id, session_date, session_time)
  if (!slotOk.ok) return NextResponse.json({ error: slotOk.error }, { status: 400 })

  const db = sb()
  const [{ data: takenS }, { data: takenSt }] = await Promise.all([
    db.from('psy_sessions').select('id').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).eq('session_date', session_date).eq('session_time', session_time).neq('id', session_id),
    db.from('psy_stages').select('id').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).eq('session_date', session_date).eq('session_time', session_time),
  ])
  if ((takenS && takenS.length > 0) || (takenSt && takenSt.length > 0))
    return NextResponse.json({ error: 'این ساعت قبلاً رزرو شده. لطفاً زمان دیگری انتخاب کنید.' }, { status: 409 })

  const { error } = await sb().from('psy_sessions').update({ session_date, session_time }).eq('id', session_id)
  if (error) {
    if ((error as any).code === '23505')
      return NextResponse.json({ error: 'این ساعت همین الان توسطِ شخصِ دیگری رزرو شد. لطفاً زمان دیگری انتخاب کنید.' }, { status: 409 })
    console.error('src/app/api/t/[slug]/psy/schedule-one/route.ts error:', error)
    return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
