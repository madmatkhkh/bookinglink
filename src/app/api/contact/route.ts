import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isValidEmail, requestIp, checkThrottle } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// فرم عمومی «تماس با ما» لندینگ — بدون نیاز به حساب. چون عمومی است:
// rate-limit سختگیرانه (۳ پیام در ساعت از هر IP، با همان مکانیزم دیتابیس‌محور
// auth_throttle) + سقف طول پیام، تا برای اسپم جذاب نباشد.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}))
  const email = String(b.email || '').trim().toLowerCase()
  const message = String(b.message || '').trim()

  if (!isValidEmail(email)) return NextResponse.json({ error: 'ایمیل معتبر وارد کن' }, { status: 400 })
  if (message.length < 10) return NextResponse.json({ error: 'متن پیام خیلی کوتاه است' }, { status: 400 })
  if (message.length > 2000) return NextResponse.json({ error: 'متن پیام خیلی بلند است (حداکثر 2000 حرف)' }, { status: 400 })

  const ip = requestIp(req)
  const ok = await checkThrottle(`contact:${ip}`, 3, 3600)
  if (!ok) return NextResponse.json({ error: 'تعداد پیام‌ها زیاد شده — کمی بعد دوباره امتحان کن' }, { status: 429 })

  const { error } = await sb().from('contact_messages').insert({ email, message, ip })
  if (error) {
    console.error('contact POST error (آیا migration 0024 اجرا شده؟):', error)
    return NextResponse.json({ error: 'ثبت پیام ناموفق بود — دوباره امتحان کن' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
