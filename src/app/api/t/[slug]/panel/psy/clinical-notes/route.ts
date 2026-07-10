import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// یادداشت بالینی ساختاریافته (SOAP/DAP) — کاملا خصوصی، هیچ‌جا به مراجع
// نمایش داده نمی‌شود (جدا از doctor_note_for_patient که برای خود اوست).
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const case_number = req.nextUrl.searchParams.get('case_number')
  if (!case_number) return NextResponse.json({ error: 'ناقص' }, { status: 400 })
  let q = sb().from('psy_clinical_notes').select('*').eq('tenant_id', a.tenant.id).eq('case_number', case_number).order('created_at', { ascending: false })
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data } = await q
  return NextResponse.json({ notes: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()
  const { case_number, session_id, stage_id, format, fields } = body
  if (!case_number || !['soap', 'dap', 'freeform'].includes(format))
    return NextResponse.json({ error: 'ناقص' }, { status: 400 })

  let caseQ = sb().from('psy_cases').select('resource_id').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)
  const { data: c } = await caseQ.maybeSingle()
  if (!c) return NextResponse.json({ error: 'پرونده یافت نشد یا دسترسی ندارید' }, { status: 404 })

  const { data, error } = await sb().from('psy_clinical_notes').insert({
    tenant_id: a.tenant.id, case_number, resource_id: c.resource_id,
    session_id: session_id || null, stage_id: stage_id || null,
    format, fields: fields && typeof fields === 'object' ? fields : {},
  }).select().single()
  if (error) { console.error('psy/clinical-notes POST error:', error); return NextResponse.json({ error: 'ثبت ناموفق بود' }, { status: 500 }) }
  return NextResponse.json({ note: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id, fields, format } = await req.json()
  if (!id) return NextResponse.json({ error: 'ناقص' }, { status: 400 })
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  if (fields && typeof fields === 'object') patch.fields = fields
  if (['soap', 'dap', 'freeform'].includes(format)) patch.format = format
  let q = sb().from('psy_clinical_notes').update(patch).eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { error } = await q
  if (error) return NextResponse.json({ error: 'بروزرسانی ناموفق بود' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id } = await req.json()
  let q = sb().from('psy_clinical_notes').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { error } = await q
  if (error) return NextResponse.json({ error: 'حذف نشد' }, { status: 500 })
  return NextResponse.json({ success: true })
}
