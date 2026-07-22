import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { issueOtp, verifyOtp, normalizePhone, isValidEmail, createPanelSession, requestIp, otpEchoEnabled, OTP_THROTTLED_MSG } from '@/lib/auth'
import { RESERVED_SLUGS, SLUG_PATTERN, SLUG_RULE_TEXT } from '@/lib/config'
import { getNiche, isPsychologyNiche } from '@/lib/niche'
import { PRO_TRIAL_KEYS, TRIAL_DAYS } from '@/lib/plans'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ثبت‌نام سلف‌سرویس — دو قدم، دقیقا مثل بقیه‌ی OTPهای پروژه:
//   قدم ۱ (بدون code): اعتبارسنجی ورودی‌ها + صدور OTP به شماره یا ایمیل داده‌شده.
//           هنوز هیچ tenantی ساخته نمی‌شود — تا هویت تایید نشده، هیچ کسب‌وکاری
//           برای آن رزرو/ساخته نمی‌شود.
//   قدم ۲ (با code): تایید OTP → همان‌جا tenant ساخته می‌شود → نشست پنل هم
//           صادر می‌شود تا کاربر بی‌درنگ وارد پنل تازه‌ساز خودش شود.
//
// شماره یا ایمیل — حداقل یکی لازم است (نه لزوما شماره‌ی ایرانی؛ صاحب کسب‌وکار
// خارج از ایران با ایمیل ثبت‌نام می‌کند).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))

  const slug = String(b.slug || '').trim().toLowerCase()
  if (!SLUG_PATTERN.test(slug)) return NextResponse.json({ error: `نشانی معتبر نیست — ${SLUG_RULE_TEXT}` }, { status: 400 })
  if (RESERVED_SLUGS.includes(slug)) return NextResponse.json({ error: 'این نشانی رزرو سیستم است' }, { status: 400 })

  const viaEmail = !!b.email && !b.phone
  let identifier: string
  if (viaEmail) {
    identifier = String(b.email).trim().toLowerCase()
    if (!isValidEmail(identifier)) return NextResponse.json({ error: 'ایمیل معتبر نیست' }, { status: 400 })
  } else {
    identifier = normalizePhone(b.phone || '')
    if (!/^09\d{9}$/.test(identifier)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })
  }

  const nicheKey = String(b.niche_key || '')
  const niche = await getNiche(nicheKey)
  if (!niche) return NextResponse.json({ error: 'یک حوزه‌ی کاری معتبر انتخاب کن' }, { status: 400 })
  if (!niche.is_active) return NextResponse.json({ error: 'این حوزه هنوز برای ثبت‌نام آماده نیست — به‌زودی باز می‌شود' }, { status: 400 })

  // نشانی از قبل گرفته شده؟ (چک زودهنگام؛ چک‌ نهایی هم موقع insert با unique constraint است)
  const { data: existing } = await sb().from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (existing) return NextResponse.json({ error: 'این نشانی قبلا گرفته شده — یکی دیگر امتحان کن' }, { status: 409 })

  const name = String(b.name || '').trim().slice(0, 60)

  // فاز P6: انتخاب پلن در ثبت‌نام — فقط پایه/حرفه‌ای (پلن «تیم» چون چندپرسنلی
  // تصمیم اعتمادی سوپرادمین است، سلف‌سرویس نیست؛ از پشتیبانی درخواست می‌شود).
  const plan = ['base', 'pro'].includes(String(b.plan || '')) ? String(b.plan) : 'base'

  if (!b.code) {
    const issued = await issueOtp(identifier, requestIp(req), viaEmail ? 'email' : 'sms')
    if (!issued.ok) {
      if ('throttled' in issued) return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
      return NextResponse.json({ error: issued.smsError || (viaEmail ? 'ارسال ایمیل ناموفق بود — دوباره تلاش کن' : 'ارسال پیامک ناموفق بود — دوباره تلاش کن') }, { status: 502 })
    }
    return NextResponse.json({ success: true, ...(otpEchoEnabled(viaEmail ? 'email' : 'sms') ? { dev_code: issued.code } : {}) })
  }

  const ok = await verifyOtp(identifier, String(b.code))
  if (ok === 'throttled') return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
  if (ok !== 'ok') return NextResponse.json({ error: 'کد نادرست یا منقضی است' }, { status: 400 })

  // ─── از این‌جا به بعد دقیقا همان مراحل ساخت tenant در /api/super/tenants ───
  const { data: tenant, error } = await sb().from('tenants')
    .insert({ slug, owner_phone: viaEmail ? '' : identifier, owner_email: viaEmail ? identifier : null, niche_key: nicheKey, plan })
    .select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این نشانی هم‌زمان توسط شخص دیگری گرفته شد — یکی دیگر امتحان کن' }, { status: 409 })
    // این نقطه بعد از تایید OTP است — کاربر هویتش را ثابت کرده و اینجا شکست
    // خورده. متن خام Postgres (انگلیسی، با نام constraint) نه برایش معنا دارد و
    // نه باید ساختار دیتابیس را لو بدهد؛ اصلش فقط در لاگ سرور می‌ماند.
    console.error('signup tenant insert error:', error)
    return NextResponse.json({ error: 'ساخت مجموعه ناموفق بود — چند لحظه بعد دوباره تلاش کن یا به پشتیبانی پیام بده' }, { status: 500 })
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
  // فاز P6: ترایال 14روزه‌ی «حرفه‌ای» برای ثبت‌نام پلن پایه — ردیف‌های موقت با
  // source='trial' و expires_at؛ بعد از انقضا resolution خودکار به preset پایه
  // برمی‌گردد (بدون cron). پلن حرفه‌ای ترایال لازم ندارد (همه‌چیز را دارد).
  // upsert ignoreDuplicates: اگر کلیدی در default_features نیچ بود، دست نمی‌خورد.
  if (plan === 'base' && PRO_TRIAL_KEYS.length) {
    const expiresAt = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString()
    await sb().from('tenant_features').upsert(
      PRO_TRIAL_KEYS.map(key => ({ tenant_id: tenant.id, feature_key: key, enabled: true, source: 'trial', expires_at: expiresAt })),
      { onConflict: 'tenant_id,feature_key', ignoreDuplicates: true }
    )
  }
  if (isPsychologyNiche(nicheKey)) {
    await sb().from('psy_clinic_settings').insert({ tenant_id: tenant.id })
    if (resource?.id) {
      // بج‌ها عمدا خالی — نسخه‌ی قبل ریتینگ ساختگی («4.9 از 5») برای حساب
      // تازه‌ساخته نشان می‌داد که هم اعتمادسوز بود هم داده‌ی غیرواقعی. هر متخصص
      // خودش از پنل بج‌های واقعی‌اش را تعریف می‌کند.
      await sb().from('psy_resource_profiles').insert({
        resource_id: resource.id,
        badges: [],
        session_modes: 'both',
      })
    }
  }

  // ورود خودکار به پنل تازه‌ساز — دیگر نیازی به ورود دوباره نیست
  const res = NextResponse.json({ success: true, slug })
  await createPanelSession(res, tenant.id)
  return res
}
