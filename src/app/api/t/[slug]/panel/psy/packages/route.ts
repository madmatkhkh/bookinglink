import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const q = req.nextUrl.searchParams
  if (q.get('pending')) {
    const { data } = await sb().from('psy_packages').select('*').eq('tenant_id', t.id)
      .eq('payment_submitted', true).eq('paid', false).order('created_at', { ascending: false })
    return NextResponse.json({ packages: data || [] })
  }
  const case_number = q.get('case_number')
  const { data } = await sb().from('psy_packages').select('*')
    .eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: false })
  return NextResponse.json({ packages: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const body = await req.json()
  const { data } = await sb().from('psy_packages').insert([{ ...body, tenant_id: t.id }]).select().single()
  return NextResponse.json({ package: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })
  const { data, error } = await sb().from('psy_packages').update(updates)
    .eq('id', id).eq('tenant_id', t.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ package: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { id } = await req.json()
  await sb().from('psy_packages').delete().eq('id', id).eq('tenant_id', t.id)
  return NextResponse.json({ success: true })
}
