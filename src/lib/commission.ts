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
