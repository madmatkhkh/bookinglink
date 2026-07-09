// ─────────────────────────────────────────────────────────────────────────────
// لایه‌ی مشترکِ نیچِ روانشناسی — قیمت‌گذاری، قوانین، و تنظیماتِ per-tenant.
// معادلِ config.ts + settings.ts در psych-booking، ولی چندمستاجری.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'

// قیمت‌گذاریِ پیش‌فرضِ سراسری (تومان) — برایِ متخصص‌هایی که هنوز قیمتِ خودشان را
// تنظیم نکرده‌اند. قیمتِ واقعیِ هر متخصص per-resource است (پایین‌تر).
// مدل عمداً ساده است: فقط دو قیمت — آنلاین و حضوری. نوعِ کار (مصاحبه/ارزیابی/
// جلسه/پروتکل) فرقی نمی‌کند؛ فقط اینکه حضوری برگزار شود یا آنلاین قیمت را
// تعیین می‌کند (تصمیمِ صریحِ صاحبِ پروژه، جولای ۲۰۲۶).
export const PSY_PRICING = {
  online: 850000,
  offline: 1200000,
}

// ── قیمت‌گذاریِ خودِ متخصص (per-resource) ────────────────────────────────────
export type Pricing = { online: number; offline: number }
export const DEFAULT_PRICING: Pricing = { ...PSY_PRICING }

// قیمت بر اساسِ نوعِ حضور (نه نوعِ کار) — مصاحبه/ارزیابی/جلسه/پروتکل همه از همین برمی‌آیند
export function resolvePrice(mode: string, pricing: Pricing = DEFAULT_PRICING): number {
  return mode === 'online' ? pricing.online : pricing.offline
}

export function mergePricing(raw: any): Pricing {
  const clamp = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback)
  // سازگاریِ عقب‌رو: داده‌هایِ قدیمی (پیش از تصمیمِ «فقط دو قیمت») ممکن است
  // شکلِ قدیمی داشته باشند {interview, assessment, sessionOnline, sessionOffline}؛
  // در آن صورت sessionOnline/sessionOffline را به‌عنوانِ نزدیک‌ترین معادل مهاجرت می‌دهیم.
  if (raw && typeof raw.online !== 'number' && typeof raw?.sessionOnline === 'number') {
    return {
      online: clamp(raw.sessionOnline, DEFAULT_PRICING.online),
      offline: clamp(raw.sessionOffline, DEFAULT_PRICING.offline),
    }
  }
  return {
    online: clamp(raw?.online, DEFAULT_PRICING.online),
    offline: clamp(raw?.offline, DEFAULT_PRICING.offline),
  }
}

// قیمتِ فعلیِ یک متخصصِ مشخص (برایِ محاسبه‌ی مبلغ در لحظه‌ی ساختِ مرحله/جلسه/پروتکل)
export async function getResourcePricing(resourceId: string | null | undefined): Promise<Pricing> {
  if (!resourceId) return DEFAULT_PRICING
  try {
    const { data } = await sb().from('psy_resource_profiles').select('pricing').eq('resource_id', resourceId).maybeSingle()
    return mergePricing(data?.pricing)
  } catch {
    return DEFAULT_PRICING
  }
}

// مبلغِ کلِ یک پروتکلِ درمان از رویِ ترکیبِ جلساتِ کودک/والدین + قیمتِ داده‌شده
export function packageAmount(p: { primary_sessions: number; primary_session_type: string; secondary_sessions: number; secondary_session_type: string }, pricing: Pricing = DEFAULT_PRICING): number {
  return (p.primary_sessions * resolvePrice(p.primary_session_type, pricing))
    + (p.secondary_sessions * resolvePrice(p.secondary_session_type, pricing))
}

// ── کدِ تخفیف — per-resource، اختیاری برایِ بعضی مراجعان ─────────────────────
export type DiscountCheckResult =
  | { ok: true; id: string; discountedAmount: number; discountAmount: number; code: string }
  | { ok: false; error: string }

