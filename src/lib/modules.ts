import { NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'

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

// نقشه‌ی کامل «کلید ماژول → فعال؟» برای یک tenant (یک کوئری tenant_features +
// کاتالوگ کش‌شده). کلیدهای خارج از کاتالوگ ولی موجود در tenant_features هم
// عینا برگردانده می‌شوند تا هیچ رفتار قدیمی گم نشود.
export async function getEnabledModules(tenantId: string): Promise<Map<string, boolean>> {
  const [catalog, rowsRes] = await Promise.all([
    getModuleCatalog(),
    sb().from('tenant_features').select('feature_key, enabled').eq('tenant_id', tenantId),
  ])
  const rowBy = new Map<string, boolean>((rowsRes.data || []).map(r => [r.feature_key, !!r.enabled]))
  const out = new Map<string, boolean>()
  for (const m of catalog) {
    if (!m.is_active) { out.set(m.key, false); continue }
    out.set(m.key, rowBy.has(m.key) ? rowBy.get(m.key)! : m.default_on)
  }
  rowBy.forEach((v, k) => { if (!out.has(k)) out.set(k, v) })
  return out
}

export async function isModuleEnabled(tenantId: string, key: string): Promise<boolean> {
  const map = await getEnabledModules(tenantId)
  if (!map.has(key)) return true // fail-open: کلید ناشناخته/قبل از migration
  return !!map.get(key)
}

// گارد API — خط اول هر route ماژولی، بعد از auth:
//   const gate = await requireModule(tenant.id, 'waitlist'); if (gate) return gate
// مخفی‌کردن تب در UI کافی نیست؛ بدون این گارد، ماژول «فروختنی» عملا باز است.
export async function requireModule(tenantId: string, key: string): Promise<NextResponse | null> {
  if (await isModuleEnabled(tenantId, key)) return null
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
