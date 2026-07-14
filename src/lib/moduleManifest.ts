// ── مانیفست ماژول‌ها — سمت کلاینت (فاز 3 سیستم ماژولار، MODULES.md) ─────────
// این فایل عمدا هیچ import سروری (supabase و...) ندارد تا در کامپوننت‌های
// کلاینت (پنل، SlotPicker و...) امن باشد. «فعال‌بودن» از سرور می‌آید
// (panel/whoami برای پنل، psy/public برای سمت مراجع)؛ این‌جا فقط تعریف
// می‌شود که هر ماژول چه چیزی به UI اضافه می‌کند.

export type ModuleFlags = Record<string, boolean>

// fail-open: اگر فلگ نیامده (کلید ناشناخته، یا migration هنوز اجرا نشده و
// سرور نقشه‌ی خالی داده)، مثل قبل روشن رفتار کن — هیچ‌چیز نباید غیب شود.
export function moduleOn(flags: ModuleFlags | null | undefined, key: string): boolean {
  const v = flags?.[key]
  return v === undefined ? true : !!v
}

// زیرتب‌های تب «رشد و مراجعان» — هرکدام یک ماژول مستقل کاتالوگ است.
// ترتیب همین ترتیب نمایش است.
export const GROWTH_SUBTABS = [
  { key: 'waitlist' as const, module: 'waitlist', label: 'لیست انتظار' },
  { key: 'reviews' as const, module: 'reviews', label: 'نظرات مراجعان' },
  { key: 'analytics' as const, module: 'analytics', label: 'آمار کسب‌وکار' },
  { key: 'campaigns' as const, module: 'campaigns', label: 'پیام گروهی' },
]
export type GrowthSubTabKey = (typeof GROWTH_SUBTABS)[number]['key']