// چکِ اعتبار + محاسبه‌ی مبلغِ تخفیف‌خورده — used_count را خودش +۱ نمی‌کند (آن را
// صدازننده بعد از موفقیتِ قطعیِ پرداخت انجام می‌دهد تا کدهایِ ناموفق/رهاشده مصرف نشوند)
export async function checkDiscountCode(resourceId: string, rawCode: string, amount: number): Promise<DiscountCheckResult> {
  const code = String(rawCode || '').trim().toUpperCase()
  if (!code) return { ok: false, error: 'کد را وارد کنید' }
  const { data: dc } = await sb().from('psy_discount_codes').select('*')
    .eq('resource_id', resourceId).eq('code', code).maybeSingle()
  if (!dc) return { ok: false, error: 'کدِ تخفیف یافت نشد' }
  if (!dc.is_active) return { ok: false, error: 'این کد دیگر فعال نیست' }
  if (dc.expires_at && new Date(dc.expires_at).getTime() < Date.now()) return { ok: false, error: 'این کد منقضی شده' }
  if (dc.max_uses !== null && dc.used_count >= dc.max_uses) return { ok: false, error: 'ظرفیتِ استفاده از این کد تمام شده' }

  const discountAmount = dc.discount_type === 'percent'
    ? Math.round(amount * (Number(dc.discount_value) / 100))
    : Math.min(amount, Math.round(Number(dc.discount_value)))
  const discountedAmount = Math.max(0, amount - discountAmount)
  return { ok: true, id: dc.id, discountedAmount, discountAmount, code }
}

// بعد از قطعی‌شدنِ پرداخت با این کد، مصرفش را ثبت کن (idempotent نیست — فقط یک‌بار صدا زده شود)
export async function redeemDiscountCode(id: string): Promise<void> {
  try {
    const { data } = await sb().from('psy_discount_codes').select('used_count').eq('id', id).maybeSingle()
    if (data) await sb().from('psy_discount_codes').update({ used_count: (data.used_count || 0) + 1 }).eq('id', id)
  } catch { /* شکستِ ثبتِ مصرف نباید پرداختِ موفق را خراب کند */ }
}

// قانونِ کنسلی: اگر ≥ partialHours ساعت مانده کنسل شود، partialPercent٪ سوخت
export const PSY_CANCEL = { partialHours: 12, partialPercent: 50 }

// نوبت‌گیری زودتر از این تعداد روز ممکن نیست (از فردا)
export const PSY_BOOKING = { minLeadDays: 1 }

export type SessionMode = 'both' | 'online' | 'offline'
export type OfficeLocation = { id: string; title: string; address: string }
export type PaymentCardInfo = { id: string; number: string; holder: string; bank?: string }

// ── سطحِ tenant/برند: چیزی که بینِ همه‌ی دکترهای همان مجموعه مشترک است ────────
export type ClinicSettings = {
  office_locations: OfficeLocation[]
}

export const DEFAULT_CLINIC: ClinicSettings = {
  office_locations: [],
}

export function mergeClinic(raw: Partial<ClinicSettings> | null | undefined): ClinicSettings {
  if (!raw) return DEFAULT_CLINIC
  return {
    office_locations: Array.isArray(raw.office_locations) ? raw.office_locations : [],
  }
}

// تنظیماتِ کلینیکِ یک tenant را می‌خواند (سطحِ tenant، مشترکِ همه‌ی دکترها)
export async function getClinicSettings(tenantId: string): Promise<ClinicSettings> {
  try {
    const { data } = await sb().from('psy_clinic_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
    return mergeClinic(data as Partial<ClinicSettings> | null)
  } catch {
    return DEFAULT_CLINIC
  }
}

// ── سیاستِ کنسلی — قابلِ‌تنظیم توسطِ هر دکتر ──────────────────────────────────
// اگر مراجع ≥ threshold_hours ساعت مانده کنسل کند: early_refund_percent٪ برمی‌گردد.
// اگر کمتر از آن مانده باشد: late_refund_percent٪ برمی‌گردد (می‌تواند صفر باشد).
// enabled=false یعنی مراجع اصلاً نمی‌تواند خودش کنسل کند.
export type CancellationPolicy = {
  enabled: boolean
  threshold_hours: number
  early_refund_percent: number
  late_refund_percent: number
}

// پیش‌فرض دقیقاً همان قانونِ سراسریِ قبلی (PSY_CANCEL) است — تک‌دکترهای فعلی
// هیچ تغییری در رفتار نمی‌بینند مگر خودشان دستکاری کنند.
export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  enabled: true, threshold_hours: 12, early_refund_percent: 50, late_refund_percent: 0,
}

