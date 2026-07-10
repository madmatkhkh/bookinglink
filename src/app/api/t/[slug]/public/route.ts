import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requireTenant, isTenantResponse } from '@/lib/tenant'
import { getNiche } from '@/lib/niche'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requireTenant(params.slug)
  if (isTenantResponse(t)) return t
  const [{ data: profile }, { data: services }, { data: resources }, niche] = await Promise.all([
    sb().from('tenant_profiles').select('*').eq('tenant_id', t.id).single(),
    sb().from('services').select('id, name, duration_minutes, price, mode, description')
      .eq('tenant_id', t.id).eq('is_active', true).order('sort_order').order('created_at'),
    sb().from('resources').select('id, name, title, avatar_url, is_selectable')
      .eq('tenant_id', t.id).eq('is_active', true).order('sort_order').order('created_at'),
    getNiche(t.niche_key),
  ])
  // برچسب‌ها از نیچ می‌آیند تا صفحه‌ی عمومی زبان درست همان کسب‌وکار را بگوید
  const labels = niche
    ? { client: niche.client_label, resource: niche.resource_label, booking: niche.booking_label }
    : { client: 'مراجع', resource: 'ارائه‌دهنده', booking: 'نوبت' }
  // چند منبع انتخاب‌شدنی داریم؟ (اگر ماژول multi_resource روشن باشد نمایش می‌دهیم)
  const selectableResources = (resources || []).filter(r => r.is_selectable)
  return NextResponse.json({
    profile, services: services || [],
    resources: selectableResources,
    labels, niche_key: t.niche_key,
  })
}
