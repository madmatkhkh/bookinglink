import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { issueOtp, verifyOtp, setClientCookie, normalizePhone, requestIp, otpEchoEnabled, OTP_THROTTLED_MSG } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const body = await req.json()
  const phone = normalizePhone(body.phone || '')
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })

  if (!body.code) {
    const issued = await issueOtp(phone, requestIp(req))
    if (!issued.ok) {
      if ('throttled' in issued) return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
      return NextResponse.json({ error: issued.smsError || 'ارسالِ پیامک ناموفق بود — دوباره تلاش کن' }, { status: 502 })
    }
    // TODO(sms): این‌جا کد با پیامک ارسال می‌شود. تا آن موقع فقط با OTP_ECHO_CODE=true
    // در پاسخ برمی‌گردد؛ روی پروداکشنِ واقعی این env باید حذف شود.
    return NextResponse.json({ success: true, ...(otpEchoEnabled() ? { dev_code: issued.code } : {}) })
  }

  const ok = await verifyOtp(phone, String(body.code))
  if (ok === 'throttled') return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
  if (ok !== 'ok') return NextResponse.json({ error: 'کد اشتباه یا منقضی شده' }, { status: 400 })

  let booking = null
  const { data: byPrimary } = await sb().from('psy_cases').select('*')
    .eq('tenant_id', t.id).eq('contact_phone', phone).order('created_at', { ascending: false }).limit(1).single()
  if (byPrimary) booking = byPrimary
  else {
    const { data: bySecondary } = await sb().from('psy_cases').select('*')
      .eq('tenant_id', t.id).eq('contact2_phone', phone).order('created_at', { ascending: false }).limit(1).single()
    booking = bySecondary
  }
  if (!booking) return NextResponse.json({ error: 'پرونده‌ای با این شماره یافت نشد' }, { status: 404 })
  // نشستِ مراجع: از این به بعد routeهای دیتا/پرداخت/رزرو با همین کوکیِ امضاشده
  // auth می‌شوند، نه با شماره‌ای که کلاینت خودش در query/body می‌فرستد.
  const res = NextResponse.json({ success: true, booking })
  setClientCookie(res, phone)
  return res
}