export function mergeCancellationPolicy(raw: Partial<CancellationPolicy> | null | undefined): CancellationPolicy {
  if (!raw) return DEFAULT_CANCELLATION_POLICY
  return {
    enabled: raw.enabled !== false,
    threshold_hours: Number.isFinite(raw.threshold_hours) ? Number(raw.threshold_hours) : DEFAULT_CANCELLATION_POLICY.threshold_hours,
    early_refund_percent: Number.isFinite(raw.early_refund_percent) ? Number(raw.early_refund_percent) : DEFAULT_CANCELLATION_POLICY.early_refund_percent,
    late_refund_percent: Number.isFinite(raw.late_refund_percent) ? Number(raw.late_refund_percent) : DEFAULT_CANCELLATION_POLICY.late_refund_percent,
  }
}

// ── روش‌های پرداختِ فعال — حداقل یکی باید روشن بماند (سمتِ API هم چک می‌شود) ──
export type PaymentMethods = { card_to_card: boolean; online: boolean }
export const DEFAULT_PAYMENT_METHODS: PaymentMethods = { card_to_card: true, online: false }

export function mergePaymentMethods(raw: Partial<PaymentMethods> | null | undefined): PaymentMethods {
  if (!raw) return DEFAULT_PAYMENT_METHODS
  const card = raw.card_to_card !== false
  const online = raw.online === true
  // هردو خاموش معنی ندارد — کارت‌به‌کارت را روشن نگه می‌داریم
  return { card_to_card: card || !online, online }
}

// ── محدودیتِ پلنِ رایگان: فقط پرداختِ آنلاین (تصمیمِ کسب‌وکاریِ صریح) ─────────
// کارمزدِ پلتفرم فقط از تراکنشِ آنلاین (که از مرچنتِ خودِ پلتفرم رد می‌شود) قابلِ
// دریافت است؛ کارت‌به‌کارت مستقیم بینِ مراجع و دکتر است و ردی برایِ پلتفرم نمی‌ماند.
// این محاسبه در لحظه‌ی مصرف انجام می‌شود (نه فقط روی مقدارِ ذخیره‌شده) تا حتی اگر
// دکتر تنظیماتش را دوباره ذخیره نکرده باشد یا پلن تازه عوض شده باشد، همیشه درست
// باشد — دفاعِ اصلی در نقاطی است که واقعاً پول حرکت می‌کند (pay/pay-online).
export function effectivePaymentMethods(pm: PaymentMethods, plan: string): PaymentMethods {
  if (plan !== 'pro') return { card_to_card: false, online: true }
  return pm
}

// اعتبارسنجیِ فرمتِ شماره‌شبا: IR + ۲۴ رقم (استانداردِ ایران). فقط فرمت را چک
// می‌کند، نه اینکه حسابِ واقعی وجود دارد یا نام صاحبش درست است (آن را خودِ
// زیبال هنگامِ تعریفِ ذی‌نفع تایید می‌کند).
export function isValidSheba(raw: string): boolean {
  const s = String(raw || '').trim().toUpperCase().replace(/\s/g, '')
  return /^IR\d{24}$/.test(s)
}

