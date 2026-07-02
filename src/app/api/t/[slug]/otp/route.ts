import { NextRequest, NextResponse } from 'next/server'
import { requireTenant, isTenantResponse } from '@/lib/tenant'
import { issueOtp, verifyOtp, setClientCookie, normalizePhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// {phone} → ارسالِ کد   |   {phone, code} → تایید و نشستنِ کوکیِ مراجع
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requireTenant(params.slug)
  if (isTenantResponse(t)) return t

  const body = await req.json()
  const phone = normalizePhone(body.phone)
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })

  if (!body.code) {
    const code = await issueOtp(phone)
    // تا اتصالِ ماژولِ پیامک، کد برای تست در پاسخ برمی‌گردد
    return NextResponse.json({ success: true, dev_code: code })
  }

  const ok = await verifyOtp(phone, String(body.code))
  if (!ok) return NextResponse.json({ error: 'کد نادرست یا منقضی است' }, { status: 400 })
  const res = NextResponse.json({ success: true, phone })
  setClientCookie(res, phone)
  return res
}
