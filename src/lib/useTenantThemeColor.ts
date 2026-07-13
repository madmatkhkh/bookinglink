'use client'
import { useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// اعمال رنگ برند tenant به‌عنوان CSS variable --brand روی <html>.
//
// چرا روی document.documentElement و نه یک inline style روی یک wrapper؟ چون
// صفحه‌های عمومی مراجع (مصاحبه، پنل مراجع) چند حالت رندر جدا از هم دارند
// (لودینگ/فرم/صفحه‌ی پرداخت/پایان) که هرکدام یک ریشه‌ی JSX متفاوت برمی‌گردانند؛
// ست‌کردن مقدار یک‌بار روی خود <html> در mount یعنی همه‌ی حالت‌ها بدون نیاز به
// تکرار inline style در هر کدام پوشش داده می‌شوند. مقدار قبلی هنگام unmount
// برگردانده می‌شود تا بین صفحه‌های tenantهای مختلف نشتی نداشته باشیم.
export function useTenantThemeColor(themeColor?: string | null) {
  useEffect(() => {
    if (!themeColor) return
    const root = document.documentElement
    const prev = root.style.getPropertyValue('--brand')
    root.style.setProperty('--brand', themeColor)
    return () => {
      if (prev) root.style.setProperty('--brand', prev)
      else root.style.removeProperty('--brand')
    }
  }, [themeColor])
}
