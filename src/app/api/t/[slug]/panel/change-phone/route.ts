import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { issueOtp, verifyOtp, normalizePhone, requestIp, otpEchoEnabled, OTP_THROTTLED_MSG } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// تغییر شماره‌ی ورود خود owner یا خود درمانگر (نه شماره‌ی هیچ‌کس دیگر) — دو قدم:
//   قدم ۱ (بدون code): اعتبارسنجی + چک‌کردن اینکه این شماره قبلا مال یک
//           owner/درمانگر دیگر نباشد (تا دو نفر با هم قاطی نشوند) + صدور OTP.
//   قدم ۲ (با code): تایید OTP → همان‌جا شماره در دیتابیس عوض می‌شود.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const b = await req.json().catch(() => ({}))

  const newPhone = normalizePhone(b.new_phone || '')
  if (!/^09\d{9}$/.test(newPhone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })

  // این شماره نباید همین الان مال owner یا درمانگر دیگری باشد (تا ورودها قاطی نشود).
  // باگ قبلی: برای owner، ‎.neq('id', '')‎ روی ستون uuid خطای «invalid input
  // syntax for type uuid» می‌داد → کوئری fail → چک تداخل بی‌سروصدا رد می‌شد و
  // owner می‌توانست شماره‌ی یکی از درمانگرها را بردارد. حالا neq فقط وقتی به
  // کوئری اضافه می‌شود که واقعا یک resourceId معتبر برای مستثناکردن داشته باشیم.
  let staffQ = sb().from('resources').select('id').eq('phone', newPhone)
  if (!a.isOwner && a.resourceId) staffQ = staffQ.neq('id', a.resourceId)
  const [{ data: ownerClash }, { data: staffClash }] = await Promise.all([
    sb().from('tenants').select('id').eq('owner_phone', newPhone).neq('id', a.tenant.id).maybeSingle(),
    staffQ.maybeSingle(),
  ])
  if (ownerClash || staffClash) return NextResponse.json({ error: 'این شماره قبلا برای ورود یک حساب دیگر ثبت شده است' }, { status: 409 })

  if (!b.code) {
    const issued = await issueOtp(newPhone, requestIp(req))
    if (!issued.ok) {
      if ('throttled' in issued) return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
      return NextResponse.json({ error: issued.smsError || 'ارسال پیامک ناموفق بود' }, { status: 502 })
    }
    return NextResponse.json({ success: true, sent: true, ...(otpEchoEnabled() ? { devCode: issued.code } : {}) })
  }

  const result = await verifyOtp(newPhone, String(b.code))
  if (result === 'throttled') return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
  if (result !== 'ok') return NextResponse.json({ error: 'کد واردشده درست نیست یا منقضی شده' }, { status: 400 })

  if (a.isOwner) {
    await sb().from('tenants').update({ owner_phone: newPhone }).eq('id', a.tenant.id)
  } else {
    await sb().from('resources').update({ phone: newPhone }).eq('id', a.resourceId)
  }
  return NextResponse.json({ success: true, phone: newPhone })
}
