// ── تصویر og سطح پلتفرم — طراحی «سکوت هندسی» (og/DESIGN.md) ─────────────────
// بوم سفید، لوگو در نقطه‌ی شروع خواندن (راست)، نام کنارش، تگ‌لاین نازک،
// یک خط حساب‌شده‌ی مشکی به‌عنوان تنها ژست گرافیکی. متن‌های فارسی از rtl()
// عبور می‌کنند (جبران بیدی satori — توضیح در og/shared.tsx).
import { ImageResponse } from 'next/og'
import { OG_SIZE, ogFonts, LogoMark, RtlText } from './og/shared'

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
          background: '#ffffff', fontFamily: 'Vazirmatn', position: 'relative',
        }}
      >
        {/* لوکاپ مرکزی: در RTL لوگو اول (راست)، بعد نام — row-reverse این ترتیب را می‌سازد */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 34 }}>
              <LogoMark size={108} />
              <RtlText text="نوبت‌لینک" fontSize={92} fontWeight={700} color="#0a0a0a" />
            </div>
            {/* خط جداکننده‌ی نازک — تنها ژست گرافیکی کارت */}
            <div style={{ display: 'flex', width: 96, height: 3, background: '#0a0a0a', marginTop: 44, marginBottom: 36 }} />
            <RtlText text="صفحه‌ی نوبت‌دهی اختصاصی شما" fontSize={33} color="#8a8a8a" />
          </div>
        </div>

        {/* دامنه — زمزمه‌وار، پایین مرکز */}
        <div
          style={{
            display: 'flex', justifyContent: 'center', paddingBottom: 52,
            fontSize: 24, color: '#b5b5b5', letterSpacing: 3,
          }}
        >
          nobatlink.com
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() }
  )
}
