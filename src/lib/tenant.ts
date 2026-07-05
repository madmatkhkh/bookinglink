// ─────────────────────────────────────────────────────────────────────────────
// تشخیص و بارگذاریِ tenant — از slug یا از دامنه‌ی اختصاصی
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'
import { NextRequest, NextResponse } from 'next/server'
import { getPanelTenantId, getStaffResourceId } from './auth'

export type Tenant = {
  id: string; slug: string; status: string; plan: string
  owner_phone: string; niche_key: string
  custom_domain: string | null; domain_verified: boolean
}

const TENANT_COLS = 'id, slug, status, plan, owner_phone, niche_key, custom_domain, domain_verified'

/** tenant فعال از slug */
export async function getActiveTenant(slug: string): Promise<Tenant | null> {
  const { data } = await sb().from('tenants').select(TENANT_COLS).eq('slug', slug).single()
  if (!data || data.status !== 'active') return null
  return data as Tenant
}

/** tenant فعال از دامنه‌ی اختصاصیِ تاییدشده — برای middleware/routing */
export async function getTenantByDomain(domain: string): Promise<Tenant | null> {
  const { data } = await sb().from('tenants').select(TENANT_COLS)
    .eq('custom_domain', domain).eq('domain_verified', true).single()
  if (!data || data.status !== 'active') return null
  return data as Tenant
}

/** گاردِ روت‌های عمومیِ tenant: یا tenant فعال یا 404 */
export async function requireTenant(slug: string): Promise<Tenant | NextResponse> {
  const t = await getActiveTenant(slug)
  return t ?? NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
}

/** گاردِ روت‌های پنل: tenant فعال + نشستِ معتبرِ صاحبِ همان tenant */
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

// ── دسترسیِ چندکارمندی ────────────────────────────────────────────────────────
// نتیجه‌ی این گارد: یا صاحبِ مجموعه (resourceId=null → همه‌چیز را می‌بیند)
// یا یک کارمند/منبعِ مشخص (resourceId=<id> → فقط دیتای خودش). هر روتِ پنلی که
// باید بینِ owner و staff فرق بگذارد، به‌جایِ requirePanel از این استفاده کند.
export type PanelAuth = { tenant: Tenant; resourceId: string | null; isOwner: boolean }

export async function requirePanelAuth(req: NextRequest, slug: string): Promise<PanelAuth | NextResponse> {
  const t = await getActiveTenant(slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const ownerOk = await getPanelTenantId(req, t.id)
  if (ownerOk) return { tenant: t, resourceId: null, isOwner: true }

  const resourceId = await getStaffResourceId(req, t.id)
  if (resourceId) return { tenant: t, resourceId, isOwner: false }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export function isPanelAuthResponse(x: PanelAuth | NextResponse): x is NextResponse {
  return x instanceof NextResponse
}
