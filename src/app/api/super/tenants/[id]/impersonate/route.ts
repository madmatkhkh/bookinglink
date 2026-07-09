import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed, createPanelSession, verifyImpersonateToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// سوپرادمین بدونِ دانستنِ رمزِ متخصص، مستقیم واردِ پنلِ owner می‌شود (برایِ پشتیبانی).
// ⚠️ تبادلِ آگاهانه: این دقیقاً همان createPanelSession است که ورودِ معمولیِ
// owner استفاده می‌کند — یعنی اگر خودِ متخصص همین الان از یک مرورگرِ دیگر
// نشستِ فعال داشته باشد، با این کار خارج می‌شود (چون owner_session یک توکنِ
// واحد است، نه چندتایی). برایِ یک تیمِ پشتیبانیِ کوچک که این ابزار را فقط
// هنگامِ نیازِ واقعی (تیکت/مشکل) استفاده می‌کند، این تبادل قابلِ‌قبول است.
//
// GET (نه POST): عمداً یک ناوبریِ مستقیم است، نه fetch+window.open جدا — چون
// fetch-then-open-new-tab برایِ تحویلِ کوکی بینِ مرورگرها ناپایدار بود (باگِ
// گزارش‌شده: «حتماً OTP می‌خواهد»). این‌جا کوکی و ریدایرکت هر دو در یک پاسخِ
// HTTP واحد اتفاق می‌افتند — همان الگویِ استانداردِ «ورود به‌جایِ کاربر».
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSuperAuthed(req)) return NextResponse.redirect(new URL('/super', req.url))
  const id = params.id

  // ضدِ CSRF: بدونِ توکنِ امضاشده‌ی کوتاه‌عمر (که فقط APIِ احرازشده‌ی جزئیاتِ
  // tenant صادر می‌کند)، این GET هیچ کاری نمی‌کند — لینکِ خام از یک سایتِ مهاجم بی‌اثر است.
  if (!verifyImpersonateToken(id, req.nextUrl.searchParams.get('token'))) {
    const url = new URL(`/super/${id}`, req.url)
    url.searchParams.set('impersonate_error', 'expired')
    return NextResponse.redirect(url)
  }

  const { data: tenant } = await sb().from('tenants').select('id, slug, status').eq('id', id).maybeSingle()
  if (!tenant || tenant.status !== 'active') {
    const url = new URL(`/super/${id}`, req.url)
    url.searchParams.set('impersonate_error', tenant ? 'suspended' : 'not_found')
    return NextResponse.redirect(url)
  }

  const res = NextResponse.redirect(new URL(`/${tenant.slug}/panel`, req.url))
  await createPanelSession(res, tenant.id)
  return res
}
