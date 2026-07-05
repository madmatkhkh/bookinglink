import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { PSY_PRICING } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { case_number, phone, package_id, attendee, session_type, replace_session_id } = await req.json()

  const { data: booking } = await sb().from('psy_cases').select('resource_id, father_phone, mother_phone')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.father_phone !== phone && booking.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const type = session_type === 'online' ? 'online' : 'offline'
  const price = type === 'online' ? PSY_PRICING.sessionOnline : PSY_PRICING.sessionOffline

  const { count } = await sb().from('psy_sessions').select('id', { count: 'exact' })
    .eq('tenant_id', t.id).eq('case_number', case_number)
  const { data, error } = await sb().from('psy_sessions').insert([{
    tenant_id: t.id, resource_id: booking.resource_id, case_number, package_id: package_id || null,
    attendee: attendee || 'child', session_type: type,
    session_date: '', session_time: '', status: 'confirmed', paid: false, price,
    session_number: (count || 0) + 1,
  }]).select().single()
  if (error) { console.error('src/app/api/t/[slug]/psy/buy-session/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }

  if (replace_session_id) {
    await sb().from('psy_sessions').update({ status: 'replaced' })
      .eq('id', replace_session_id).eq('tenant_id', t.id).eq('case_number', case_number)
  }
  return NextResponse.json({ success: true, session: data })
}
