import { NextRequest, NextResponse } from 'next/server'
import { requireTenant, isTenantResponse } from '@/lib/tenant'
import { issueOtp, verifyOtp, setClientCookie, normalizePhone, requestIp, otpEchoEnabled, OTP_THROTTLED_MSG } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// {phone} → ارسال کد   |   {phone, code} → تایید و نشستن کوکی مراجع
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requireTenant(params.slug)
  if (isTenantResponse(t)) return t

  const body = await req.json()
  const phone = normalizePhone(body.phone)
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })

  if (!body.code) {
    const issued = await issueOtp(phone, requestIp(req), 'sms', t.id)
    if (!issued.ok) {
      if ('throttled' in issued) return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
      return NextResponse.json({ error: issued.smsError || 'ارسال پیامک ناموفق بود — دوباره تلاش کن' }, { status: 502 })
    }
    // TODO(sms): این‌جا کد با پیامک ارسال می‌شود. تا آن موقع فقط با OTP_ECHO_CODE=true
    // در پاسخ برمی‌گردد؛ روی پروداکشن واقعی این env باید حذف شود.
    return NextResponse.json({ success: true, ...(otpEchoEnabled() ? { dev_code: issued.code } : {}) })
  }

  const ok = await verifyOtp(phone, String(body.code))
  if (ok === 'throttled') return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
  if (ok !== 'ok') return NextResponse.json({ error: 'کد نادرست یا منقضی است' }, { status: 400 })
  const res = NextResponse.json({ success: true, phone })
  setClientCookie(res, phone)
  return res
}
