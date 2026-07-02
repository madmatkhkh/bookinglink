import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requireTenant, isTenantResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requireTenant(params.slug)
  if (isTenantResponse(t)) return t
  const [{ data: profile }, { data: services }] = await Promise.all([
    sb().from('tenant_profiles').select('*').eq('tenant_id', t.id).single(),
    sb().from('services').select('id, name, duration_minutes, price, mode, description')
      .eq('tenant_id', t.id).eq('is_active', true).order('sort_order').order('created_at'),
  ])
  return NextResponse.json({ profile, services: services || [] })
}
