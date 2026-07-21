// ── پلن‌ها — فاز P1 قیمت‌گذاری (MODULES.md بخش 9) ───────────────────────────
// «ثابت در کد» طبق تصمیم بخش 6: پلن فقط یک preset از ماژول‌های پلتفرمی است،
// بدون جدول و مکانیک جدید. این فایل عمدا هیچ import سروری ندارد تا در
// کامپوننت‌های کلاینت هم امن باشد (مثل moduleManifest.ts).
//
// سه پلن: پایه (base) / حرفه‌ای (pro) / تیم (team).
// 'free' کلید قدیمی دیتابیس است (default ستون tenants.plan) و alias پایه است —
// طبق قاعده‌ی بخش 5، کلید زنده rename نمی‌شود.

export const PLAN_LABELS: Record<string, string> = {
  free: 'پایه',
  base: 'پایه',
  pro: 'حرفه‌ای',
  team: 'تیم',
}

// ماژول‌های پلتفرمی خارج از منطق پلن — تصمیمشان جای دیگری است و preset
// نباید خاموششان کند (بخش 9.2):
//   card_to_card: تصمیم اعتمادی سوپرادمین per-tenant (ردیف صریح tenant_features)
//   custom_domain: هنوز ساخته نشده؛ add-on آینده
export const OUT_OF_PLAN_KEYS = new Set(['card_to_card', 'custom_domain'])

const BASE = [
  'pay_online',
  'patient_self_cancel',
  'patient_buy_extra_session',
  'intake_form', // ضروری نیچ فعلی؛ scope کاتالوگش هنوز psychology است و از preset عبور نمی‌کند — این‌جا برای روز ارتقایش به platform از حالا درست است
]
const PRO = [
  ...BASE,
  'reminders',
  'waitlist',
  'reviews',
  'analytics',
  'discount_codes',
  'online_meeting',
]
const TEAM = [...PRO, 'multi_therapist', 'campaigns']

export const PLAN_PRESETS: Record<string, Set<string>> = {
  free: new Set(BASE), // alias پایه
  base: new Set(BASE),
  pro: new Set(PRO),
  team: new Set(TEAM),
}

// فاز P6: کلیدهای ترایال 14روزه‌ی «حرفه‌ای» برای ثبت‌نام‌های پلن پایه —
// دقیقا تفاوت حرفه‌ای و پایه (نه تیم: چندپرسنلی تصمیم اعتمادی سوپرادمین است).
export const PRO_TRIAL_KEYS: string[] = PRO.filter(k => !BASE.includes(k))
export const TRIAL_DAYS = 14

// ── قیمت‌های نمایشی (لندینگ/ثبت‌نام/قوانین) — تومان، بدون احتساب مالیات ─────
// ⚠️ منبع «عملیاتی» ردیف‌های plan_prices / plan_fees / plan_sms_quotas در
// platform_settings است (migrationهای 0046..0048). این ثابت فقط نمایشی است؛
// هر تغییری باید هم‌زمان هر دو جا اعمال شود تا اعلامیه و عمل از هم جدا نیفتند.
export const PLAN_PRICING = {
  vatPercent: 10,
  annualFreeMonths: 2, // پرداخت سالانه = 2 ماه رایگان (فاز اول: اعمال دستی)
  base: { monthly: 390000, feePct: 3, feeFloor: 3000, feeCap: 120000, sms: 150, settlement: 'دوهفتگی' },
  pro: { monthly: 890000, feePct: 2.5, feeFloor: 3000, feeCap: 100000, sms: 500, settlement: 'هفتگی' },
  team: { monthly: 1900000, feePct: 2, feeFloor: 3000, feeCap: 80000, sms: 1500, settlement: 'هفتگی', includedStaff: 3, extraStaff: 450000 },
} as const

// preset پلن — پلن ناشناخته/آینده => null یعنی «preset اعمال نشود» (fail-open).
export function planPreset(plan: string | null | undefined): Set<string> | null {
  if (!plan) return null
  return PLAN_PRESETS[plan] ?? null
}
