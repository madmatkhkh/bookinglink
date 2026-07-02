import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BOOKING_SELECT = 'id, booking_date, booking_time, booking_ts, client_name, client_phone, status, payment_ref, price_snapshot, client_note, services(name, mode, duration_minutes)'

// همه‌ی داده‌ی پنل در یک درخواست — به‌جای ۵-۶ رفت‌وبرگشتِ جدا
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t

  const db = sb()
  const [profile, services, weekly, overrides, pending, upcoming] = await Promise.all([
    db.from('tenant_profiles').select('*').eq('tenant_id', t.id).single(),
    db.from('services').select('*').eq('tenant_id', t.id).order('sort_order').order('created_at'),
    db.from('weekly_schedules').select('*').eq('tenant_id', t.id).order('weekday').order('start_time'),
    db.from('schedule_overrides').select('*').eq('tenant_id', t.id).order('date'),
    db.from('bookings').select(BOOKING_SELECT).eq('tenant_id', t.id)
      .eq('status', 'payment_submitted').order('created_at', { ascending: false }).limit(100),
    db.from('bookings').select(BOOKING_SELECT).eq('tenant_id', t.id)
      .in('status', ['pending_payment', 'payment_submitted', 'confirmed'])
      .gte('booking_ts', Date.now() - 12 * 3600 * 1000).order('booking_ts').limit(200),
  ])

  return NextResponse.json({
    slug: t.slug,
    profile: profile.data,
    services: services.data || [],
    weekly: weekly.data || [],
    overrides: overrides.data || [],
    pending: pending.data || [],
    upcoming: upcoming.data || [],
  })
}
