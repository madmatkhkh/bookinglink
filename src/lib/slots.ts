// ─────────────────────────────────────────────────────────────────────────────
// موتورِ محاسبه‌ی اسلات‌های خالی
// اصل: اسلات ذخیره نمی‌شود، محاسبه می‌شود:
//   (الگوی هفتگی + استثناهای تاریخ‌دار) − (رزروهای زنده) − (گذشته/مهلتِ رزرو)
// ضامنِ نهاییِ همزمانی، unique index دیتابیس روی (tenant, date, time) است.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'
import { jalaliWeekday, jalaliDateTimeToTimestamp, timeKey, minutesToTime, jalaliKey, getDaysInJalaliMonth, toLatinNum } from './calendar'

export type ServiceRow = { id: string; duration_minutes: number; mode: string }
type Range = { start_time: string; end_time: string; mode: string }

const LEAD_TIME_MS = 60 * 60 * 1000 // حداقل یک ساعت قبل از شروعِ جلسه باید رزرو شود

/** آیا بازه‌ی کاری با حالتِ سرویس سازگار است؟ */
function modeCompatible(rangeMode: string, serviceMode: string): boolean {
  if (rangeMode === 'both' || serviceMode === 'both') return true
  return rangeMode === serviceMode
}

/** بازه‌های کاریِ موثرِ یک تاریخِ مشخص (پس از اعمالِ استثناها) */
function effectiveRanges(
  dateStr: string, jy: number, jm: number, jd: number,
  weekly: (Range & { weekday: number })[],
  overrides: (Range & { date: string; type: string })[],
): Range[] {
  const dayOverrides = overrides.filter(o => o.date === dateStr)
  if (dayOverrides.some(o => o.type === 'closed')) return []
  const custom = dayOverrides.filter(o => o.type === 'custom')
  if (custom.length) return custom
  const wd = jalaliWeekday(jy, jm, jd)
  return weekly.filter(w => w.weekday === wd)
}

/** ساعت‌های خالیِ یک روز برای یک سرویس */
export async function computeDaySlots(
  tenantId: string, service: ServiceRow, jy: number, jm: number, jd: number,
): Promise<string[]> {
  const dateStr = jalaliKey(jy, jm, jd)
  const [{ data: weekly }, { data: overrides }, { data: booked }] = await Promise.all([
    sb().from('weekly_schedules').select('weekday, start_time, end_time, mode').eq('tenant_id', tenantId),
    sb().from('schedule_overrides').select('date, type, start_time, end_time, mode').eq('tenant_id', tenantId).eq('date', dateStr),
    sb().from('bookings').select('booking_time').eq('tenant_id', tenantId).eq('booking_date', dateStr)
      .not('status', 'in', '(cancelled)'),
  ])

  const ranges = effectiveRanges(dateStr, jy, jm, jd, (weekly || []) as any, (overrides || []) as any)
    .filter(r => modeCompatible(r.mode, service.mode))

  const takenTimes = new Set((booked || []).map(b => timeKey(b.booking_time)))
  const now = Date.now()
  const out: string[] = []

  for (const r of ranges) {
    const start = timeKey(toLatinNum(r.start_time)), end = timeKey(toLatinNum(r.end_time))
    for (let t = start; t + service.duration_minutes <= end; t += service.duration_minutes) {
      if (takenTimes.has(t)) continue
      const slotTime = minutesToTime(t)
      const ts = jalaliDateTimeToTimestamp(dateStr, slotTime)
      if (ts === null || ts - now < LEAD_TIME_MS) continue
      out.push(slotTime)
    }
  }
  return Array.from(new Set(out)).sort((a, b) => timeKey(a) - timeKey(b))
}

/** تعدادِ اسلاتِ خالیِ هر روزِ یک ماه — برای رنگ‌آمیزیِ تقویمِ رزرو */
export async function computeMonthAvailability(
  tenantId: string, service: ServiceRow, jy: number, jm: number,
): Promise<Record<number, number>> {
  // یک بار همه‌ی داده‌ی ماه را می‌خوانیم، بعد در حافظه روزبه‌روز حساب می‌کنیم
  const days = getDaysInJalaliMonth(jy, jm)
  const monthPrefix = `${jy}/${String(jm).padStart(2, '0')}/`
  const [{ data: weekly }, { data: overrides }, { data: booked }] = await Promise.all([
    sb().from('weekly_schedules').select('weekday, start_time, end_time, mode').eq('tenant_id', tenantId),
    sb().from('schedule_overrides').select('date, type, start_time, end_time, mode').eq('tenant_id', tenantId).like('date', `${monthPrefix}%`),
    sb().from('bookings').select('booking_date, booking_time').eq('tenant_id', tenantId).like('booking_date', `${monthPrefix}%`)
      .not('status', 'in', '(cancelled)'),
  ])

  const takenByDate = new Map<string, Set<number>>()
  for (const b of booked || []) {
    if (!takenByDate.has(b.booking_date)) takenByDate.set(b.booking_date, new Set())
    takenByDate.get(b.booking_date)!.add(timeKey(b.booking_time))
  }

  const now = Date.now()
  const result: Record<number, number> = {}
  for (let d = 1; d <= days; d++) {
    const dateStr = jalaliKey(jy, jm, d)
    const ranges = effectiveRanges(dateStr, jy, jm, d, (weekly || []) as any, (overrides || []) as any)
      .filter(r => modeCompatible(r.mode, service.mode))
    const taken = takenByDate.get(dateStr) || new Set<number>()
    let count = 0
    for (const r of ranges) {
      const start = timeKey(toLatinNum(r.start_time)), end = timeKey(toLatinNum(r.end_time))
      for (let t = start; t + service.duration_minutes <= end; t += service.duration_minutes) {
        if (taken.has(t)) continue
        const ts = jalaliDateTimeToTimestamp(dateStr, minutesToTime(t))
        if (ts === null || ts - now < LEAD_TIME_MS) continue
        count++
      }
    }
    result[d] = count
  }
  return result
}
