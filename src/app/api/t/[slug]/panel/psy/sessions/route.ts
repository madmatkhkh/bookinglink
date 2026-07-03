import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const q = req.nextUrl.searchParams
  const db = sb()
  if (q.get('pending')) {
    const { data } = await db.from('psy_sessions').select('*').eq('tenant_id', t.id)
      .eq('payment_submitted', true).eq('paid', false).order('created_at', { ascending: false })
    return NextResponse.json({ sessions: data || [] })
  }
  if (q.get('refunds')) {
    const { data } = await db.from('psy_sessions').select('*').eq('tenant_id', t.id)
      .eq('refund_status', 'pending').order('created_at', { ascending: false })
    return NextResponse.json({ sessions: data || [] })
  }
  if (q.get('all')) {
    const { data } = await db.from('psy_sessions')
      .select('id, case_number, session_date, session_time, session_type, attendee, status')
      .eq('tenant_id', t.id).neq('session_date', '').order('session_date', { ascending: true })
    return NextResponse.json({ sessions: data || [] })
  }
  const case_number = q.get('case_number')
  const { data } = await db.from('psy_sessions').select('*')
    .eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: true })
  return NextResponse.json({ sessions: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const body = await req.json()
  const count = await sb().from('psy_sessions').select('id', { count: 'exact' })
    .eq('tenant_id', t.id).eq('case_number', body.case_number)
  const { paid, ...rest } = body
  const { data } = await sb().from('psy_sessions').insert([{
    ...rest, tenant_id: t.id,
    session_number: (count.count || 0) + 1,
    status: 'confirmed', paid: paid === true,
  }]).select().single()
  return NextResponse.json({ session: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })
  const { data, error } = await sb().from('psy_sessions').update(updates)
    .eq('id', id).eq('tenant_id', t.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { id } = await req.json()
  await sb().from('psy_sessions').delete().eq('id', id).eq('tenant_id', t.id)
  return NextResponse.json({ success: true })
}
