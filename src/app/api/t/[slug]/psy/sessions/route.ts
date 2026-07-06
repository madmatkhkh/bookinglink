import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getClientPhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { sessions } = await req.json()
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کدِ یک‌بارمصرف وارد شوید' }, { status: 401 })
  if (!sessions?.length) return NextResponse.json({ error: 'ناقص' }, { status: 400 })

  const case_number = sessions[0].case_number
  const { data: booking } = await sb().from('psy_cases').select('resource_id, father_phone, mother_phone')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.father_phone !== phone && booking.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const reqDates = Array.from(new Set(sessions.map((s: any) => s.session_date)))
  const db = sb()
  const [{ data: takenSessions }, { data: takenStages }] = await Promise.all([
    db.from('psy_sessions').select('session_date, session_time').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).in('session_date', reqDates),
    db.from('psy_stages').select('session_date, session_time').eq('tenant_id', t.id).eq('resource_id', booking.resource_id).in('session_date', reqDates),
  ])
  const takenSet = new Set<string>()
  for (const s of takenSessions || []) takenSet.add(`${s.session_date}|${s.session_time}`)
  for (const s of takenStages || []) if (s.session_date && s.session_time) takenSet.add(`${s.session_date}|${s.session_time}`)

  const clash = sessions.find((s: any) => takenSet.has(`${s.session_date}|${s.session_time}`))
  if (clash)
    return NextResponse.json({ error: `ساعت ${clash.session_time} در تاریخ ${clash.session_date} قبلاً رزرو شده.` }, { status: 409 })

  const { count } = await sb().from('psy_sessions').select('id', { count: 'exact' })
    .eq('tenant_id', t.id).eq('case_number', case_number)
  const toInsert = sessions.map((s: any, i: number) => ({
    ...s, tenant_id: t.id, resource_id: booking.resource_id, session_number: (count || 0) + i + 1, status: 'confirmed', paid: false,
  }))

  const { error } = await sb().from('psy_sessions').insert(toInsert)
  if (error) {
    if (error.code === '23505')
      return NextResponse.json({ error: 'این ساعت همین الان توسط فرد دیگری رزرو شد.' }, { status: 409 })
    console.error('psy/sessions POST error:', error)
    return NextResponse.json({ error: 'مشکلی در ثبتِ رزرو پیش آمد. دوباره تلاش کنید.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
