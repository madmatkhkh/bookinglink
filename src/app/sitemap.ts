import { MetadataRoute } from 'next'
import { sb } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// sitemap.xml — قبلا اصلا وجود نداشت. بدون آن گوگل باید صفحات را فقط از طریق
// لینک‌ها کشف کند و صفحات عمومی متخصص‌ها (ارزش اصلی سئو) دیر ایندکس می‌شوند.
//
// شامل: صفحات ثابت پلتفرم + صفحه‌ی عمومی هر مجموعه‌ی فعال (غیرتستی).
// اگر دیتابیس در دسترس نبود، فقط صفحات ثابت برگردانده می‌شود (fail-open) تا
// بیلد/رندر هرگز به‌خاطر سایت‌مپ نشکند.
// ─────────────────────────────────────────────────────────────────────────────
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const domain = process.env.PLATFORM_DOMAIN || 'nobatlink.com'
  const base = `https://${domain}`
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  try {
    const { data } = await sb()
      .from('tenants')
      // ⚠️ قبلا updated_at خوانده می‌شد ولی جدول tenants چنین ستونی ندارد؛
      // کوئری خطا می‌داد، try/catch بی‌صدا می‌بلعیدش و sitemap هیچ صفحه‌ی
      // مجموعه‌ای نداشت. created_at موجود است و برای lastModified کافی.
      .select('slug, created_at')
      .eq('status', 'active')
      .eq('is_test', false)
      .limit(5000)
    const tenantRoutes: MetadataRoute.Sitemap = (data || [])
      .filter(t => t.slug)
      .map(t => ({
        url: `${base}/${t.slug}`,
        lastModified: t.created_at ? new Date(t.created_at) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))
    return [...staticRoutes, ...tenantRoutes]
  } catch {
    return staticRoutes
  }
}
