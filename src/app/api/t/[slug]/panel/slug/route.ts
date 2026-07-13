import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { RESERVED_SLUGS, SLUG_PATTERN, SLUG_RULE_TEXT } from '@/lib/config'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// PUT { slug } → تغییر نشانی اختصاصی کسب‌وکار.
//
// نشانی، آدرس عمومی کسب‌وکار است (nobatlink.com/<slug>) و روی همه‌چیز اثر دارد:
// لینکی که در بیو اینستاگرام گذاشته شده، لینک‌هایی که به مراجع‌ها داده شده، و
// آدرس پنل خودش. برای همین:
//   - فقط owner می‌تواند عوضش کند (نه کارمند/درمانگر)
//   - نشانی قبلی آزاد می‌شود و کس دیگری می‌تواند بگیردش
//   - همه‌ی لینک‌های قدیمی 404 می‌شوند (ریدایرکت نداریم)
// هر دو مورد آخر در UI صریحا هشدار داده می‌شوند؛ این‌جا فقط اعتبارسنجی می‌کنیم.
export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t

  const b = await req.json().catch(() => ({}))
  const next = String(b.slug || '').trim().toLowerCase()

  if (next === t.slug) return NextResponse.json({ success: true, slug: next }) // بدون تغییر
  if (!SLUG_PATTERN.test(next)) return NextResponse.json({ error: `نشانی معتبر نیست — ${SLUG_RULE_TEXT}` }, { status: 400 })
  if (RESERVED_SLUGS.includes(next)) return NextResponse.json({ error: 'این نشانی رزرو سیستم است' }, { status: 400 })

  // یکتایی: ستون slug روی tenants unique است، پس این چک فقط برای پیام بهتر است.
  // ضامن واقعی در برابر دو درخواست هم‌زمان، خطای 23505 پایین است.
  const { data: taken } = await sb().from('tenants').select('id').eq('slug', next).maybeSingle()
  if (taken) return NextResponse.json({ error: 'این نشانی قبلا گرفته شده' }, { status: 409 })

  const { error } = await sb().from('tenants').update({ slug: next }).eq('id', t.id)
  if (error) {
    if ((error as any).code === '23505') return NextResponse.json({ error: 'این نشانی همین الان توسط شخص دیگری گرفته شد' }, { status: 409 })
    console.error('panel/slug PUT error:', error)
    return NextResponse.json({ error: 'تغییر نشانی ناموفق بود' }, { status: 500 })
  }

  return NextResponse.json({ success: true, slug: next })
}