// ── سطحِ resource/شخص: پروفایلِ هرکارمند (دکتر) — نام/عنوان/آواتار از خودِ
// جدولِ resources می‌آید (اینجا تکرار نشده)؛ این‌ها فقط چیزهایی‌اند که هر دکتر
// مستقل از بقیه مدیریت می‌کند.
// لیستِ ساعت‌های استانداردِ پیش‌فرض که در تبِ «روزهای کاری» به‌عنوانِ گزینه‌های
// سریع نشان داده می‌شوند؛ هر دکتر می‌تواند از پنلِ خودش این لیست را ویرایش کند
// (افزودن/حذفِ ساعت) — پس این‌جا فقط مقدارِ پیش‌فرضِ اولیه برای دکترهای تازه است.
export const DEFAULT_QUICK_TIMES = ['8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00']

export type ResourceProfile = {
  resource_id: string
  badges: string[]
  session_modes: SessionMode
  cards: PaymentCardInfo[]
  cancellation_policy: CancellationPolicy
  payment_methods: PaymentMethods
  quick_times: string[]
  settlement_sheba: string
  settlement_sheba_holder_name: string
  pricing: Pricing
  // برچسبِ «تماسِ دوم/همراه» — به‌انتخابِ خودِ متخصص. خالی = این مفهوم اصلاً
  // استفاده نمی‌شود (مثلاً درمانِ فردیِ بزرگسال)؛ پر = نام و مسیرِ جلسه‌ی دومی
  // با همین برچسب نمایش داده می‌شود (مثلاً «والدین»، «همسر»، «همراه»).
  companion_label: string
}

export const DEFAULT_RESOURCE_PROFILE: Omit<ResourceProfile, 'resource_id'> = {
  badges: [],
  session_modes: 'both',
  cards: [],
  cancellation_policy: DEFAULT_CANCELLATION_POLICY,
  payment_methods: DEFAULT_PAYMENT_METHODS,
  quick_times: DEFAULT_QUICK_TIMES,
  settlement_sheba: '',
  settlement_sheba_holder_name: '',
  pricing: DEFAULT_PRICING,
  companion_label: '',
}

export function mergeResourceProfile(resourceId: string, raw: Partial<ResourceProfile> | null | undefined): ResourceProfile {
  const mode: SessionMode =
    raw?.session_modes === 'online' || raw?.session_modes === 'offline' ? raw.session_modes : 'both'
  return {
    resource_id: resourceId,
    badges: Array.isArray(raw?.badges) ? raw!.badges : [],
    session_modes: mode,
    cards: Array.isArray(raw?.cards) ? raw!.cards : [],
    cancellation_policy: mergeCancellationPolicy(raw?.cancellation_policy),
    payment_methods: mergePaymentMethods(raw?.payment_methods),
    quick_times: Array.isArray(raw?.quick_times) && raw!.quick_times.length > 0 ? raw!.quick_times : DEFAULT_QUICK_TIMES,
    settlement_sheba: typeof raw?.settlement_sheba === 'string' ? raw.settlement_sheba : '',
    settlement_sheba_holder_name: typeof raw?.settlement_sheba_holder_name === 'string' ? raw.settlement_sheba_holder_name : '',
    pricing: mergePricing(raw?.pricing),
    companion_label: typeof raw?.companion_label === 'string' ? raw.companion_label.trim().slice(0, 20) : '',
  }
}

// پروفایلِ یک دکترِ مشخص (per-resource)
export async function getResourceProfile(resourceId: string): Promise<ResourceProfile> {
  try {
    const { data } = await sb().from('psy_resource_profiles').select('*').eq('resource_id', resourceId).maybeSingle()
    return mergeResourceProfile(resourceId, data as Partial<ResourceProfile> | null)
  } catch {
    return mergeResourceProfile(resourceId, null)
  }
}

// سیاستِ کنسلیِ یک دکترِ مشخص (میان‌بر — بدونِ خواندنِ کلِ پروفایل)
export async function getCancellationPolicy(resourceId: string): Promise<CancellationPolicy> {
  try {
    const { data } = await sb().from('psy_resource_profiles').select('cancellation_policy').eq('resource_id', resourceId).maybeSingle()
    return mergeCancellationPolicy(data?.cancellation_policy)
  } catch {
    return DEFAULT_CANCELLATION_POLICY
  }
}

