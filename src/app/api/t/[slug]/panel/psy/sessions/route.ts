import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const q = req.nextUrl.searchParams
  const db = sb()

  if (q.get('pending')) {
    let query = db.from('psy_sessions').select('*').eq('tenant_id', a.tenant.id)
      .eq('payment_submitted', true).eq('paid', false).order('created_at', { ascending: false })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ sessions: data || [] })
  }
  if (q.get('refunds')) {
    let query = db.from('psy_sessions').select('*').eq('tenant_id', a.tenant.id)
      .eq('refund_status', 'pending').order('created_at', { ascending: false })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ sessions: data || [] })
  }
  if (q.get('all')) {
    let query = db.from('psy_sessions')
      .select('id, case_number, session_date, session_time, session_type, attendee, status, delay_minutes')
      .eq('tenant_id', a.tenant.id).neq('session_date', '').order('session_date', { ascending: true })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ sessions: data || [] })
  }
  const case_number = q.get('case_number')
  let query = db.from('psy_sessions').select('*')
    .eq('tenant_id', a.tenant.id).eq('case_number', case_number).order('created_at', { ascending: true })
  if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
  const { data } = await query
  return NextResponse.json({ sessions: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()

  // جلسه همیشه resource_id را از پرونده‌ی صاحبش به ارث می‌برد — نه از ورودیِ کاربر
  let caseQ = sb().from('psy_cases').select('resource_id').eq('tenant_id', a.tenant.id).eq('case_number', body.case_number)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)
  const { data: parentCase } = await caseQ.maybeSingle()
  if (!parentCase) return NextResponse.json({ error: 'پرونده یافت نشد یا دسترسی ندارید' }, { status: 404 })

  const count = await sb().from('psy_sessions').select('id', { count: 'exact' })
    .eq('tenant_id', a.tenant.id).eq('case_number', body.case_number)
  const { paid, resource_id: _ignored, ...rest } = body
  const { data } = await sb().from('psy_sessions').insert([{
    ...rest, tenant_id: a.tenant.id, resource_id: parentCase.resource_id,
    session_number: (count.count || 0) + 1,
    status: 'confirmed', paid: paid === true,
  }]).select().single()
  return NextResponse.json({ session: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id, resource_id: _ignored, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })
  let q = sb().from('psy_sessions').update(updates).eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data, error } = await q.select().single()
  if (error) { console.error('src/app/api/t/[slug]/panel/psy/sessions/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }
  return NextResponse.json({ session: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id } = await req.json()
  let q = sb().from('psy_sessions').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  await q
  return NextResponse.json({ success: true })
}
