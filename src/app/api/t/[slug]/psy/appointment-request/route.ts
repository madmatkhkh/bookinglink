import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getClientPhone, matchesClientIdentity } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// مراجع یک درخواست نوبت جدید (با توضیح) ثبت می‌کند. دکتر بعدا تأیید/رد می‌کند.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کد یک‌بارمصرف وارد شوید' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const case_number = String(body.case_number || '').trim()
  const note = body.note ? String(body.note).trim().slice(0, 500) : null
  if (!case_number) return NextResponse.json({ error: 'شماره‌ی پرونده لازم است' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases')
    .select('id, resource_id, current_stage_id, contact_phone, contact2_phone, contact_email, contact2_email, case_number')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || !matchesClientIdentity(booking, phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  // اگر پرونده الان یک مرحله‌ی باز دارد، درخواست جدید بی‌معنا است.
  if (booking.current_stage_id)
    return NextResponse.json({ error: 'شما در حال حاضر یک مرحله‌ی باز دارید؛ ابتدا آن را کامل کنید.' }, { status: 400 })

  // اگر از قبل یک درخواست در انتظار دارد، دوباره نگیر (جلوگیری از اسپم).
  const { data: existing } = await sb().from('psy_appointment_requests')
    .select('id').eq('tenant_id', t.id).eq('case_number', case_number).eq('status', 'pending').maybeSingle()
  if (existing)
    return NextResponse.json({ error: 'یک درخواست در انتظار بررسی از قبل دارید.' }, { status: 409 })

  const { error } = await sb().from('psy_appointment_requests').insert({
    tenant_id: t.id, resource_id: booking.resource_id, case_number, note,
  })
  if (error) {
    console.error('appointment-request POST error:', error)
    return NextResponse.json({ error: 'ثبت درخواست ناموفق بود' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
