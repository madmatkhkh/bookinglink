// ─────────────────────────────────────────────────────────────────────────────
// منطق تم tenant — مشترک بین پنل تنظیمات (انتخاب/آپلود) و روت پروفایل (اعتبارسنجی
// سمت سرور). فایل خالص TypeScript است (بدون وابستگی به React/DOM) تا هم از
// کامپوننت‌های کلاینت هم از روت‌های API (Node runtime) قابل import باشد.
//
// همه‌جا رنگ‌ها به همان فرمت قدیمی «تریپلت R G B» (مثلا "26 26 26") ذخیره
// می‌شوند — همان چیزی که از قبل در tenant_profiles.theme_color و --brand در
// globals.css استفاده می‌شد؛ این فایل فقط تضمین می‌کند مقداری که به آن ستون
// می‌رسد همیشه کنتراست کافی روی پس‌زمینه‌ی سفید داشته باشد.
// ─────────────────────────────────────────────────────────────────────────────

export type RGB = [number, number, number]

// حداقل نسبت کنتراست طبق WCAG AA برای متن معمولی — همین آستانه هم برای متن
// رنگی روی زمینه‌ی سفید (text-accent) هم برای متن سفید روی زمینه‌ی رنگی
// (bg-accent + text-white) کافی است، چون نسبت کنتراست بین دو رنگ متقارن است.
export const MIN_CONTRAST_RATIO = 4.5

// رنگ ایمن نهایی — وقتی هیچ‌کدام از منطق‌های بالا جواب ندهند (حالت‌های لبه‌ای)
export const DEFAULT_SAFE_THEME = '26 26 26'

// ── ۶ رنگ پیش‌فرض — همه از قبل روی کنتراست ≥ 4.5 در برابر سفید تست شده‌اند ──
export const THEME_PRESETS: { id: string; label: string; rgb: RGB }[] = [
  { id: 'ink', label: 'مشکی', rgb: [26, 26, 26] },
  { id: 'navy', label: 'سرمه‌ای', rgb: [21, 49, 89] },
  { id: 'teal', label: 'سبزآبی', rgb: [13, 94, 94] },
  { id: 'forest', label: 'سبز', rgb: [22, 84, 58] },
  { id: 'burgundy', label: 'زرشکی', rgb: [122, 29, 55] },
  { id: 'plum', label: 'بنفش', rgb: [88, 42, 102] },
]

// ── تبدیل فرمت‌ها ────────────────────────────────────────────────────────────
export function parseRgbTriplet(v: string): RGB | null {
  const parts = String(v || '').trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return null
  return [parts[0], parts[1], parts[2]]
}
export function rgbToTriplet(rgb: RGB): string {
  return `${Math.round(rgb[0])} ${Math.round(rgb[1])} ${Math.round(rgb[2])}`
}
export function rgbTripletToHex(v: string): string {
  const parsed = parseRgbTriplet(v)
  if (!parsed) return '#1a1a1a'
  return '#' + parsed.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')
}
export function hexToRgbTriplet(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `${r} ${g} ${b}`
}

// ── محاسبه‌ی کنتراست (فرمول رسمی WCAG) ───────────────────────────────────────
function linearize(c: number): number {
  const cs = c / 255
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4)
}
export function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}
// کنتراست در برابر سفید خالص — چون هم صفحه‌ی عمومی هم پنل مراجع زمینه‌شان
// همیشه سفید (bg-paper) است، این تنها مقایسه‌ای است که لازم داریم.
export function contrastRatioToWhite(rgb: RGB): number {
  return 1.05 / (relativeLuminance(rgb) + 0.05)
}

// ── تضمین کنتراست: اگر رنگ ورودی خودش کافی نبود، با کم‌کردن یکنواخت هر سه
// کانال (که hue/saturation در فضای HSV را دقیقا حفظ می‌کند، فقط روشنایی را کم
// می‌کند) آن‌قدر تیره می‌شود تا آستانه رد شود. ──────────────────────────────
export function ensureContrastOnWhite(rgb: RGB, minRatio: number = MIN_CONTRAST_RATIO): { rgb: RGB; adjusted: boolean } {
  const rounded = (v: RGB): RGB => [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])]
  const start = rounded(rgb)
  if (contrastRatioToWhite(start) >= minRatio) return { rgb: start, adjusted: false }
  let factor = 1
  for (let i = 0; i < 80; i++) {
    factor *= 0.965
    const cand = rounded([rgb[0] * factor, rgb[1] * factor, rgb[2] * factor])
    if (contrastRatioToWhite(cand) >= minRatio) return { rgb: cand, adjusted: true }
  }
  return { rgb: [26, 26, 26], adjusted: true } // ته‌خط ایمن (مثلا ورودی سفید خالص بود)
}

// ── استخراج رنگ غالب از پیکسل‌های یک تصویر (لوگو) ───────────────────────────
// ورودی: آرایه‌ی مسطح RGBA (همان چیزی که canvas.getImageData().data برمی‌گرداند).
// پیکسل‌های نزدیک سفید/مشکی/خاکستری (پس‌زمینه یا خط‌های ساده‌ی لوگو) کنار
// گذاشته می‌شوند تا فقط رنگ واقعی «برند» لوگو در نظر گرفته شود، نه پس‌زمینه‌اش.
export function extractDominantColor(pixels: Uint8ClampedArray): RGB | null {
  const BUCKET = 24
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3]
    if (a < 128) continue
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    if (max > 240 && min > 225) continue // تقریبا سفید
    if (max < 20) continue // تقریبا مشکی
    if (max - min < 18) continue // خاکستری بی‌رنگ
    const key = `${Math.round(r / BUCKET)}_${Math.round(g / BUCKET)}_${Math.round(b / BUCKET)}`
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 }
    bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b
    buckets.set(key, bucket)
  }
  let best: { count: number; r: number; g: number; b: number } | null = null
  for (const bucket of Array.from(buckets.values())) {
    if (!best || bucket.count > best.count) best = bucket
  }
  if (!best || best.count < 6) return null // رنگ برجسته‌ی کافی در لوگو پیدا نشد
  return [Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count)]
}
