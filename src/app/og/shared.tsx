// ── زیرساخت مشترک تصویرهای og (پیش‌نمایش لینک در تلگرام/واتساپ/توییتر) ───────
// satori (موتور next/og) فقط ttf/otf/woff می‌خواند؛ این دو فایل ttf نسخه‌ی
// استاتیک سابست‌شده‌ی (فارسی + لاتین پایه) همان Vazirmatn variable پروژه‌اند
// (~70KB هرکدام) و فقط برای رندر og مصرف می‌شوند — به باندل کلاینت نمی‌روند.
import { readFile } from 'fs/promises'
import path from 'path'

export const OG_SIZE = { width: 1200, height: 630 }

// مسیر از process.cwd() خوانده می‌شود (نه import.meta.url که بعد از باندل به
// chunk اشاره می‌کند و فایل کنارش نیست)؛ روی Vercel هم با
// outputFileTracingIncludes در next.config.js همین دو ttf به خروجی می‌روند.
const FONT_DIR = path.join(process.cwd(), 'src', 'app', 'og')

export async function ogFonts() {
  const [regular, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, 'Vazirmatn-Regular.ttf')),
    readFile(path.join(FONT_DIR, 'Vazirmatn-Bold.ttf')),
  ])
  return [
    { name: 'Vazirmatn', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Vazirmatn', data: bold, weight: 700 as const, style: 'normal' as const },
  ]
}

// لوگوی پلتفرم (پین نوبت روی کاشی گرد) به‌صورت JSX سازگار با satori —
// همان طرح public/logo.svg؛ این‌جا inline چون satori به فایل بیرونی دسترسی ندارد.
export function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="15 15 70 70">
      <rect x="20" y="20" width="60" height="60" rx="20" fill="#0a0a0a" />
      <rect x="44" y="15" width="12" height="70" rx="6" fill="#ffffff" transform="rotate(45 50 50)" />
      <circle cx="50" cy="50" r="14" fill="#ffffff" />
      <circle cx="50" cy="50" r="6" fill="#0a0a0a" />
    </svg>
  )
}

// theme_color در دیتابیس به‌صورت «13 148 136» (سه‌تایی RGB) ذخیره می‌شود
export function rgbOf(themeColor?: string | null): string {
  const t = (themeColor || '').trim()
  return /^\d{1,3} \d{1,3} \d{1,3}$/.test(t) ? `rgb(${t})` : 'rgb(13 148 136)'
}

// ── جبران بیدی satori ────────────────────────────────────────────────────────
// یافته‌ی تست‌های ایزوله (ثبت برای آینده):
//   1) direction:'rtl' در استایل، مسیر بیدی ناقص satori را فعال می‌کند که متن
//      را روی فاصله/نیم‌فاصله می‌شکند و تکه‌ها را LTR می‌چیند — هرگز استفاده نشود.
//   2) بین هر دو div مجاور (هر flexDirection ای، حتی gap:0) satori ~1.1em فاصله‌ی
//      ذاتی می‌گذارد — چیدن کلمه‌به‌کلمه با div هم بن‌بست است.
//   3) یک رشته‌ی «یکپارچه» (بدون فاصله‌ی ASCII) مستقیم به شکل‌دهنده‌ی فونت
//      می‌رود که RTL را بومی و درست هندل می‌کند: ترتیب درست + فاصله‌ی طبیعی.
// پس: چینش کلمه‌به‌کلمه با ترتیب معکوس دستی (پیاده‌سازی زیر).
// و هیچ direction ای ست نمی‌شود. همین.
export function RtlText({ text, fontSize, fontWeight = 400, color, wrapAt, align = 'flex-end' }: {
  text: string; fontSize: number; fontWeight?: 400 | 700; color: string
  wrapAt?: number; align?: 'flex-end' | 'center' | 'flex-start'
}) {
  // satori بیدی کامل ندارد: هر رشته‌ی چندکلمه‌ای (حتی با NBSP) را LTR می‌چیند.
  // تنها راه بی‌نقص: هر کلمه یک المان جدا، و ترتیب کلمات را خودمان با
  // row-reverse معکوس می‌کنیم. داخل هر کلمه (شامل نیم‌فاصله) رشته‌ی یکپارچه
  // است که فونت درست شکل می‌دهد. gap بین کلمات = فاصله‌ی طبیعی (~0.28em).
  const renderLine = (line: string, key?: number) => (
    <div key={key} style={{ display: 'flex', flexDirection: 'row-reverse', gap: Math.round(fontSize * 0.28), fontSize, fontWeight, color, lineHeight: 1.35 }}>
      {line.trim().split(/\s+/).map((w, i) => (
        <div key={i} style={{ display: 'flex' }}>{w}</div>
      ))}
    </div>
  )

  if (wrapAt) {
    const lines: string[] = []
    let cur = ''
    for (const w of text.trim().split(/\s+/)) {
      if (cur && (cur + ' ' + w).length > wrapAt) { lines.push(cur); cur = w }
      else cur = cur ? cur + ' ' + w : w
    }
    if (cur) lines.push(cur)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: Math.round(fontSize * 0.4) }}>
        {lines.map((ln, i) => renderLine(ln, i))}
      </div>
    )
  }
  return renderLine(text)
}
