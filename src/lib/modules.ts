import { NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { planPreset, OUT_OF_PLAN_KEYS } from '@/lib/plans'

// ── سیستم ماژولار (قابلیت = محصول) — سطح پلتفرم، نه مخصوص هیچ نیچی ─────────
// طراحی کامل در MODULES.md. اصل: «ماژولار در دیتا، یکپارچه در کد» —
// این فایل فقط «فعال‌بودن» را از دیتا می‌خواند؛ UI و منطق هر ماژول کد واقعی است.
//
// منطق فعال‌بودن یک ماژول برای یک tenant:
//   1) اگر ماژول در کاتالوگ is_active=false باشد → خاموش برای همه.
//   2) اگر ردیف tenant_features برای این tenant وجود دارد → همان enabled.
//   3) وگرنه → default_on ماژول در کاتالوگ.
// این دقیقا همان رفتاری است که قبلا هاردکد بود (PATIENT_FEATURE_KEYS پیش‌فرض
// روشن، multi_therapist پیش‌فرض خاموش) — فقط دیتایی شده.
//
// ⚠️ fail-open عمدی: اگر جدول modules هنوز ساخته نشده (migration اجرا نشده)
// یا کلیدی در کاتالوگ نیست، همه‌چیز مثل قبل روشن رفتار می‌کند — دیپلوی کد قبل
// از اجرای migration هیچ‌چیز را نمی‌شکند.

export type ModuleRow = {
  key: string
  display_name: string
  description: string
  scope: string            // 'platform' | 'psychology' | ...
  depends_on: string[]     // عضو 'a|b' یعنی «حداقل یکی از a یا b»
  default_on: boolean
  enforced: boolean        // آیا کد واقعا این کلید را گیت می‌کند؟
  pricing_type: string
  price: number
  is_active: boolean
  sort_order: number
}

// کاتالوگ کوچک است و به‌ندرت عوض می‌شود — کش کوتاه per-instance کافی است
// (serverless حافظه‌ی مشترک ندارد؛ حداکثر تاخیر دیده‌شدن تغییر کاتالوگ = TTL).
let catalogCache: { rows: ModuleRow[]; at: number } | null = null
const CATALOG_TTL_MS = 60_000

export async function getModuleCatalog(): Promise<ModuleRow[]> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.rows
  const { data, error } = await sb().from('modules').select('*').order('sort_order', { ascending: true })
  if (error) {
    // جدول احتمالا هنوز وجود ندارد — کاتالوگ خالی یعنی همه‌ی گاردها fail-open
    console.error('getModuleCatalog error (migration 0029 اجرا شده؟):', error.message)
    return catalogCache?.rows || []
  }
  const rows = (data || []).map(r => ({
    ...r,
    depends_on: Array.isArray(r.depends_on) ? r.depends_on : [],
  })) as ModuleRow[]
  catalogCache = { rows, at: Date.now() }
  return rows
}

// آیا preset پلن‌ها اعمال شود؟ کلید 'plans_enforced' در platform_settings
// (migration 0045). تا وقتی true نشده، رفتار دقیقا مثل قبل است — دیپلوی کد
// قبل از اجرای migration هیچ‌چیز را نمی‌شکند (همان الگوی fail-open کاتالوگ).
// کش کوتاه per-instance مثل خود کاتالوگ.
let plansEnforcedCache: { v: boolean; at: number } | null = null

async function plansEnforced(): Promise<boolean> {
  if (plansEnforcedCache && Date.now() - plansEnforcedCache.at < CATALOG_TTL_MS) return plansEnforcedCache.v
  let v = false
  try {
    const { data } = await sb().from('platform_settings').select('value').eq('key', 'plans_enforced').maybeSingle()
    v = data?.value === true
  } catch { /* جدول/ردیف هنوز نیست → اعمال نشود */ }
  plansEnforcedCache = { v, at: Date.now() }
  return v
}

