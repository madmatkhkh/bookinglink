import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

const ALLOWED = ['doctor_name', 'doctor_title', 'avatar_url', 'badges', 'session_modes', 'office_locations', 'cards'] as const

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { data } = await sb().from('psy_clinic_settings').select('*').eq('tenant_id', t.id).maybeSingle()
  return NextResponse.json({ settings: data || null }, { headers: NO_STORE })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const body = await req.json()
  const patch: Record<string, unknown> = { tenant_id: t.id, updated_at: new Date().toISOString() }
  for (const k of ALLOWED) if (k in body) patch[k] = body[k]

  const { data: existing } = await sb().from('psy_clinic_settings').select('tenant_id').eq('tenant_id', t.id).maybeSingle()
  let saveError = null
  if (existing) {
    saveError = (await sb().from('psy_clinic_settings').update(patch).eq('tenant_id', t.id)).error
  } else {
    saveError = (await sb().from('psy_clinic_settings').insert(patch)).error
  }
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })
  return NextResponse.json({ success: true }, { headers: NO_STORE })
}
