import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// صف بازبینی متن پیامک tenantها. این صف اختیاری نیست: متن تاییدنشده هرگز
// ارسال نمی‌شود، پس تا وقتی این‌جا رسیدگی نشود، یادآوری آن tenant روی الگوی
// ثابت قبلی می‌ماند (نه اینکه قطع شود) — رد یا تاخیر، سرویس را نمی‌خواباند.

export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const status = req.nextUrl.searchParams.get('status')

  let q = sb().from('sms_templates')
    .select('*, tenants(slug, tenant_profiles(display_name))')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) {
    // قبل از migration 0052 → لیست خالی، نه خطای 500
    if (/does not exist/i.test(error.message || '')) return NextResponse.json({ templates: [] })
    console.error('super/sms-templates GET error:', error.message)
    return NextResponse.json({ error: 'خواندن لیست ناموفق بود' }, { status: 500 })
  }

  // همان الگوی flatten تیکت‌ها (supabase تودرتو را آرایه یا شیء برمی‌گرداند)
  const templates = (data || []).map((t: any) => {
    const tenant = Array.isArray(t.tenants) ? t.tenants[0] : t.tenants
    const profile = tenant ? (Array.isArray(tenant.tenant_profiles) ? tenant.tenant_profiles[0] : tenant.tenant_profiles) : null
    const { tenants: _drop, ...rest } = t
    return { ...rest, tenant_slug: tenant?.slug || null, tenant_display_name: profile?.display_name || null }
  })
  return NextResponse.json({ templates })
}

// PATCH { id, status: 'approved' | 'rejected', review_note? }
export async function PATCH(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })
  if (!['approved', 'rejected'].includes(String(b.status)))
    return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })

  // رد بدون دلیل، برای صاحب مجموعه یک بن‌بست است — نمی‌داند چه چیزی را عوض کند.
  const note = String(b.review_note || '').trim().slice(0, 300)
  if (b.status === 'rejected' && !note)
    return NextResponse.json({ error: 'برای رد کردن، دلیلش را بنویس' }, { status: 400 })

  const { error } = await sb().from('sms_templates').update({
    status: b.status,
    review_note: note || null,
    reviewed_at: new Date().toISOString(),
  }).eq('id', b.id)

  if (error) {
    console.error('super/sms-templates PATCH error:', error)
    return NextResponse.json({ error: 'ذخیره‌ی نتیجه‌ی بازبینی ناموفق بود' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
