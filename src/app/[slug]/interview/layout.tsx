// ─────────────────────────────────────────────────────────────────────────────
// این صفحه ('interview/page.tsx') کاملا 'use client' است و رنگ تم را با فچ
// کلاینتی (usePublicClinic → useTenantThemeColor) بعد از mount می‌گیرد؛ یعنی
// اولین رندر همیشه با پیش‌فرض مونوکروم globals.css (--brand: 10 10 10) نقاشی
// می‌شود و چند صد میلی‌ثانیه بعد به رنگ واقعی دکتر می‌پرد — همان فلاش گزارش‌شده.
//
// این layout یک Server Component است که رنگ را همان‌جا که [slug]/page.tsx هم
// همین کار را می‌کند از دیتابیس می‌خواند و به‌عنوان inline style روی یک div
// می‌گذارد — یعنی HTML اولیه از همان اولین رندر رنگ درست را دارد. هوک کلاینتی
// دست‌نخورده می‌ماند و بعدا همان مقدار را (بی‌اثر، چون از قبل درست است) دوباره
// روی <html> ست می‌کند.
// ─────────────────────────────────────────────────────────────────────────────
import { getActiveTenant } from '@/lib/tenant'
import { sb } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function InterviewLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const tenant = await getActiveTenant(params.slug)
  let themeColor: string | null = null
  if (tenant) {
    const { data } = await sb().from('tenant_profiles').select('theme_color').eq('tenant_id', tenant.id).maybeSingle()
    themeColor = data?.theme_color || null
  }
  return <div style={themeColor ? { ['--brand' as any]: themeColor } : undefined}>{children}</div>
}
