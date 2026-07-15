// ── تصویر og سطح پلتفرم (nobatlink.com) ─────────────────────────────────────
// چیدمان: لوگو (راست) + نام برند، بعد توضیح دو خطی. بدون خط جداکننده.
// هر خط توضیح یک RtlText مستقل است (نه wrap دستی) تا به‌هم‌ریختگی نیم‌فاصله
// پیش نیاید — توضیح در og/shared.tsx تفصیلی آمده.
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
          alignItems: 'center', justifyContent: 'center', background: '#ffffff',
          fontFamily: 'Vazirmatn', padding: '0 90px',
        }}
      >
        {/* لوگو + نام برند */}
        <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 40, marginBottom: 40 }}>
          <LogoMark size={124} />
          <RtlText text="نوبت‌لینک" fontSize={88} fontWeight={700} color="#0a0a0a" />
        </div>

        {/* توضیح برند — دو خط، وسط‌چین */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <RtlText text="نوبت‌دهی را به صفحه‌ی اختصاصی‌تان بسپارید" fontSize={38} fontWeight={700} color="#0a0a0a" align="center" />
          <RtlText text="از مشاوره تا سالن زیبایی — یک صفحه‌ی رزرو با رنگ و هویت خودتان" fontSize={28} color="#6b6b6b" wrapAt={38} align="center" />
        </div>

        <div
          style={{
            position: 'absolute', bottom: 44, left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
            fontSize: 23, color: '#c2c2c2', letterSpacing: 2,
          }}
        >
          nobatlink.com
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() }
  )
}
