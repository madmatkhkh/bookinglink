import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { issueOtp, verifyOtp, normalizePhone, createPanelSession, requestIp, otpEchoEnabled, OTP_THROTTLED_MSG } from '@/lib/auth'
import { RESERVED_SLUGS, SLUG_PATTERN } from '@/lib/config'
import { getNiche } from '@/lib/niche'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ثبت‌نامِ سلف‌سرویس — دو قدم، دقیقاً مثلِ بقیه‌ی OTPهایِ پروژه:
//   قدمِ ۱ (بدونِ code): اعتبارسنجیِ ورودی‌ها + صدورِ OTP به شماره‌ی داده‌شده.
//           هنوز هیچ tenantی ساخته نمی‌شود — تا شماره تایید نشده، هیچ کارگاهی
//           برایِ آن رزرو/ساخته نمی‌شود (وگرنه هرکس با شماره‌ی هرکسِ دیگر
//           می‌توانست به‌نامِ او کارگاه بسازد).
//   قدمِ ۲ (با code): تاییدِ OTP → همان‌جا tenant ساخته می‌شود (دقیقاً همان
//           مراحلِ /api/super/tenants) → نشستِ پنل هم صادر می‌شود تا کاربر
//           بی‌درنگ وارد پنلِ تازه‌سازِ خودش شود.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))

  const slug = String(b.slug || '').trim().toLowerCase()
  if (!SLUG_PATTERN.test(slug)) return NextResponse.json({ error: 'نشانیِ کارگاه معتبر نیست (لاتینِ کوچک، عدد، خط‌تیره)' }, { status: 400 })
  if (RESERVED_SLUGS.includes(slug)) return NextResponse.json({ error: 'این نشانی رزروِ سیستم است' }, { status: 400 })

  const phone = normalizePhone(b.phone || '')
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })

  const nicheKey = String(b.niche_key || '')
  const niche = await getNiche(nicheKey)
  if (!niche) return NextResponse.json({ error: 'یک حوزه‌ی کاری معتبر انتخاب کن' }, { status: 400 })

  // نشانی از قبل گرفته شده؟ (چک زودهنگام؛ چک‌ِ نهایی هم موقعِ insert با unique constraint است)
  const { data: existing } = await sb().from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (existing) return NextResponse.json({ error: 'این نشانی قبلاً گرفته شده — یکی دیگر امتحان کن' }, { status: 409 })

  const name = String(b.name || '').trim().slice(0, 60)

  if (!b.code) {
    const issued = await issueOtp(phone, requestIp(req))
    if (!issued.ok) {
      if ('throttled' in issued) return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
      return NextResponse.json({ error: issued.smsError || 'ارسالِ پیامک ناموفق بود — دوباره تلاش کن' }, { status: 502 })
    }
    return NextResponse.json({ success: true, ...(otpEchoEnabled() ? { dev_code: issued.code } : {}) })
  }

  const ok = await verifyOtp(phone, String(b.code))
  if (ok === 'throttled') return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
  if (ok !== 'ok') return NextResponse.json({ error: 'کد نادرست یا منقضی است' }, { status: 400 })

  // ─── از این‌جا به بعد دقیقاً همان مراحلِ ساختِ tenant در /api/super/tenants ───
  const { data: tenant, error } = await sb().from('tenants')
    .insert({ slug, owner_phone: phone, niche_key: nicheKey }).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این نشانی هم‌زمان توسطِ شخصِ دیگری گرفته شد — یکی دیگر امتحان کن' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await sb().from('tenant_profiles').insert({
    tenant_id: tenant.id, display_name: name, theme_color: niche.default_theme,
  })
  const { data: resource } = await sb().from('resources').insert({
    tenant_id: tenant.id, name: name || 'خودم', is_selectable: true, sort_order: 0,
  }).select('id').single()
  if (niche.sample_services?.length) {
    await sb().from('services').insert(
      niche.sample_services.map((s: any, i: number) => ({
        tenant_id: tenant.id, name: s.name, duration_minutes: s.duration_minutes,
        price: s.price || 0, mode: s.mode || 'both', sort_order: i,
      }))
    )
  }
  if (niche.default_features?.length) {
    await sb().from('tenant_features').insert(
      niche.default_features.map((key: string) => ({ tenant_id: tenant.id, feature_key: key, enabled: true }))
    )
  }
  if (nicheKey === 'psychology') {
    await sb().from('psy_clinic_settings').insert({ tenant_id: tenant.id })
    if (resource?.id) {
      await sb().from('psy_resource_profiles').insert({
        resource_id: resource.id,
        badges: ['📍 شهر و منطقه‌ی خودتان', '⏱ پاسخ در 2 ساعت', '⭐ 4.9 از 5'],
        session_modes: 'both',
      })
    }
  }

  // ورودِ خودکار به پنلِ تازه‌ساز — دیگر نیازی به ورودِ دوباره نیست
  const res = NextResponse.json({ success: true, slug })
  await createPanelSession(res, tenant.id)
  return res
}
