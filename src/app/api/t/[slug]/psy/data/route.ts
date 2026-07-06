import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const case_number = req.nextUrl.searchParams.get('case_number')
  const phone = req.nextUrl.searchParams.get('phone')
  if (!case_number || !phone) return NextResponse.json({ error: 'ناقص' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases').select('*')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || (booking.father_phone !== phone && booking.mother_phone !== phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const [{ data: packages }, { data: sessions }, { data: stages }] = await Promise.all([
    sb().from('psy_packages').select('*').eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: false }),
    sb().from('psy_sessions').select('*').eq('tenant_id', t.id).eq('case_number', case_number).order('session_date', { ascending: true }),
    sb().from('psy_stages').select('*').eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: true }),
  ])
  return NextResponse.json({ booking, packages: packages || [], sessions: sessions || [], stages: stages || [] })
}
