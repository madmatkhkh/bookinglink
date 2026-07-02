import { NextRequest, NextResponse } from 'next/server'
import { getActiveTenant } from '@/lib/tenant'
import { issueOtp, verifyOtp, createPanelSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// {} → ارسالِ کد به شماره‌ی صاحبِ پنل   |   {code} → تایید و ساختِ نشست
// نکته: شماره‌ی owner هرگز به کلاینت برنمی‌گردد؛ کد مستقیم به همان شماره می‌رود.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  if (!body.code) {
    const code = await issueOtp(t.owner_phone)
    // تا اتصالِ ماژولِ پیامک، کد برای تست در پاسخ برمی‌گردد
    return NextResponse.json({ success: true, dev_code: code })
  }

  const ok = await verifyOtp(t.owner_phone, String(body.code))
  if (!ok) return NextResponse.json({ error: 'کد نادرست یا منقضی است' }, { status: 400 })
  const res = NextResponse.json({ success: true })
  await createPanelSession(res, t.id)
  return res
}
