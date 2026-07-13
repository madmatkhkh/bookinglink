import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { checkThrottle, requestIp, normalizePhone, isValidEmail } from '@/lib/auth'
import { isDraftCase } from '@/lib/flow'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeName(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ')
}

// چک می‌کند آیا پرونده‌ای با همین «نام مراجع + شماره‌تماس/ایمیل» از قبل ثبت شده
// — تا مراجع قبل از پرکردن کل فرم بفهمد، نه بعد زدن دکمه‌ی نهایی.
//
// ⚠️ حریم خصوصی: پاسخ این route عملا تایید می‌کند که «فلانی مراجع این کلینیک
// روانشناسی هست» — برای یک محصول سلامت روان حساس است. به همین دلیل:
//   ۱) rate limit سفت روی IP (همان جدول auth_throttle) — enumeration انبوه ناممکن
//   ۲) نرمال‌سازی شماره با همان normalizePhone سراسری تا با ذخیره‌سازی یکی باشد
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  // حداکثر ۱۰ چک از هر IP در هر ۱۰ دقیقه — برای فلو عادی یک مراجع بیش از کافی،
  // برای اسکن لیست اسامی/شماره‌ها بازدارنده. در حالت throttle پاسخ خنثی
  // برمی‌گردانیم (نه خطا) تا فرم مراجع واقعی نشکند — چک قطعی duplicate به‌هرحال
  // موقع ثبت نهایی در /psy/book انجام می‌شود.
  if (!(await checkThrottle(`psy:exists:${requestIp(req)}`, 10, 600)))
    return NextResponse.json({ exists: false })

  const { clientName, phone, email } = await req.json()
  const name = normalizeName(clientName)
  const ph = phone ? normalizePhone(phone) : ''
  const em = email && isValidEmail(email) ? String(email).trim().toLowerCase() : ''
  if (!name || (!ph && !em)) return NextResponse.json({ exists: false })

  const db = sb()
  const sel = '*, current_stage:psy_stages!current_stage_id(*)'
  const [{ data: byPhone }, { data: byEmail }] = await Promise.all([
    ph ? db.from('psy_cases').select(sel).eq('tenant_id', t.id).eq('client_name', name).eq('contact_phone', ph).maybeSingle() : Promise.resolve({ data: null }),
    em ? db.from('psy_cases').select(sel).eq('tenant_id', t.id).eq('client_name', name).eq('contact_email', em).maybeSingle() : Promise.resolve({ data: null }),
  ])

  // پیش‌نویس رهاشده «پرونده‌ی موجود» حساب نمی‌شود — وگرنه کسی که بار قبل وسط
  // پرداخت بی‌خیال شده، همین‌جا متوقف می‌شود و راه ادامه‌ای هم ندارد. /psy/book
  // هم دقیقا همین منطق را دارد و پیش‌نویس قبلی را جایگزین می‌کند، پس این دو
  // با هم می‌خوانند.
  const found = byPhone || byEmail
  return NextResponse.json({ exists: !!found && !isDraftCase(found) })
}