// روش‌های پرداختِ فعالِ یک دکترِ مشخص
export async function getPaymentMethods(resourceId: string): Promise<PaymentMethods> {
  try {
    const { data } = await sb().from('psy_resource_profiles').select('payment_methods').eq('resource_id', resourceId).maybeSingle()
    return mergePaymentMethods(data?.payment_methods)
  } catch {
    return DEFAULT_PAYMENT_METHODS
  }
}

// لیستِ دکترهای قابل‌انتخابِ یک tenant برای صفحه‌ی عمومی (نام/عنوان/آواتار از
// resources + بج/مدِ جلسه از پروفایلِ خودشان). تک‌دکترها یک آیتم می‌گیرند.
export type PublicDoctor = {
  id: string
  name: string
  title: string
  avatar_url: string | null
  badges: string[]
  session_modes: SessionMode
  cards: PaymentCardInfo[]
  payment_methods: PaymentMethods
  cancellation_policy: CancellationPolicy
  pricing: Pricing
  companion_label: string
}

export async function listPublicDoctors(tenantId: string, plan: string): Promise<PublicDoctor[]> {
  const { data: resources } = await sb().from('resources').select('id, name, title, avatar_url, sort_order')
    .eq('tenant_id', tenantId).eq('is_active', true).eq('is_selectable', true)
    .order('sort_order').order('created_at')
  const list = resources || []
  if (list.length === 0) return []
  const { data: profiles } = await sb().from('psy_resource_profiles').select('*')
    .in('resource_id', list.map(r => r.id))
  const byId = new Map((profiles || []).map(p => [p.resource_id, p]))
  return list.map(r => {
    const prof = mergeResourceProfile(r.id, byId.get(r.id) || null)
    return {
      id: r.id, name: r.name, title: r.title, avatar_url: r.avatar_url,
      badges: prof.badges, session_modes: prof.session_modes, cards: prof.cards,
      payment_methods: effectivePaymentMethods(prof.payment_methods, plan), cancellation_policy: prof.cancellation_policy,
      pricing: prof.pricing, companion_label: prof.companion_label,
    }
  })
}

// وقتی tenant دقیقاً یک منبعِ فعال دارد (اکثریتِ الانِ tenantها)، تعیینِ resourceId
// برای رزروِ عمومی نیازی به انتخابِ کاربر ندارد — خودکار همان یکی است.
export async function getDefaultResourceId(tenantId: string): Promise<string | null> {
  const { data } = await sb().from('resources').select('id')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .order('sort_order').order('created_at').limit(1).maybeSingle()
  return data?.id || null
}

// کلیدهای ماژول‌هایی که مراجع در پنلِ خودش می‌بیند — پیش‌فرض همه روشن
export const PATIENT_FEATURE_KEYS = ['patient_buy_extra_session', 'patient_self_cancel'] as const

export const onlineAvailable = (m: SessionMode) => m === 'both' || m === 'online'
export const offlineAvailable = (m: SessionMode) => m === 'both' || m === 'offline'

// ── فرمِ رزرو — قابلِ‌تنظیم توسطِ هر دکتر (per-resource) ──────────────────────
// نام/شماره‌تماس بیرونِ این اسکیما و همیشه ثابت‌اند (برای OTP لازم‌اند).
// هرچه اینجاست کاملاً دیتایی و قابلِ‌ویرایش از پنل → تنظیمات → فرمِ رزرو است.
export type FormFieldType = 'text' | 'textarea' | 'select' | 'multiselect' | 'date' | 'phone'

export type FormField = {
  id: string
  label: string
  type: FormFieldType
  required: boolean
  options?: string[]   // برای select/multiselect
  placeholder?: string
  // منطقِ شرطی: این سوال فقط وقتی نشان داده می‌شود که پاسخِ سوالِ دیگری مقدارِ
  // مشخصی داشته باشد — مثلاً «سن و تحصیلاتِ خواهر/برادر» فقط اگر «آیا خواهر/برادر
  // دارید» = «بله» بود. برای select برابری چک می‌شود، برای multiselect وجودِ مقدار.
  showIf?: { fieldId: string; value: string }
  // مخفیِ موقت — بدونِ حذفِ کامل. اولویت دارد بر showIf (اگر مخفی است، اصلاً نشان داده نمی‌شود)
  hidden?: boolean
}

