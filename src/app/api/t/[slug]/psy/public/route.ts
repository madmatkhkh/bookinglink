import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getClinicSettings, listPublicDoctors, PATIENT_FEATURE_KEYS } from '@/lib/psy'
import { getEnabledModules } from '@/lib/modules'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// تنظیمات عمومی کلینیک برای صفحه‌های سمت مراجع: آدرس‌های مشترک (settings) +
// لیست دکترهای قابل‌انتخاب (doctors؛ تک‌دکترها یک آیتم می‌گیرند) + ماژول‌های فعال.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const [settings, doctors, { data: profile }] = await Promise.all([
    getClinicSettings(t.id),
    listPublicDoctors(t.id),
    sb().from('tenant_profiles').select('theme_color').eq('tenant_id', t.id).maybeSingle(),
  ])

  // فلگ‌های سمت مراجع حالا از سیستم ماژولار می‌آیند (کاتالوگ + tenant_features +
  // default_on) — نه فقط دو کلید قدیمی: waitlist و reviews هم اضافه شدند تا UI
  // مراجع (دکمه‌ی لیست انتظار در SlotPicker، باکس نظر در /my) خودش را با
  // سوییچ سوپرادمین هماهنگ کند. fail-open: کلید غایب = روشن (قبل از migration).
  const enabledMap = await getEnabledModules(t.id)
  const features: Record<string, boolean> = {}
  for (const k of [...PATIENT_FEATURE_KEYS, 'waitlist', 'reviews']) {
    features[k] = enabledMap.has(k) ? !!enabledMap.get(k) : true
  }

  return NextResponse.json({ settings, doctors, features, theme_color: profile?.theme_color || null })
}
