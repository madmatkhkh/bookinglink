import { sb } from './supabase'

export type Tenant = {
  id: string; slug: string; status: string; plan: string; owner_phone: string
}

/** tenant فعال را از slug برمی‌گرداند؛ null یعنی ۴۰۴ */
export async function getActiveTenant(slug: string): Promise<Tenant | null> {
  const { data } = await sb().from('tenants').select('id, slug, status, plan, owner_phone')
    .eq('slug', slug).single()
  if (!data || data.status !== 'active') return null
  return data as Tenant
}

import { NextRequest, NextResponse } from 'next/server'
import { getPanelTenantId } from './auth'

/** گاردِ مشترکِ همه‌ی روت‌های عمومیِ tenant: یا tenant فعال یا 404 */
export async function requireTenant(slug: string): Promise<Tenant | NextResponse> {
  const t = await getActiveTenant(slug)
  return t ?? NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
}

/** گاردِ مشترکِ روت‌های پنلِ متخصص: tenant فعال + نشستِ معتبرِ صاحبِ همان tenant */
export async function requirePanel(req: NextRequest, slug: string): Promise<Tenant | NextResponse> {
  const t = await getActiveTenant(slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const ok = await getPanelTenantId(req, t.id)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return t
}

export function isTenantResponse(x: Tenant | NextResponse): x is NextResponse {
  return x instanceof NextResponse
}
