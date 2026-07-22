// ─────────────────────────────────────────────────────────────────────────────
// فاز P3 قیمت‌گذاری (MODULES.md بخش 9.3) — سهمیه‌ی پیامک per-پلن + اعتبار شارژی.
//
// مدل حسابداری (همان فلسفه‌ی ledger — فقط INSERT، هیچ UPDATE/شمارنده‌ی قابل‌مسابقه):
//   sms_log:     یک ردیف به‌ازای هر پیامک «واقعا ارسال‌شده» (بعد از موفقیت sms.ir).
//                ستون charged می‌گوید از کجا حساب شد: 'quota' (سهمیه‌ی ماه جلالی
//                جاری پلن) | 'credit' (بسته‌ی شارژ خریداری‌شده) | 'over' (پیامک
//                حیاتی که با اتمام هر دو باز هم فرستادیم — OTP هرگز بلاک نمی‌شود).
//   sms_credits: هر شارژ دستی سوپرادمین یک ردیف مثبت. مانده = مجموع شارژها
//                منهای تعداد ردیف‌های charged='credit' در sms_log (بی‌انقضا).
//
// سهمیه‌ی ماهانه: ردیف 'plan_sms_quotas' در platform_settings
//   { "base": 150, "pro": 500, "team": 1500 }   ('free' قدیمی = پایه)
// دوره = ماه جلالی به وقت ایران (قرارداد صورت‌حساب ایرانی محصول).
//
// fail-open (الگوی همیشگی): تا وقتی migration 0047 نخورده (ردیف تنظیمات یا
// جدول‌ها نیستند)، unlimited=true برمی‌گردد و هیچ ارسالی محدود/شمرده نمی‌شود —
// استقرار کد قبل از migration هیچ رفتاری را عوض نمی‌کند.
//
// سیاست بلاک: فقط ارسال‌های «اختیاری» (کمپین، لیست انتظار، یادآور cron) با
// اتمام سهمیه+اعتبار متوقف می‌شوند. OTP حیاتی است و همیشه می‌رود (charged='over').
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'
import { gregorianToJalali, jalaliToGregorian } from './calendar'

// 'booking' = تایید نوبت به مراجع / اطلاع نوبت جدید به متخصص (lib/notify.ts).
// ستون sms_log.kind قید CHECK ندارد، پس افزودن نوع نیازی به migration نداشت.
export type SmsKind = 'otp' | 'reminder' | 'campaign' | 'waitlist' | 'booking'
export type SmsCharge = 'quota' | 'credit' | 'over'

export type SmsAllowance = {
  unlimited: boolean        // تنظیمات/جدول‌ها هنوز نیستند → بدون محدودیت (رفتار قدیمی)
  quota: number             // سهمیه‌ی ماهانه‌ی پلن
  usedThisMonth: number     // مصرف‌شده از سهمیه در ماه جلالی جاری
  quotaRemaining: number
  creditRemaining: number   // مانده‌ی بسته‌های شارژ (بی‌انقضا)
  remaining: number         // quotaRemaining + creditRemaining
}

const UNLIMITED: SmsAllowance = {
  unlimited: true, quota: 0, usedThisMonth: 0, quotaRemaining: 0, creditRemaining: 0, remaining: 0,
}

// شروع ماه جلالی جاری به وقت ایران (UTC+3:30) — برای فیلتر created_at (که UTC است)
export function jalaliMonthStartISO(): string {
  const iranNow = new Date(Date.now() + 3.5 * 3600 * 1000)
  // قرارداد کدبیس: gregorianToJalali ماه 0-indexed برمی‌گرداند؛ jalaliToGregorian ماه 1-indexed می‌گیرد
  const j = gregorianToJalali(iranNow.getUTCFullYear(), iranNow.getUTCMonth() + 1, iranNow.getUTCDate())
  const g = jalaliToGregorian(j.year, j.month + 1, 1)
  // نیمه‌شب ایران = UTC منهای 3:30
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd) - 3.5 * 3600 * 1000).toISOString()
}

async function getPlanQuotas(): Promise<Record<string, number> | null> {
  try {
    const { data } = await sb().from('platform_settings').select('value').eq('key', 'plan_sms_quotas').maybeSingle()
    const v = data?.value as any
    if (!v || typeof v !== 'object' || typeof v.base !== 'number') return null
    return v
  } catch { return null }
}

export async function getSmsAllowance(tenantId: string, plan?: string): Promise<SmsAllowance> {
  const quotas = await getPlanQuotas()
  if (!quotas) return UNLIMITED

  let effectivePlan = plan
  if (effectivePlan === undefined) {
    const { data } = await sb().from('tenants').select('plan').eq('id', tenantId).maybeSingle()
    effectivePlan = data?.plan
  }
  const key = effectivePlan === 'free' || !effectivePlan ? 'base' : effectivePlan
  const quota = typeof quotas[key] === 'number' ? quotas[key] : quotas.base

  try {
    const since = jalaliMonthStartISO()
    const [usedRes, creditsRes, creditUsedRes] = await Promise.all([
      sb().from('sms_log').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).eq('charged', 'quota').gte('created_at', since),
      sb().from('sms_credits').select('amount').eq('tenant_id', tenantId),
      sb().from('sms_log').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).eq('charged', 'credit'),
    ])
    const usedThisMonth = usedRes.count || 0
    const creditTotal = (creditsRes.data || []).reduce((s, r) => s + (r.amount || 0), 0)
    const creditRemaining = Math.max(0, creditTotal - (creditUsedRes.count || 0))
    const quotaRemaining = Math.max(0, quota - usedThisMonth)
    return { unlimited: false, quota, usedThisMonth, quotaRemaining, creditRemaining, remaining: quotaRemaining + creditRemaining }
  } catch {
    // جدول‌ها هنوز نیستند → بدون محدودیت
    return UNLIMITED
  }
}

// تخصیص محل حساب برای ارسال بعدی و کم‌کردن از کپی محلی allowance (برای
// حلقه‌ها/ارسال گروهی بدون کوئری per-پیام). خود شیء را mutate می‌کند.
export function allocateCharge(al: SmsAllowance): SmsCharge {
  if (al.unlimited) return 'quota'
  if (al.quotaRemaining > 0) { al.quotaRemaining--; al.remaining = Math.max(0, al.remaining - 1); return 'quota' }
  if (al.creditRemaining > 0) { al.creditRemaining--; al.remaining = Math.max(0, al.remaining - 1); return 'credit' }
  return 'over'
}

// ثبت پیامک‌های ارسال‌شده — فقط بعد از موفقیت ارسال صدا زده شود. هرگز throw
// نمی‌کند (شمارش نباید فلو ارسال را بشکند). قبل از migration جدول نیست → no-op.
export async function logSmsSent(tenantId: string, kind: SmsKind, charges: SmsCharge | SmsCharge[]): Promise<void> {
  const list = Array.isArray(charges) ? charges : [charges]
  if (list.length === 0) return
  try {
    const rows = list.map(c => ({ tenant_id: tenantId, kind, charged: c }))
    const { error } = await sb().from('sms_log').insert(rows)
    if (error && !/does not exist/i.test(error.message || '')) console.error('logSmsSent error:', error.message)
  } catch (e) { console.error('logSmsSent exception:', e) }
}
