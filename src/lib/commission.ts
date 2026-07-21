// ─────────────────────────────────────────────────────────────────────────────
// حل‌وفصل درصد کمیسیون — سراسری با امکان override به‌ازای هر متخصص.
//
// منبع درصد سراسری: ردیف 'commission_percent' در جدول platform_settings
// (migration 0033). این عدد بدون دیپلوی مجدد از پنل super قابل تغییر است.
// اگر آن ردیف نبود (مثلا migration هنوز نخورده)، به ثابت config برمی‌گردیم تا
// رفتار قدیمی نشکند (fail-safe، نه fail-zero).
//
// override متخصص: psy_resource_profiles.commission_percent_override — اگر null
// نباشد، به‌جای درصد سراسری برای همان متخصص استفاده می‌شود.
//
// مهم: این فقط برای پرداخت آنلاین معنا دارد. کارت‌به‌کارت مستقیم بین مراجع و
// دکتر است و اصلا از حساب پلتفرم رد نمی‌شود، پس کمیسیونش همیشه صفر است (جای
// دیگری در کد این‌طور ثبت می‌شود) — این‌جا دستش نمی‌زنیم.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'
import { PLATFORM_COMMISSION_PERCENT as CONFIG_DEFAULT } from './config'

// درصد سراسری فعلی — از platform_settings؛ اگر نبود، ثابت config.
export async function getGlobalCommissionPercent(): Promise<number> {
  try {
    const { data } = await sb().from('platform_settings').select('value').eq('key', 'commission_percent').maybeSingle()
    const v = data?.value
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n
  } catch { /* جدول هنوز نیست → fallback */ }
  return CONFIG_DEFAULT
}

// درصد موثر برای یک متخصص: override اگر بود، وگرنه سراسری.
export async function resolveCommissionPercent(resourceId: string | null): Promise<number> {
  const globalPct = await getGlobalCommissionPercent()
  if (!resourceId) return globalPct
  try {
    const { data } = await sb().from('psy_resource_profiles')
      .select('commission_percent_override').eq('resource_id', resourceId).maybeSingle()
    const o = data?.commission_percent_override
    if (typeof o === 'number' && Number.isFinite(o) && o >= 0 && o <= 100) return o
  } catch { /* ستون هنوز نیست → سراسری */ }
  return globalPct
}

// ─────────────────────────────────────────────────────────────────────────────
// فاز P2 قیمت‌گذاری (MODULES.md بخش 9.4 و 9.6) — کارمزد تراکنش per-پلن،
// فقط با «کف» (بازنگری 1405/04/30: سقف حذف شد) + تفکیک پایه/مالیات.
//
// منبع: ردیف 'plan_fees' در platform_settings (migration 0046، اصلاح 0050):
//   { "vat_percent": 10,
//     "plans": { "base": {"pct":3,"floor":3000},
//                "pro":  {"pct":2.5,"floor":3000},
//                "team": {"pct":2,"floor":3000} } }
// فرمول: base = max(round(pct×amount), floor)؛ vat = round(base×vat%)؛
// کل کسر = base + vat (کارمزد اعلامی «بدون احتساب مالیات» است — بخش 9.6).
// اگر ردیف قدیمی هنوز cap داشته باشد، نادیده گرفته می‌شود.
//
// ترتیب حل (fail-safe در هر دو جهت استقرار):
//   1) override per-متخصص → مدل قدیمی خالص (درصد×مبلغ، بدون کف/سقف/تفکیک VAT)
//      — معامله‌های خاص موجود (از جمله override=0 یعنی معاف) عینا حفظ می‌شوند؛
//      کف نباید معافیت را نقض کند.
//   2) ردیف plan_fees موجود → فرمول سقف‌دار per-پلن ('free' قدیمی = پایه).
//   3) ردیف نیست (migration هنوز نخورده) → مدل قدیمی سراسری (7%) — دیپلوی کد
//      قبل از migration هیچ رفتاری را عوض نمی‌کند.
// ─────────────────────────────────────────────────────────────────────────────

type PlanFeeRule = { pct: number; floor: number }
type PlanFeesSetting = { vat_percent: number; plans: Record<string, PlanFeeRule> }

function validRule(r: any): r is PlanFeeRule {
  return r && typeof r.pct === 'number' && Number.isFinite(r.pct) && r.pct >= 0 && r.pct <= 100
    && typeof r.floor === 'number' && r.floor >= 0
}

async function getPlanFeesSetting(): Promise<PlanFeesSetting | null> {
  try {
    const { data } = await sb().from('platform_settings').select('value').eq('key', 'plan_fees').maybeSingle()
    const v = data?.value as any
    if (!v || typeof v !== 'object' || !v.plans || typeof v.plans !== 'object') return null
    const vat = typeof v.vat_percent === 'number' && v.vat_percent >= 0 && v.vat_percent <= 100 ? v.vat_percent : 10
    const plans: Record<string, PlanFeeRule> = {}
    for (const [k, r] of Object.entries(v.plans)) if (validRule(r)) plans[k] = r
    if (!plans.base) return null // بدون قاعده‌ی پایه، تنظیم ناقص است → مدل قدیمی
    return { vat_percent: vat, plans }
  } catch { return null }
}

export type TransactionFee = {
  percent: number            // درصد اعلامی (پایه، بدون VAT) — برای ستون commission_percent
  baseAmount: number | null  // کارمزد پایه (تومان) — null یعنی مدل قدیمی (تفکیک ندارد)
  vatAmount: number | null   // مالیات بر ارزش افزوده روی کارمزد
  totalAmount: number        // کل کسر از تراکنش — همان چیزی که در commission_amount می‌نشیند
}

export async function resolveTransactionFee(
  plan: string | null | undefined, resourceId: string | null, amount: number
): Promise<TransactionFee> {
  if (!Number.isFinite(amount) || amount <= 0) return { percent: 0, baseAmount: null, vatAmount: null, totalAmount: 0 }

  // 1) معامله‌ی خاص per-متخصص — عینا مدل قدیمی
  if (resourceId) {
    try {
      const { data } = await sb().from('psy_resource_profiles')
        .select('commission_percent_override').eq('resource_id', resourceId).maybeSingle()
      const o = data?.commission_percent_override
      if (typeof o === 'number' && Number.isFinite(o) && o >= 0 && o <= 100) {
        return { percent: o, baseAmount: null, vatAmount: null, totalAmount: Math.round(amount * (o / 100)) }
      }
    } catch { /* ستون نیست → ادامه */ }
  }

  // 2) فرمول per-پلن
  const setting = await getPlanFeesSetting()
  if (setting) {
    const key = plan === 'free' || !plan ? 'base' : plan
    const rule = setting.plans[key] || setting.plans.base
    let base = Math.max(Math.round(amount * (rule.pct / 100)), rule.floor)
    let vat = Math.round(base * (setting.vat_percent / 100))
    if (base + vat > amount) {
      // تراکنش خیلی کوچک — کل کسر هرگز از خود مبلغ بیشتر نمی‌شود
      base = Math.floor(amount / (1 + setting.vat_percent / 100))
      vat = amount - base
    }
    return { percent: rule.pct, baseAmount: base, vatAmount: vat, totalAmount: base + vat }
  }

  // 3) مدل قدیمی سراسری
  const pct = await getGlobalCommissionPercent()
  return { percent: pct, baseAmount: null, vatAmount: null, totalAmount: Math.round(amount * (pct / 100)) }
}
