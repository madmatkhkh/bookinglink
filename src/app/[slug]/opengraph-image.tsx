// ── تصویر og اختصاصی هر tenant — طراحی «سکوت هندسی» (og/DESIGN.md) ──────────
// بوم سفید؛ رنگ تم متخصص فقط یک بار ظاهر می‌شود (دیسک حرف اول + خط نازک) و
// همین تک‌حضور برندش می‌کند. چیدمان راست‌به‌چپ: دیسک در راست، نام و عنوان
// کنارش؛ فوتر با لوگو (اول) + نام پلتفرم + آدرس صفحه. متن فارسی از rtl()
// عبور می‌کند (جبران بیدی satori). هر خطای DB به کارت بی‌نام fallback می‌شود.
import { ImageResponse } from 'next/og'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { OG_SIZE, ogFonts, rgbOf, RtlText } from '../og/shared'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = 'کارت رزرو نوبت'

export default async function TenantOgImage({ params }: { params: { slug: string } }) {
  const fonts = await ogFonts()

  let name = 'رزرو نوبت'
  let title = 'رزرو نوبت آنلاین'
  let theme = 'rgb(13 148 136)'
  try {
    const tenant = await getActiveTenant(params.slug)
    if (tenant) {
      const [{ data: profile }, { data: firstDoctor }] = await Promise.all([
        sb().from('tenant_profiles').select('display_name, title, theme_color').eq('tenant_id', tenant.id).maybeSingle(),
        sb().from('resources').select('name, title').eq('tenant_id', tenant.id)
          .eq('is_active', true).eq('is_selectable', true)
          .order('sort_order').order('created_at').limit(1).maybeSingle(),
      ])
      name = firstDoctor?.name || profile?.display_name || name
      title = firstDoctor?.title || profile?.title || title
      theme = rgbOf(profile?.theme_color)
    }
  } catch (e) {
    console.error('tenant og image fallback:', e)
  }
  const initial = name.trim().charAt(0) || 'ن'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: '#ffffff', fontFamily: 'Vazirmatn',
        }}
      >
        {/* بدنه: راست‌به‌چپ — دیسک تم در نقطه‌ی شروع خواندن، متن کنارش */}
        <div
          style={{
            display: 'flex', flexDirection: 'row-reverse', flex: 1,
            alignItems: 'center', padding: '0 96px', gap: 56,
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 176, height: 176, borderRadius: 999, background: theme,
              color: '#ffffff', fontSize: 88, fontWeight: 700, flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: 1 }}>
            <RtlText text={name} fontSize={66} fontWeight={700} color="#0a0a0a" />
            {/* خط نازک تم — دومین و آخرین حضور رنگ */}
            <div style={{ display: 'flex', width: 76, height: 3, background: theme, marginTop: 26, marginBottom: 24 }} />
            <RtlText text={title} fontSize={31} color="#8a8a8a" />
          </div>
        </div>

        {/* فوتر: فقط خط مویی + آدرس صفحه — بدون برندینگ پلتفرم (کارت مال متخصص است) */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 96px 40px' }}>
          <div style={{ display: 'flex', width: '100%', height: 1, background: '#ececec', marginBottom: 24 }} />
          <div style={{ display: 'flex', fontSize: 23, color: '#b5b5b5', letterSpacing: 1 }}>
            nobatlink.com/{params.slug}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  )
}
