import { NextRequest, NextResponse } from 'next/server'
import { getActiveTenant } from '@/lib/tenant'
import { sb } from '@/lib/supabase'
import { issueOtp, verifyOtp, createPanelSession, requestIp, otpEchoEnabled, OTP_THROTTLED_MSG } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  // هویتِ صاحبِ این tenant می‌تواند شماره باشد یا ایمیل (owner_phone خالی یعنی
  // با ایمیل ثبت‌نام کرده) — کلاینت چیزی انتخاب نمی‌کند، همانی که در دیتابیس
  // ذخیره شده استفاده می‌شود.
  const viaEmail = !t.owner_phone && !!t.owner_email
  const identifier = viaEmail ? t.owner_email! : t.owner_phone

  const body = await req.json().catch(() => ({}))
  if (!body.code) {
    const issued = await issueOtp(identifier, requestIp(req), viaEmail ? 'email' : 'sms')
    if (!issued.ok) {
      if ('throttled' in issued) return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
      return NextResponse.json({ error: issued.smsError || (viaEmail ? 'ارسالِ ایمیل ناموفق بود — دوباره تلاش کن' : 'ارسالِ پیامک ناموفق بود — دوباره تلاش کن') }, { status: 502 })
    }
    return NextResponse.json({ success: true, ...(otpEchoEnabled(viaEmail ? 'email' : 'sms') ? { dev_code: issued.code } : {}) })
  }

  const ok = await verifyOtp(identifier, String(body.code))
  if (ok === 'throttled') return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
  if (ok !== 'ok') return NextResponse.json({ error: 'کد نادرست یا منقضی است' }, { status: 400 })

  // تضمین: هر tenant حداقل یک منبع دارد (تک‌نفره‌ها یک منبعِ «خودم»)
  const { data: existing } = await sb().from('resources').select('id').eq('tenant_id', t.id).limit(1)
  if (!existing || existing.length === 0) {
    const { data: prof } = await sb().from('tenant_profiles').select('display_name').eq('tenant_id', t.id).single()
    await sb().from('resources').insert({
      tenant_id: t.id, name: prof?.display_name || 'خودم', is_selectable: true, sort_order: 0,
    })
  }

  const res = NextResponse.json({ success: true })
  await createPanelSession(res, t.id)
  return res
}
