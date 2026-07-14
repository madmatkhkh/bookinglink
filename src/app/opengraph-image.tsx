// ── تصویر og سطح پلتفرم (nobatlink.com) — کارت پیش‌نمایش لینک ────────────────
// Next خودش این فایل را به متاتگ og:image تبدیل می‌کند؛ نیازی به دست‌زدن به
// metadata لایه‌ی layout نیست.
import { ImageResponse } from 'next/og'
import { OG_SIZE, ogFonts, LogoMark } from './og/shared'
import { PLATFORM_NAME } from '@/lib/config'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = 'نوبت‌لینک — رزرو نوبت آنلاین'

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#0a0a0a',
          fontFamily: 'Vazirmatn', direction: 'rtl',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {/* کاشی لوگو روی زمینه‌ی تیره: نسخه‌ی معکوس (کاشی سفید) که گم نشود */}
          <svg width={120} height={120} viewBox="15 15 70 70">
            <rect x="20" y="20" width="60" height="60" rx="20" fill="#ffffff" />
            <rect x="44" y="15" width="12" height="70" rx="6" fill="#0a0a0a" transform="rotate(45 50 50)" />
            <circle cx="50" cy="50" r="14" fill="#0a0a0a" />
            <circle cx="50" cy="50" r="6" fill="#ffffff" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 84, fontWeight: 700, color: '#ffffff', lineHeight: 1.15 }}>{PLATFORM_NAME}</div>
            <div style={{ fontSize: 34, color: '#a3a3a3', marginTop: 6 }}>رزرو نوبت آنلاین</div>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#737373', marginTop: 56 }}>
          صفحه‌ی نوبت‌دهی اختصاصی و برندشده برای متخصص‌ها و کسب‌وکارهای خدماتی
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#525252', marginTop: 40, letterSpacing: 1 }}>
          nobatlink.com
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() }
  )
}
