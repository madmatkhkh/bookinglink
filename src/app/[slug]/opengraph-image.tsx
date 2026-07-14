// ── تصویر og اختصاصی هر tenant — کارت پیش‌نمایش برندشده‌ی لینک هر مجموعه ─────
// وقتی متخصص لینک nobatlink.com/{slug} را در تلگرام/واتساپ/اینستاگرام
// می‌فرستد، کارت پیش‌نمایش نام و عنوان و رنگ تم خودش را نشان می‌دهد نه برند
// عمومی پلتفرم — مکمل سیستم theming per-specialist.
// کوئری‌ها عمدا سبک‌اند (نه listPublicDoctors سنگین): فقط نام/عنوان دکتر اول
// + پروفایل tenant. اگر tenant پیدا نشود، کارت عمومی پلتفرم برمی‌گردد.
import { ImageResponse } from 'next/og'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { OG_SIZE, ogFonts, LogoMark, rgbOf } from '../og/shared'
import { PLATFORM_NAME } from '@/lib/config'

export const runtime = 'nodejs'
export const size = OG_SIZE
export const contentType = 'image/png'
export const alt = 'کارت رزرو نوبت'

export default async function TenantOgImage({ params }: { params: { slug: string } }) {
  const fonts = await ogFonts()

  let name = PLATFORM_NAME
  let title = 'رزرو نوبت آنلاین'
  let theme = 'rgb(13 148 136)'
  // هر خطای دیتابیس (env ناقص، قطعی، tenant نامعتبر) نباید کارت را 500 کند —
  // در بدترین حالت کارت عمومی پلتفرم برمی‌گردد.
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
          background: '#faf9f7', fontFamily: 'Vazirmatn', direction: 'rtl',
        }}
      >
        {/* نوار تم بالای کارت — همان رنگ برند متخصص */}
        <div style={{ display: 'flex', height: 14, width: '100%', background: theme }} />

        <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: '0 88px', gap: 48 }}>
          {/* آواتار حرف اول با هاله‌ی رنگ تم */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 190, height: 190, borderRadius: 999, background: theme,
              color: '#ffffff', fontSize: 96, fontWeight: 700, flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, color: '#0a0a0a', lineHeight: 1.25 }}>{name}</div>
            {title ? (
              <div style={{ display: 'flex', fontSize: 34, color: '#525252', marginTop: 14, lineHeight: 1.5 }}>{title}</div>
            ) : null}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12, marginTop: 34,
                fontSize: 27, color: '#0a0a0a', fontWeight: 700,
              }}
            >
              <div style={{ display: 'flex', padding: '10px 26px', borderRadius: 999, background: '#0a0a0a', color: '#ffffff' }}>
                رزرو نوبت آنلاین
              </div>
            </div>
          </div>
        </div>

        {/* فوتر برند پلتفرم */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '0 88px 34px',
            fontSize: 25, color: '#737373',
          }}
        >
          <LogoMark size={40} />
          <div style={{ display: 'flex', fontWeight: 700, color: '#0a0a0a' }}>{PLATFORM_NAME}</div>
          <div style={{ display: 'flex' }}>nobatlink.com/{params.slug}</div>
        </div>
      </div>
    ),
    { ...size, fonts }
  )
}
