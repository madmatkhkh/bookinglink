import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { issueOtp, verifyOtp, normalizePhone, createStaffSession, requestIp, otpEchoEnabled, OTP_THROTTLED_MSG } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ورود کارمند: برخلاف ورود صاحب مجموعه (که شماره از قبل روی tenant است)،
// اینجا کاربر شماره‌ی خودش را می‌دهد — چون در یک مجموعه چند نفر پرسنل با
// شماره‌های جدا وجود دارد. طبق درخواست صریح صاحب پروژه، قبل از صدور OTP
// چک می‌شود که این شماره واقعا یک درمانگر فعال همین مجموعه باشد — تا برای
// شماره‌های اشتباه/بی‌ربط پیامک الکی ارسال نشود. (نکته: این یعنی پاسخ نشان
// می‌دهد آیا شماره عضو مجموعه هست یا نه — تبادل آگاهانه‌ای بین صرفه‌جویی
// پیامک/وضوح خطا و مخفی‌ماندن لیست شماره‌های کارمندان.)
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone || '')
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })

  if (!body.code) {
    const { data: resource } = await sb().from('resources').select('id, is_active')
      .eq('tenant_id', t.id).eq('phone', phone).maybeSingle()
    if (!resource || !resource.is_active)
      return NextResponse.json({ error: 'درمانگری با این شماره در این مجموعه یافت نشد' }, { status: 404 })

    const issued = await issueOtp(phone, requestIp(req), 'sms', t.id)
    if (!issued.ok) {
      if ('throttled' in issued) return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
      return NextResponse.json({ error: issued.smsError || 'ارسال پیامک ناموفق بود — دوباره تلاش کن' }, { status: 502 })
    }
    // TODO(sms): این‌جا کد با پیامک ارسال می‌شود. تا آن موقع فقط با OTP_ECHO_CODE=true.
    return NextResponse.json({ success: true, ...(otpEchoEnabled() ? { dev_code: issued.code } : {}) })
  }

  const ok = await verifyOtp(phone, String(body.code))
  if (ok === 'throttled') return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
  if (ok !== 'ok') return NextResponse.json({ error: 'کد نادرست یا منقضی است' }, { status: 400 })

  const { data: resource } = await sb().from('resources').select('id, is_active')
    .eq('tenant_id', t.id).eq('phone', phone).maybeSingle()
  if (!resource || !resource.is_active)
    return NextResponse.json({ error: 'درمانگری با این شماره در این مجموعه یافت نشد' }, { status: 404 })

  const res = NextResponse.json({ success: true })
  await createStaffSession(res, t.id, resource.id)
  return res
}
