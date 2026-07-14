import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { requireModule } from '@/lib/modules'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const gate = await requireModule(a.tenant.id, 'reviews')
  if (gate) return gate
  let q = sb().from('psy_reviews').select('*').eq('tenant_id', a.tenant.id).order('created_at', { ascending: false })
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data } = await q
  const caseNumbers = Array.from(new Set((data || []).map(r => r.case_number)))
  const { data: cases } = caseNumbers.length
    ? await sb().from('psy_cases').select('case_number, client_name').eq('tenant_id', a.tenant.id).in('case_number', caseNumbers)
    : { data: [] as { case_number: string; client_name: string }[] }
  const nameByCase = new Map((cases || []).map(c => [c.case_number, c.client_name]))
  const rows = (data || []).map(r => ({ ...r, client_name: nameByCase.get(r.case_number) || '' }))
  return NextResponse.json({ reviews: rows })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const gate = await requireModule(a.tenant.id, 'reviews')
  if (gate) return gate
  const { id, status } = await req.json()
  if (!id || !['approved', 'hidden', 'pending'].includes(status))
    return NextResponse.json({ error: 'ناقص' }, { status: 400 })
  let q = sb().from('psy_reviews').update({ status }).eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { error } = await q
  if (error) return NextResponse.json({ error: 'بروزرسانی ناموفق بود' }, { status: 500 })
  return NextResponse.json({ success: true })
}
