import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// پیام متخصص برای مراجع (دارو/تجویز/توصیه/عمومی) — کانال یک‌طرفه‌ای که در
// پنل مراجع، تب «پیام‌ها» دیده می‌شود. جدا از «یادداشت بالینی» (خصوصی) و جدا از
// «یادداشت برای مراجع» هر جلسه (که به یک جلسه گره خورده).
const VALID_KINDS = ['medication', 'prescription', 'recommendation', 'general']

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const case_number = req.nextUrl.searchParams.get('case_number')
  if (!case_number) return NextResponse.json({ error: 'ناقص' }, { status: 400 })
  let q = sb().from('psy_patient_messages').select('*').eq('tenant_id', a.tenant.id).eq('case_number', case_number).order('created_at', { ascending: false })
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data } = await q
  return NextResponse.json({ messages: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { case_number, kind, body } = await req.json()
  if (!case_number || !body?.trim()) return NextResponse.json({ error: 'متن پیام لازم است' }, { status: 400 })

  let caseQ = sb().from('psy_cases').select('resource_id').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)
  const { data: c } = await caseQ.maybeSingle()
  if (!c) return NextResponse.json({ error: 'پرونده یافت نشد یا دسترسی ندارید' }, { status: 404 })

  const { data, error } = await sb().from('psy_patient_messages').insert({
    tenant_id: a.tenant.id, case_number, resource_id: c.resource_id,
    kind: VALID_KINDS.includes(kind) ? kind : 'general',
    body: body.trim(),
  }).select().single()
  if (error) { console.error('psy/messages POST error:', error); return NextResponse.json({ error: 'ثبت پیام ناموفق بود' }, { status: 500 }) }
  return NextResponse.json({ message: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ناقص' }, { status: 400 })
  let q = sb().from('psy_patient_messages').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { error } = await q
  if (error) return NextResponse.json({ error: 'حذف نشد' }, { status: 500 })
  return NextResponse.json({ success: true })
}
