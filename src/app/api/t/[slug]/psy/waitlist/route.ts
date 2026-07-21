import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { requireModule } from '@/lib/modules'
import { getClientPhone, matchesClientIdentity } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// مراجع وقتی هیچ ساعت خالی‌ای برای روزهای نزدیک پیدا نمی‌کند، خودش را به
// لیست انتظار اضافه می‌کند. هیچ‌جا خودکار «رزرو» نمی‌شود — فقط وقتی دکتر یک
// ساعت آزاد تازه می‌بیند، از همین لیست کسی را دستی مطلع می‌کند (پیامک/ایمیل).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const gate = await requireModule(t.id, 'waitlist', t.plan)
  if (gate) return gate
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کد یک‌بارمصرف وارد شوید' }, { status: 401 })

  const { case_number, resource_id, session_type, note } = await req.json()
  if (!case_number || !resource_id) return NextResponse.json({ error: 'ناقص' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases').select('contact_phone, contact2_phone, contact_email, contact2_email')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || !matchesClientIdentity(booking, phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  // از قبل توی لیست انتظار همین دکتر با وضعیت pending نباشد (بی‌فایده‌ی تکراری)
  const { data: existing } = await sb().from('psy_waitlist').select('id')
    .eq('tenant_id', t.id).eq('resource_id', resource_id).eq('case_number', case_number).eq('status', 'pending').maybeSingle()
  if (existing) return NextResponse.json({ success: true, already: true })

  const isEmail = phone.includes('@')
  const { error } = await sb().from('psy_waitlist').insert({
    tenant_id: t.id, resource_id, case_number,
    contact_phone: isEmail ? '' : phone, contact_email: isEmail ? phone : '',
    session_type: session_type || null, note: String(note || '').trim().slice(0, 200),
  })
  if (error) { console.error('psy/waitlist POST error:', error); return NextResponse.json({ error: 'ثبت ناموفق بود' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
