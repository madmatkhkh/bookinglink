import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getClinicSettings, listPublicDoctors, PATIENT_FEATURE_KEYS } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// تنظیمات عمومی کلینیک برای صفحه‌های سمت مراجع: آدرس‌های مشترک (settings) +
// لیست دکترهای قابل‌انتخاب (doctors؛ تک‌دکترها یک آیتم می‌گیرند) + ماژول‌های فعال.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const [settings, doctors] = await Promise.all([getClinicSettings(t.id), listPublicDoctors(t.id, t.plan)])

  const { data } = await sb().from('tenant_features').select('feature_key, enabled')
    .eq('tenant_id', t.id).in('feature_key', PATIENT_FEATURE_KEYS)
  const features: Record<string, boolean> = {}
  for (const k of PATIENT_FEATURE_KEYS) features[k] = true
  for (const row of data || []) features[row.feature_key] = row.enabled

  return NextResponse.json({ settings, doctors, features })
}
