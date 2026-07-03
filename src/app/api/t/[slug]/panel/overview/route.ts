import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { getNiche } from '@/lib/niche'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BOOKING_SELECT = 'id, booking_date, booking_time, booking_ts, client_name, client_phone, status, payment_ref, price_snapshot, client_note, resource_id, services(name, mode, duration_minutes), resources(name)'

// همه‌ی داده‌ی پنل در یک درخواست
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t

  const db = sb()
  const [profile, services, resources, weekly, overrides, pending, upcoming, niche, features] = await Promise.all([
    db.from('tenant_profiles').select('*').eq('tenant_id', t.id).single(),
    db.from('services').select('*').eq('tenant_id', t.id).order('sort_order').order('created_at'),
    db.from('resources').select('*').eq('tenant_id', t.id).order('sort_order').order('created_at'),
    db.from('weekly_schedules').select('*').eq('tenant_id', t.id).order('weekday').order('start_time'),
    db.from('schedule_overrides').select('*').eq('tenant_id', t.id).order('date'),
    db.from('bookings').select(BOOKING_SELECT).eq('tenant_id', t.id)
      .eq('status', 'payment_submitted').order('created_at', { ascending: false }).limit(100),
    db.from('bookings').select(BOOKING_SELECT).eq('tenant_id', t.id)
      .in('status', ['pending_payment', 'payment_submitted', 'confirmed'])
      .gte('booking_ts', Date.now() - 12 * 3600 * 1000).order('booking_ts').limit(200),
    getNiche(t.niche_key),
    db.from('tenant_features').select('feature_key, enabled, config').eq('tenant_id', t.id),
  ])

  const labels = niche
    ? { client: niche.client_label, resource: niche.resource_label, booking: niche.booking_label }
    : { client: 'مراجع', resource: 'ارائه‌دهنده', booking: 'نوبت' }

  return NextResponse.json({
    slug: t.slug,
    niche_key: t.niche_key,
    labels,
    record_fields: niche?.record_fields || [],
    plan: t.plan,
    custom_domain: t.custom_domain,
    domain_verified: t.domain_verified,
    profile: profile.data,
    services: services.data || [],
    resources: resources.data || [],
    weekly: weekly.data || [],
    overrides: overrides.data || [],
    pending: pending.data || [],
    upcoming: upcoming.data || [],
    features: features.data || [],
  })
}
