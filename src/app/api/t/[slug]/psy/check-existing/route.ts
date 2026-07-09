import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { checkThrottle, requestIp, normalizePhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeName(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ')
}

// چک می‌کند آیا پرونده‌ای با همین «نامِ مراجع + شماره‌تماس» از قبل ثبت شده — تا
// مراجع قبل از پرکردنِ کلِ فرم بفهمد، نه بعدِ زدنِ دکمه‌ی نهایی.
//
// ⚠️ حریمِ خصوصی: پاسخِ این route عملاً تایید می‌کند که «فلانی مراجعِ این کلینیکِ
// روانشناسی هست» — برای یک محصولِ سلامتِ روان حساس است. به همین دلیل:
//   ۱) rate limit سفت روی IP (همان جدولِ auth_throttle) — enumeration انبوه ناممکن
//   ۲) نرمال‌سازیِ شماره با همان normalizePhone سراسری تا با ذخیره‌سازی یکی باشد
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  // حداکثر ۱۰ چک از هر IP در هر ۱۰ دقیقه — برای فلوِ عادیِ یک مراجع بیش از کافی،
  // برای اسکنِ لیستِ اسامی/شماره‌ها بازدارنده. در حالتِ throttle پاسخِ خنثی
  // برمی‌گردانیم (نه خطا) تا فرمِ مراجعِ واقعی نشکند — چکِ قطعیِ duplicate به‌هرحال
  // موقعِ ثبتِ نهایی در /psy/book انجام می‌شود.
  if (!(await checkThrottle(`psy:exists:${requestIp(req)}`, 10, 600)))
    return NextResponse.json({ exists: false })

  const { clientName, phone } = await req.json()
  const name = normalizeName(clientName)
  const ph = normalizePhone(phone || '')
  if (!name || !ph) return NextResponse.json({ exists: false })

  const { data } = await sb().from('psy_cases').select('id')
    .eq('tenant_id', t.id).eq('client_name', name).eq('contact_phone', ph).maybeSingle()
  return NextResponse.json({ exists: !!data })
}
