// ── تصویر og اختصاصی هر tenant — کارت پیش‌نمایش لینک هر مجموعه ──────────────
// طراحی جدید (بازخورد مشتری): چیدمان مرکزی، عکس واقعی متخصص در راست و کنارش
// اسم و تخصص. رنگ تم فقط در حلقه‌ی دور عکس و خط زیر اسم ظاهر می‌شود.
//   - عکس: avatar_url (URL کامل عمومی R2) با <img>؛ اگر نبود، دیسک حرف اول.
//   - اسم/تخصص: از resource دکتر اول، بعد profile، بعد fallback عمومی.
//   - متن فارسی حتما از <RtlText> (جبران بیدی satori — توضیح در og/shared.tsx).
//   - هر خطای DB به کارت عمومی fallback می‌شود، هرگز 500.
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

  let name = 'رزرو نوبت آنلاین'
  let title = ''
  let theme = 'rgb(13 148 136)'
  let avatar: string | null = null
  try {
    const tenant = await getActiveTenant(params.slug)
    if (tenant) {
      const [{ data: profile }, { data: firstDoctor }] = await Promise.all([
        sb().from('tenant_profiles').select('display_name, title, theme_color').eq('tenant_id', tenant.id).maybeSingle(),
        sb().from('resources').select('name, title, avatar_url').eq('tenant_id', tenant.id)
          .eq('is_active', true).order('is_selectable', { ascending: false })
          .order('sort_order').order('created_at').limit(1).maybeSingle(),
      ])
      name = firstDoctor?.name || profile?.display_name || name
      title = firstDoctor?.title || profile?.title || ''
      theme = rgbOf(profile?.theme_color)
      avatar = firstDoctor?.avatar_url || null
    }
  } catch (e) {
    console.error('tenant og image fallback:', e)
  }
  const initial = name.trim().charAt(0) || 'ن'

  // عکس را خودمان fetch و به data-URI تبدیل می‌کنیم — تا (۱) نوع/فرمت را کنترل
  // کنیم و (۲) اگر آدرس در دسترس نبود یا فرمتش را satori نمی‌فهمید، به‌جای
  // 500 شدن کل تصویر، تمیز به دیسک حرف اول fallback کنیم.
  let avatarData: string | null = null
  if (avatar) {
    try {
      const res = await fetch(avatar, { signal: AbortSignal.timeout(2500) })
      const type = res.headers.get('content-type') || ''
      if (res.ok && /^image\/(png|jpe?g|webp)/.test(type)) {
        const buf = Buffer.from(await res.arrayBuffer())
        avatarData = `data:${type};base64,${buf.toString('base64')}`
      }
    } catch (e) {
      console.error('avatar fetch failed, using initial:', e)
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#ffffff', fontFamily: 'Vazirmatn',
        }}
      >
        {/* لوکاپ مرکزی راست‌به‌چپ: عکس در راست، متن کنارش */}
        <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 52 }}>
          {/* عکس متخصص با حلقه‌ی رنگ تم؛ fallback: دیسک حرف اول */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 240, height: 240, borderRadius: 999, flexShrink: 0,
              border: `8px solid ${theme}`, background: theme, overflow: 'hidden',
            }}
          >
            {avatarData ? (
              <img src={avatarData} width={240} height={240} style={{ width: 240, height: 240, objectFit: 'cover', borderRadius: 999 }} />
            ) : (
              <div style={{ display: 'flex', fontSize: 120, fontWeight: 700, color: '#ffffff' }}>{initial}</div>
            )}
          </div>

          {/* اسم + تخصص + تگ‌لاین، هم‌تراز راست. بدون خط جداکننده. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: 640, gap: 18 }}>
            <RtlText text={name} fontSize={72} fontWeight={700} color="#0a0a0a" />
            {title ? <RtlText text={title} fontSize={34} color="#6b6b6b" /> : null}
            <div style={{ display: 'flex', marginTop: 14 }}>
              <RtlText text="رزرو نوبت آنلاین" fontSize={27} fontWeight={700} color={theme} />
            </div>
          </div>
        </div>

        {/* آدرس صفحه — گوشه‌ی پایین، زمزمه‌وار */}
        <div
          style={{
            position: 'absolute', bottom: 44, left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
            fontSize: 22, color: '#c2c2c2', letterSpacing: 1,
          }}
        >
          nobatlink.com/{params.slug}
        </div>
      </div>
    ),
    { ...size, fonts }
  )
}