export type FormSection = {
  id: string
  title: string
  fields: FormField[]
}

export type IntakeForm = { sections: FormSection[] }

// این فیلدها روی ستونِ واقعیِ psy_cases می‌نشینند (نه details) — برای سازگاری با
// جست‌وجو/نمایشِ قدیمی. هرچیزِ دیگری که دکتر اضافه کند در details ذخیره می‌شود.
export const INTAKE_KNOWN_COLUMNS = ['birth_date', 'grade', 'reason', 'contact_name', 'contact2_name', 'contact2_phone'] as const

// فرمِ پیش‌فرضِ عمومی — کوتاه و مستقل از تخصص، تا برایِ هر روان‌شناس/روان‌پزشکی با
// هر گرایشی (فردیِ بزرگسال، کودک، زوج، خانواده...) نقطه‌ی شروعِ معقولی باشد. هر
// متخصص از همینجا با فرم‌بیلدرِ خودش (تنظیمات → فرمِ رزرو) کامل شخصی‌سازی‌اش می‌کند —
// مثلاً کسی که با کودک کار می‌کند می‌تواند بخش‌هایِ رشد/بارداری/مدرسه را دوباره اضافه کند.
export const DEFAULT_INTAKE_FORM: IntakeForm = {
  sections: [
    { id: 'basic', title: 'اطلاعاتِ اولیه', fields: [
      { id: 'reason', label: 'دلیلِ مراجعه', type: 'textarea', required: true, placeholder: 'به طور مختصر...' },
      { id: 'birth_date', label: 'تاریخ تولد', type: 'date', required: false },
      { id: 'prev_visit', label: 'سابقه‌ی مراجعه‌ی قبلی', type: 'select', required: true, options: ['خیر، اولین بار است', 'بله، قبلاً مراجعه داشتم'] },
    ]},
    { id: 'companion', title: 'همراه (اختیاری)', fields: [
      { id: 'contact2_name', label: 'نامِ همراه', type: 'text', required: false, placeholder: 'در صورتِ نیاز' },
      { id: 'contact2_phone', label: 'شماره‌تماسِ همراه', type: 'phone', required: false },
    ]},
    { id: 'history', title: 'سابقه', fields: [
      { id: 'medical_info', label: 'سابقه‌ی پزشکی/روان‌پزشکی', type: 'textarea', required: false, placeholder: 'بیماری‌ها، تشخیص‌ها یا درمان‌هایِ قبلی...' },
      { id: 'current_meds', label: 'داروهای در حالِ مصرف', type: 'text', required: false, placeholder: 'نامِ دارو و دوز...' },
    ]},
    { id: 'extra', title: 'موارد دیگر', fields: [
      { id: 'extra_notes', label: 'مواردی که می‌خواهید متخصص از قبل بداند', type: 'textarea', required: false, placeholder: 'هر نکته‌ای که فکر می‌کنید مهم است...' },
    ]},
  ],
}

function isValidFieldType(t: unknown): t is FormFieldType {
  return t === 'text' || t === 'textarea' || t === 'select' || t === 'multiselect' || t === 'date' || t === 'phone'
}

export function mergeIntakeForm(raw: unknown): IntakeForm {
  const r = raw as { sections?: unknown } | null
  if (!r || !Array.isArray(r.sections) || r.sections.length === 0) return DEFAULT_INTAKE_FORM
  const sections: FormSection[] = (r.sections as any[]).map((s, si) => ({
    id: String(s?.id || `section_${si}`),
    title: String(s?.title || ''),
    fields: Array.isArray(s?.fields) ? s.fields.map((f: any, fi: number) => ({
      id: String(f?.id || `field_${si}_${fi}`),
      label: String(f?.label || ''),
      type: isValidFieldType(f?.type) ? f.type : 'text',
      required: !!f?.required,
      options: Array.isArray(f?.options) ? f.options.map(String) : undefined,
      placeholder: f?.placeholder ? String(f.placeholder) : undefined,
      showIf: f?.showIf && f.showIf.fieldId ? { fieldId: String(f.showIf.fieldId), value: String(f.showIf.value ?? '') } : undefined,
      hidden: !!f?.hidden,
    })) : [],
  }))
  return { sections }
}

