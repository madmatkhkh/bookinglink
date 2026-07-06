import { NextRequest, NextResponse } from 'next/server'
import { createSuperSession, checkThrottle, requestIp } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest) {
  // rate limit: حداکثر ۵ تلاش از هر IP در هر ۱۵ دقیقه — ضدِ brute forceِ رمز
  if (!(await checkThrottle(`super:login:${requestIp(req)}`, 5, 900)))
    return NextResponse.json({ error: 'تعدادِ تلاش‌ها زیاد شده — چند دقیقه صبر کن' }, { status: 429 })

  const { secret } = await req.json()
  if (!process.env.SUPER_SECRET || secret !== process.env.SUPER_SECRET)
    return NextResponse.json({ error: 'رمز نادرست است' }, { status: 401 })
  // کوکی دیگر خودِ رمز نیست — توکنِ امضاشده‌ی ۷روزه است (auth.ts)
  const res = NextResponse.json({ success: true })
  createSuperSession(res)
  return res
}
