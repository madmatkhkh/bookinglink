import { NextRequest, NextResponse } from 'next/server'
import { getActiveTenant } from '@/lib/tenant'
import { sb } from '@/lib/supabase'
import { issueOtp, verifyOtp, createPanelSession, requestIp, otpEchoEnabled, OTP_THROTTLED_MSG } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  if (!body.code) {
    const issued = await issueOtp(t.owner_phone, requestIp(req))
    if (!issued.ok) return NextResponse.json({ error: OTP_THROTTLED_MSG }, { status: 429 })
    // TODO(sms): این‌جا کد با پیامک ارسال می‌شود. تا آن موقع فقط با OTP_ECHO_CODE=true.
    return NextResponse.json({ success: true, ...(otpEchoEnabled() ? { dev_code: issued.code } : {}) })
  }

  const ok = await verifyOtp(t.owner_phone, String(body.code))
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
