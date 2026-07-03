// ─────────────────────────────────────────────────────────────────────────────
// موتورِ محاسبه‌ی اسلات‌های خالی — نسخه‌ی چند‌منبعی
//
// اسلات ذخیره نمی‌شود، محاسبه می‌شود، حالا به‌ازای هر منبع:
//   (برنامه‌ی هفتگیِ منبع + استثناهای منبع) − (رزروهای زنده‌ی منبع) − (گذشته/مهلت)
//
// دو حالتِ رزرو:
//   • منبعِ مشخص: مشتری «مینا» را انتخاب کرده → فقط اسلات‌های مینا.
//   • هر منبع: مشتری فرقی نمی‌گذارد → اجتماعِ اسلات‌های همه‌ی منبع‌های واجد،
//     و هنگامِ ثبت، یک منبعِ آزاد به او تخصیص می‌یابد.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'
import { jalaliWeekday, jalaliDateTimeToTimestamp, timeKey, minutesToTime, jalaliKey, getDaysInJalaliMonth, toLatinNum } from './calendar'

export type ServiceRow = { id: string; duration_minutes: number; mode: string }
type Range = { start_time: string; end_time: string; mode: string }
type WeeklyRow = Range & { weekday: number; resource_id: string }
type OverrideRow = Range & { date: string; type: string; resource_id: string }
type BookingRow = { booking_date: string; booking_time: string; resource_id: string }

const LEAD_TIME_MS = 60 * 60 * 1000

function modeCompatible(rangeMode: string, serviceMode: string): boolean {
  if (rangeMode === 'both' || serviceMode === 'both') return true
  return rangeMode === serviceMode
}

/** منبع‌هایی که این سرویس را ارائه می‌دهند. نبودِ ردیف در service_resources = همه. */
async function resourcesForService(tenantId: string, serviceId: string): Promise<string[]> {
  const [{ data: allRes }, { data: mapped }] = await Promise.all([
    sb().from('resources').select('id').eq('tenant_id', tenantId).eq('is_active', true),
    sb().from('service_resources').select('resource_id').eq('service_id', serviceId),
  ])
  const activeIds = (allRes || []).map(r => r.id)
  const mappedIds = (mapped || []).map(m => m.resource_id)
  if (mappedIds.length === 0) return activeIds
  return activeIds.filter(id => mappedIds.includes(id))
}

function effectiveRanges(
  dateStr: string, jy: number, jm: number, jd: number, resourceId: string,
  weekly: WeeklyRow[], overrides: OverrideRow[],
): Range[] {
  const dayOverrides = overrides.filter(o => o.date === dateStr && o.resource_id === resourceId)
  if (dayOverrides.some(o => o.type === 'closed')) return []
  const custom = dayOverrides.filter(o => o.type === 'custom')
  if (custom.length) return custom
  const wd = jalaliWeekday(jy, jm, jd)
  return weekly.filter(w => w.resource_id === resourceId && w.weekday === wd)
}

/** اسلات‌های یک منبعِ مشخص در یک روز (مجموعه‌ی timeKeyهای خالی) */
function slotsForResource(
  dateStr: string, jy: number, jm: number, jd: number, resourceId: string,
  service: ServiceRow, weekly: WeeklyRow[], overrides: OverrideRow[],
  takenByResource: Map<string, Set<number>>, now: number,
): Set<number> {
  const out = new Set<number>()
  const ranges = effectiveRanges(dateStr, jy, jm, jd, resourceId, weekly, overrides)
    .filter(r => modeCompatible(r.mode, service.mode))
  const taken = takenByResource.get(resourceId) || new Set<number>()
  for (const r of ranges) {
    const start = timeKey(toLatinNum(r.start_time)), end = timeKey(toLatinNum(r.end_time))
    for (let t = start; t + service.duration_minutes <= end; t += service.duration_minutes) {
      if (taken.has(t)) continue
      const ts = jalaliDateTimeToTimestamp(dateStr, minutesToTime(t))
      if (ts === null || ts - now < LEAD_TIME_MS) continue
      out.add(t)
    }
  }
  return out
}

/**
 * ساعت‌های خالیِ یک روز.
 * resourceId مشخص → اسلات‌های همان منبع. resourceId=null → اجتماعِ همه‌ی منبع‌های واجد.
 */
export async function computeDaySlots(
  tenantId: string, service: ServiceRow, jy: number, jm: number, jd: number,
  resourceId: string | null = null,
): Promise<string[]> {
  const dateStr = jalaliKey(jy, jm, jd)
  const resourceIds = resourceId ? [resourceId] : await resourcesForService(tenantId, service.id)
  if (resourceIds.length === 0) return []

  const [{ data: weekly }, { data: overrides }, { data: booked }] = await Promise.all([
    sb().from('weekly_schedules').select('resource_id, weekday, start_time, end_time, mode')
      .eq('tenant_id', tenantId).in('resource_id', resourceIds),
    sb().from('schedule_overrides').select('resource_id, date, type, start_time, end_time, mode')
      .eq('tenant_id', tenantId).eq('date', dateStr).in('resource_id', resourceIds),
    sb().from('bookings').select('booking_time, resource_id')
      .eq('tenant_id', tenantId).eq('booking_date', dateStr).in('resource_id', resourceIds)
      .not('status', 'in', '(cancelled)'),
  ])

  const takenByResource = new Map<string, Set<number>>()
  for (const b of (booked || []) as { booking_time: string; resource_id: string }[]) {
    if (!takenByResource.has(b.resource_id)) takenByResource.set(b.resource_id, new Set())
    takenByResource.get(b.resource_id)!.add(timeKey(b.booking_time))
  }

  const now = Date.now()
  const union = new Set<number>()
  for (const rid of resourceIds) {
    const s = slotsForResource(dateStr, jy, jm, jd, rid, service,
      (weekly || []) as WeeklyRow[], (overrides || []) as OverrideRow[], takenByResource, now)
    s.forEach(t => union.add(t))
  }
  return Array.from(union).sort((a, b) => a - b).map(minutesToTime)
}

