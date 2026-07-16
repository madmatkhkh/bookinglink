import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getClientPhone, matchesClientIdentity } from '@/lib/auth'
import { acquireActiveLocksAtomic, releaseLocks } from '@/lib/slotLocks'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { sessions } = await req.json()
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کد یک‌بارمصرف وارد شوید' }, { status: 401 })
  if (!sessions?.length) return NextResponse.json({ error: 'ناقص' }, { status: 400 })

  const case_number = sessions[0].case_number
  const { data: booking } = await sb().from('psy_cases').select('resource_id, contact_phone, contact2_phone, contact_email, contact2_email')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || !matchesClientIdentity(booking, phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  // درون همین batch هم نباید دو اسلات تکراری باشد (قبلا فقط با DB چک می‌شد)
  const seen = new Set<string>()
  for (const s of sessions) {
    const k = `${s.session_date}|${s.session_time}`
    if (seen.has(k)) return NextResponse.json({ error: `ساعت ${s.session_time} در تاریخ ${s.session_date} دوبار انتخاب شده.` }, { status: 400 })
    seen.add(k)
  }

  // ضدتداخل اساسی: همه‌ی اسلات‌ها را اتمی قفل کن (slot_locks، migration 0030).
  // all-or-nothing: اگر یکی گرفته‌شده باشد، قفل‌های گرفته‌شده‌ی همین درخواست
  // برگردانده می‌شوند و اسلات متضاد گزارش می‌شود. بین‌جدولی: با مصاحبه/ارزیابی
  // هم تداخل می‌گیرد، نه فقط جلسه‌ی دیگر.
  const lockSlots = sessions.map((s: any) => ({ session_date: s.session_date, session_time: s.session_time }))
  const lockRes = await acquireActiveLocksAtomic(t.id, booking.resource_id, lockSlots, { table: 'psy_sessions', caseNumber: case_number })
  if (!lockRes.ok)
    return NextResponse.json({ error: `ساعت ${lockRes.conflict.session_time} در تاریخ ${lockRes.conflict.session_date} قبلا رزرو شده.` }, { status: 409 })

  const { count } = await sb().from('psy_sessions').select('id', { count: 'exact' })
    .eq('tenant_id', t.id).eq('case_number', case_number)
  const toInsert = sessions.map((s: any, i: number) => ({
    ...s, tenant_id: t.id, resource_id: booking.resource_id, session_number: (count || 0) + i + 1, status: 'confirmed', paid: false,
  }))

  const { error } = await sb().from('psy_sessions').insert(toInsert)
  if (error) {
    await releaseLocks(t.id, booking.resource_id, lockSlots) // rollback قفل‌ها
    if (error.code === '23505')
      return NextResponse.json({ error: 'این ساعت همین الان توسط فرد دیگری رزرو شد.' }, { status: 409 })
    console.error('psy/sessions POST error:', error)
    return NextResponse.json({ error: 'مشکلی در ثبت رزرو پیش آمد. دوباره تلاش کنید.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