export async function getIntakeForm(resourceId: string): Promise<IntakeForm> {
  try {
    const { data } = await sb().from('psy_intake_forms').select('schema').eq('resource_id', resourceId).maybeSingle()
    return mergeIntakeForm(data?.schema)
  } catch {
    return DEFAULT_INTAKE_FORM
  }
}

// آیا این فیلد الان باید نشان داده شود؟ (مخفیِ دستی همیشه اولویت دارد؛ بعد از آن showIf)
export function fieldVisible(field: FormField, answers: Record<string, unknown>): boolean {
  if (field.hidden) return false
  if (!field.showIf) return true
  const target = answers[field.showIf.fieldId]
  if (Array.isArray(target)) return target.includes(field.showIf.value)
  return String(target ?? '') === field.showIf.value
}

// همه‌ی فیلدهای اجباریِ یک فرم مقدار دارند؟ برچسبِ فیلدهای ناقص را برمی‌گرداند
// (فیلدهایی که طبقِ showIf الان مخفی‌اند، اجباری حساب نمی‌شوند). فیلدهای نوعِ
// «phone» علاوه‌بر اجباری‌بودن، فرمتِ شماره‌ی موبایلِ ایرانی هم چک می‌شوند —
// حتی اگر اختیاری باشند، مقدارِ واردشده باید یا خالی یا یک شماره‌ی معتبر باشد.
function digitsToLatin(s: string): string {
  return s.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}
export function isValidIranPhone(v: string): boolean {
  return /^09\d{9}$/.test(digitsToLatin(String(v || '')).trim())
}

export function missingIntakeFields(form: IntakeForm, answers: Record<string, unknown>): string[] {
  const missing: string[] = []
  for (const section of form.sections) {
    for (const f of section.fields) {
      if (!fieldVisible(f, answers)) continue
      const v = answers[f.id]
      const empty = f.type === 'multiselect' ? !Array.isArray(v) || v.length === 0 : !String(v ?? '').trim()
      if (f.required && empty) { missing.push(f.label); continue }
      if (f.type === 'phone' && !empty && !isValidIranPhone(String(v))) missing.push(`${f.label} (فرمتِ شماره نامعتبر است)`)
    }
  }
  return missing
}

// برچسبِ فارسیِ کلیدهای details از پرونده‌های قدیمی (قبل از فرم‌بیلدر) — برای
// نمایشِ درستِ پرونده‌های ساخته‌شده پیش از این قابلیت
export const LEGACY_DETAIL_LABELS: Record<string, string> = {
  prev_visit: 'سابقه‌ی مراجعه‌ی قبلی',
  father_education: 'تحصیلاتِ پدر', father_job: 'شغلِ پدر',
  mother_education: 'تحصیلاتِ مادر', mother_job: 'شغلِ مادر',
  home_address: 'آدرسِ منزل', siblings_info: 'خواهر/برادر', family_members_info: 'سایرِ ساکنینِ منزل',
  family_status: 'وضعیتِ خانوادگی', child_conditions: 'ویژگی‌های کودک',
  pregnancy_info: 'شرایطِ بارداریِ مادر', birth_type: 'نوعِ زایمان', birth_weight: 'وزنِ هنگامِ تولد',
  growth_info: 'رشد و تکامل', medical_info: 'سابقه‌ی پزشکی', school_info: 'مدرسه',
  sports_info: 'فعالیتِ ورزشی', parent_behavior: 'رفتارِ والدین با فرزند', extra_notes: 'توضیحاتِ تکمیلی',
}
