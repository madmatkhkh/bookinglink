import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { issueOtp, verifyOtp, setClientCookie, normalizePhone, isValidEmail, matchesClientIdentity, requestIp, otpEchoEnabled, OTP_THROTTLED_MSG } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ورود مراجع با شماره (پیش‌فرض، پیامکی) یا ایمیل (برای مراجع خارج از ایران —
// پیامک ایرانی همیشه به شماره‌های خارجی نمی‌رسد). کلاینت یا `phone` یا `email`
// می‌فرستد، نه هر دو؛ بقیه‌ی فلو (صدور/تایید کد، ست‌کردن کوکی) برای هر دو یکسان است.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const body = await req.json()

  const viaEmail = !!body.email && !body.phone
  let identifier: string
  if (viaEmail) {
    identifier = String(body.email).trim().toLowerCase()
    if (!isValidEmail(identifier)) return NextResponse.json({ error: 'ایمیل معتبر نیست' }, { status: 400 })
  } else {
    identifier = normalizePhone(body.phone || '')
    if (!/^09\d{9}$/.test(identifier)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })
  }

  if (!body.code) {
    const issued = await issueOtp(identifier, requestIp(req), viaEmail ? 'email' : 'sms')
    if (!issued.ok) {
      if ('throttled' in issued) return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
      return NextResponse.json({ error: issued.smsError || (viaEmail ? 'ارسال ایمیل ناموفق بود — دوباره تلاش کن' : 'ارسال پیامک ناموفق بود — دوباره تلاش کن') }, { status: 502 })
    }
    // TODO(sms/email): این‌جا کد ارسال می‌شود. تا آن موقع فقط با OTP_ECHO_CODE=true
    // در پاسخ برمی‌گردد؛ روی پروداکشن واقعی این env باید حذف شود.
    return NextResponse.json({ success: true, ...(otpEchoEnabled(viaEmail ? 'email' : 'sms') ? { dev_code: issued.code } : {}) })
  }

  const ok = await verifyOtp(identifier, String(body.code))
  if (ok === 'throttled') return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
  if (ok !== 'ok') return NextResponse.json({ error: 'کد اشتباه یا منقضی شده' }, { status: 400 })

  const col1 = viaEmail ? 'contact_email' : 'contact_phone'
  const col2 = viaEmail ? 'contact2_email' : 'contact2_phone'
  let booking = null
  const { data: byPrimary } = await sb().from('psy_cases').select('*')
    .eq('tenant_id', t.id).eq(col1, identifier).order('created_at', { ascending: false }).limit(1).single()
  if (byPrimary) booking = byPrimary
  else {
    const { data: bySecondary } = await sb().from('psy_cases').select('*')
      .eq('tenant_id', t.id).eq(col2, identifier).order('created_at', { ascending: false }).limit(1).single()
    booking = bySecondary
  }
  if (!booking) return NextResponse.json({ error: viaEmail ? 'پرونده‌ای با این ایمیل یافت نشد' : 'پرونده‌ای با این شماره یافت نشد' }, { status: 404 })
  if (!matchesClientIdentity(booking, identifier)) return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })
  // نشست مراجع: از این به بعد routeهای دیتا/پرداخت/رزرو با همین کوکی امضاشده
  // auth می‌شوند، نه با شماره‌ای که کلاینت خودش در query/body می‌فرستد.
  const res = NextResponse.json({ success: true, booking })
  setClientCookie(res, identifier)
  return res
}
