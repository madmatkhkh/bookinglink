import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { PATIENT_FEATURE_KEYS } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { data } = await sb().from('tenant_features').select('feature_key, enabled')
    .eq('tenant_id', t.id).in('feature_key', PATIENT_FEATURE_KEYS)
  const flags: Record<string, boolean> = {}
  for (const k of PATIENT_FEATURE_KEYS) flags[k] = true // پیش‌فرض: روشن
  for (const row of data || []) flags[row.feature_key] = row.enabled
  return NextResponse.json({ features: flags })
}

// { key, enabled }
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { key, enabled } = await req.json()
  if (!PATIENT_FEATURE_KEYS.includes(key)) return NextResponse.json({ error: 'کلید نامعتبر' }, { status: 400 })

  const { data: existing } = await sb().from('tenant_features').select('tenant_id')
    .eq('tenant_id', t.id).eq('feature_key', key).maybeSingle()
  if (existing) {
    await sb().from('tenant_features').update({ enabled: !!enabled }).eq('tenant_id', t.id).eq('feature_key', key)
  } else {
    await sb().from('tenant_features').insert({ tenant_id: t.id, feature_key: key, enabled: !!enabled })
  }
  return NextResponse.json({ success: true })
}
