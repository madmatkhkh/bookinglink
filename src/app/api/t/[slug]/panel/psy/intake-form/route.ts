import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { mergeIntakeForm, DEFAULT_INTAKE_FORM } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// فرمِ رزروِ per-resource. owner با ?resource_id= مشخص می‌کند فرمِ کدام دکتر را
// می‌بیند/ویرایش می‌کند؛ کارمند همیشه فقط فرمِ خودش را.
async function resolveTargetId(req: NextRequest, tenantId: string, isOwner: boolean, ownResourceId: string | null): Promise<string | null> {
  if (!isOwner) return ownResourceId
  const q = req.nextUrl.searchParams.get('resource_id')
  if (q) return q
  const { data } = await sb().from('resources').select('id').eq('tenant_id', tenantId)
    .order('sort_order').order('created_at').limit(1).maybeSingle()
  return data?.id || null
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const targetId = await resolveTargetId(req, a.tenant.id, a.isOwner, a.resourceId)
  if (!targetId) return NextResponse.json({ form: DEFAULT_INTAKE_FORM }, { headers: NO_STORE })

  const { data: r } = await sb().from('resources').select('id').eq('id', targetId).eq('tenant_id', a.tenant.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const { data } = await sb().from('psy_intake_forms').select('schema').eq('resource_id', targetId).maybeSingle()
  return NextResponse.json({ resource_id: targetId, form: mergeIntakeForm(data?.schema) }, { headers: NO_STORE })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()
  const targetId = a.isOwner ? (body.resource_id || await resolveTargetId(req, a.tenant.id, true, null)) : a.resourceId
  if (!targetId) return NextResponse.json({ error: 'منبعی یافت نشد' }, { status: 404 })

  const { data: r } = await sb().from('resources').select('id').eq('id', targetId).eq('tenant_id', a.tenant.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'به این منبع دسترسی ندارید' }, { status: 403 })

  const form = mergeIntakeForm(body.form)
  const { data: existing } = await sb().from('psy_intake_forms').select('resource_id').eq('resource_id', targetId).maybeSingle()
  const payload = { resource_id: targetId, schema: form, updated_at: new Date().toISOString() }
  const q = existing
    ? sb().from('psy_intake_forms').update(payload).eq('resource_id', targetId)
    : sb().from('psy_intake_forms').insert(payload)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
