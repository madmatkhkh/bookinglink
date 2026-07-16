// ─────────────────────────────────────────────────────────────────────────────
// همون فلاش تم که در interview/layout.tsx توضیح داده شده، اینجا هم هست: صفحه‌ی
// پنل مراجع ('my/page.tsx') کاملا 'use client' است و رنگ تم را با فچ کلاینتی
// (usePublicClinic → useTenantThemeColor) بعد از mount می‌گیرد — یعنی رندر اول
// (اسپلش لودینگ + فرم ورود) همیشه با پیش‌فرض مونوکروم globals.css دیده می‌شود و
// بعد به رنگ واقعی دکتر می‌پرد.
//
// همون فیکس: Server Component که رنگ را (دقیقا همون کوئری psy/public route) از
// دیتابیس می‌خواند و inline روی یک div می‌گذارد — HTML اولیه از همون اول رنگ
// درست را دارد. هوک کلاینتی دست‌نخورده می‌ماند.
// ─────────────────────────────────────────────────────────────────────────────
import { getActiveTenant } from '@/lib/tenant'
import { sb } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function MyPanelLayout({ children, params }: { children: React.ReactNode; params: { slug: string } }) {
  const tenant = await getActiveTenant(params.slug)
  let themeColor: string | null = null
  if (tenant) {
    const { data } = await sb().from('tenant_profiles').select('theme_color').eq('tenant_id', tenant.id).maybeSingle()
    themeColor = data?.theme_color || null
  }
  return <div style={themeColor ? { ['--brand' as any]: themeColor } : undefined}>{children}</div>
}