/**
 * برای ثبتِ رزرو: یک منبعِ آزاد برای این تاریخ/ساعت پیدا می‌کند.
 * اگر resourceId داده شده، فقط همان را بررسی می‌کند. خروجی: id منبعِ آزاد یا null.
 */
export async function findFreeResource(
  tenantId: string, service: ServiceRow, dateStr: string, timeStr: string,
  resourceId: string | null = null,
): Promise<string | null> {
  const [jy, jm, jd] = toLatinNum(dateStr).split('/').map(Number)
  const target = timeKey(timeStr)
  const resourceIds = resourceId ? [resourceId] : await resourcesForService(tenantId, service.id)
  if (resourceIds.length === 0) return null

  const [{ data: weekly }, { data: overrides }, { data: booked }] = await Promise.all([
    sb().from('weekly_schedules').select('resource_id, weekday, start_time, end_time, mode')
      .eq('tenant_id', tenantId).in('resource_id', resourceIds),
    sb().from('schedule_overrides').select('resource_id, date, type, start_time, end_time, mode')
      .eq('tenant_id', tenantId).eq('date', dateStr).in('resource_id', resourceIds),
    sb().from('bookings').select('booking_time, resource_id')
      .eq('tenant_id', tenantId).eq('booking_date', dateStr).in('resource_id', resourceIds)
      .not('status', 'in', '(cancelled)'),
  ])
  const takenByResource = new Map<string, Set<number>>()
  for (const b of (booked || []) as { booking_time: string; resource_id: string }[]) {
    if (!takenByResource.has(b.resource_id)) takenByResource.set(b.resource_id, new Set())
    takenByResource.get(b.resource_id)!.add(timeKey(b.booking_time))
  }
  const now = Date.now()
  for (const rid of resourceIds) {
    const s = slotsForResource(dateStr, jy, jm, jd, rid, service,
      (weekly || []) as WeeklyRow[], (overrides || []) as OverrideRow[], takenByResource, now)
    if (s.has(target)) return rid
  }
  return null
}

/** تعدادِ اسلاتِ خالیِ هر روزِ ماه (اجتماعِ منبع‌ها) — برای رنگ‌آمیزیِ تقویم */
export async function computeMonthAvailability(
  tenantId: string, service: ServiceRow, jy: number, jm: number,
  resourceId: string | null = null,
): Promise<Record<number, number>> {
  const days = getDaysInJalaliMonth(jy, jm)
  const monthPrefix = `${jy}/${String(jm).padStart(2, '0')}/`
  const resourceIds = resourceId ? [resourceId] : await resourcesForService(tenantId, service.id)
  if (resourceIds.length === 0) return {}

  const [{ data: weekly }, { data: overrides }, { data: booked }] = await Promise.all([
    sb().from('weekly_schedules').select('resource_id, weekday, start_time, end_time, mode')
      .eq('tenant_id', tenantId).in('resource_id', resourceIds),
    sb().from('schedule_overrides').select('resource_id, date, type, start_time, end_time, mode')
      .eq('tenant_id', tenantId).like('date', `${monthPrefix}%`).in('resource_id', resourceIds),
    sb().from('bookings').select('booking_date, booking_time, resource_id')
      .eq('tenant_id', tenantId).like('booking_date', `${monthPrefix}%`).in('resource_id', resourceIds)
      .not('status', 'in', '(cancelled)'),
  ])

  const takenByDateResource = new Map<string, Map<string, Set<number>>>()
  for (const b of (booked || []) as BookingRow[]) {
    if (!takenByDateResource.has(b.booking_date)) takenByDateResource.set(b.booking_date, new Map())
    const m = takenByDateResource.get(b.booking_date)!
    if (!m.has(b.resource_id)) m.set(b.resource_id, new Set())
    m.get(b.resource_id)!.add(timeKey(b.booking_time))
  }

  const now = Date.now()
  const result: Record<number, number> = {}
  for (let d = 1; d <= days; d++) {
    const dateStr = jalaliKey(jy, jm, d)
    const takenByResource = takenByDateResource.get(dateStr) || new Map<string, Set<number>>()
    const union = new Set<number>()
    for (const rid of resourceIds) {
      const s = slotsForResource(dateStr, jy, jm, d, rid, service,
        (weekly || []) as WeeklyRow[], (overrides || []) as OverrideRow[], takenByResource, now)
      s.forEach(t => union.add(t))
    }
    result[d] = union.size
  }
  return result
}