// نقشه‌ی کامل «کلید ماژول → فعال؟» برای یک tenant. ترتیب حل (MODULES.md بخش 9.8):
//   is_active=false کاتالوگ → خاموش برای همه
//   ردیف tenant_features → برنده (add-on / دستی / grandfather / trial)
//   preset پلن tenants.plan → فقط ماژول‌های scope='platform' و خارج از OUT_OF_PLAN_KEYS
//   default_on کاتالوگ → fallback نهایی (رفتار قدیمی)
// plan اختیاری است: اگر caller آن را دارد (Tenant لودشده) پاسش بدهد؛ وگرنه
// همین‌جا خوانده می‌شود (کوئری موازی، بدون تاخیر اضافه).
export async function getEnabledModules(tenantId: string, plan?: string): Promise<Map<string, boolean>> {
  const [catalog, rowsRes, enforced, planRes] = await Promise.all([
    getModuleCatalog(),
    sb().from('tenant_features').select('feature_key, enabled, expires_at').eq('tenant_id', tenantId),
    plansEnforced(),
    plan === undefined
      ? sb().from('tenants').select('plan').eq('id', tenantId).maybeSingle()
      : Promise.resolve(null),
  ])
  const effectivePlan = plan !== undefined ? plan : (planRes && 'data' in planRes ? planRes.data?.plan : undefined)
  const preset = enforced ? planPreset(effectivePlan) : null
  // فاز P6: ردیف منقضی‌شده (expires_at گذشته — مثل ترایال 14روزه) نادیده گرفته
  // می‌شود و حل به preset پلن / default_on می‌افتد. یعنی «downgrade خودکار»
  // بدون هیچ cron یا UPDATE — انقضا خود مکانیزم است. expires_at=null = دائمی.
  const now = Date.now()
  const rowBy = new Map<string, boolean>(
    (rowsRes.data || [])
      .filter(r => !r.expires_at || new Date(r.expires_at).getTime() > now)
      .map(r => [r.feature_key, !!r.enabled])
  )
  const out = new Map<string, boolean>()
  for (const m of catalog) {
    if (!m.is_active) { out.set(m.key, false); continue }
    if (rowBy.has(m.key)) { out.set(m.key, rowBy.get(m.key)!); continue }
    if (preset && m.scope === 'platform' && !OUT_OF_PLAN_KEYS.has(m.key)) {
      out.set(m.key, preset.has(m.key)); continue
    }
    out.set(m.key, m.default_on)
  }
  rowBy.forEach((v, k) => { if (!out.has(k)) out.set(k, v) })
  return out
}

export async function isModuleEnabled(tenantId: string, key: string, plan?: string): Promise<boolean> {
  const map = await getEnabledModules(tenantId, plan)
  if (!map.has(key)) return true // fail-open: کلید ناشناخته/قبل از migration
  return !!map.get(key)
}

// گارد API — خط اول هر route ماژولی، بعد از auth:
//   const gate = await requireModule(tenant.id, 'waitlist'); if (gate) return gate
// مخفی‌کردن تب در UI کافی نیست؛ بدون این گارد، ماژول «فروختنی» عملا باز است.
// plan اختیاری: اگر caller شیء Tenant را دارد، t.plan را پاس بدهد (یک کوئری کمتر).
export async function requireModule(tenantId: string, key: string, plan?: string): Promise<NextResponse | null> {
  if (await isModuleEnabled(tenantId, key, plan)) return null
  return NextResponse.json({ error: 'این قابلیت برای این مجموعه فعال نیست' }, { status: 403 })
}

// ── وابستگی‌ها (برای سوپرادمین) ────────────────────────────────────────────
// عضوهای depends_on که با وضعیت فعلی برآورده نیستند را برمی‌گرداند.
export function unmetDependencies(mod: ModuleRow, enabled: Map<string, boolean>): string[] {
  return (mod.depends_on || []).filter(dep =>
    !dep.split('|').some(k => enabled.get(k.trim()) === true)
  )
}

// ماژول‌های فعالی که (بعد از خاموش‌شدن key) وابستگی برآورده‌نشده پیدا می‌کنند.
export function dependentsBlockedBy(key: string, catalog: ModuleRow[], enabled: Map<string, boolean>): ModuleRow[] {
  const after = new Map(enabled)
  after.set(key, false)
  return catalog.filter(m =>
    m.key !== key &&
    enabled.get(m.key) === true &&
    (m.depends_on || []).some(dep => dep.split('|').map(s => s.trim()).includes(key)) &&
    unmetDependencies(m, after).length > 0
  )
}

// عضو depends_on را برای پیام خطا خوانا می‌کند («الف یا ب»).
export function dependencyLabel(dep: string, catalog: ModuleRow[]): string {
  return dep.split('|').map(k => {
    const m = catalog.find(c => c.key === k.trim())
    return m?.display_name || k.trim()
  }).join(' یا ')
}
