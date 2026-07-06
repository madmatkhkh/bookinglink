// ─────────────────────────────────────────────────────────────────────────────
// لایه‌ی مشترکِ نیچِ روانشناسی — قیمت‌گذاری، قوانین، و تنظیماتِ per-tenant.
// معادلِ config.ts + settings.ts در psych-booking، ولی چندمستاجری.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'

// قیمت‌گذاریِ پیش‌فرضِ مرحله‌ها (تومان) — هر tenant می‌تواند در تنظیماتش عوض کند
export const PSY_PRICING = {
  interview: 800000,
  assessment: 1500000,
  sessionOnline: 850000,
  sessionOffline: 1200000,
}

// قیمتِ پیش‌فرضِ هر نوعِ مرحله‌ی پیش‌ازدرمان (وقتی دکتر خودش قیمتِ دیگری نداده)
export function stagePrice(stageType: string): number {
  return stageType === 'assessment' ? PSY_PRICING.assessment : PSY_PRICING.interview
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
}

export const DEFAULT_RESOURCE_PROFILE: Omit<ResourceProfile, 'resource_id'> = {
  badges: [],
  session_modes: 'both',
  cards: [],
  cancellation_policy: DEFAULT_CANCELLATION_POLICY,
  payment_methods: DEFAULT_PAYMENT_METHODS,
  quick_times: DEFAULT_QUICK_TIMES,
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
}

export async function listPublicDoctors(tenantId: string): Promise<PublicDoctor[]> {
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
      payment_methods: prof.payment_methods, cancellation_policy: prof.cancellation_policy,
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
export const INTAKE_KNOWN_COLUMNS = ['birth_date', 'grade', 'reason', 'father_name', 'mother_name', 'mother_phone'] as const

const CHILD_CONDITIONS_DEFAULT = [
  'لکنت', 'اختلال گویایی', 'اختلال شنوایی', 'اختلال بینایی',
  'زودرنجی', 'حسادت', 'لج‌بازی', 'نافرمانی',
  'ناخن جویدن', 'استرس و اضطراب', 'وسواس', 'شب‌ادراری',
  'وابستگی', 'ترس از پدر یا مادر', 'عدم اعتماد به نفس',
]

// دقیقاً همان فرمِ فعلی، به‌شکلِ دیتایی — تا تک‌دکترهای موجود هیچ تغییری نبینند
export const DEFAULT_INTAKE_FORM: IntakeForm = {
  sections: [
    { id: 'child', title: 'اطلاعاتِ کودک', fields: [
      { id: 'birth_date', label: 'تاریخ تولد', type: 'date', required: false },
      { id: 'grade', label: 'پایه‌ی تحصیلی', type: 'text', required: false, placeholder: 'پیش‌دبستانی' },
      { id: 'reason', label: 'دلیلِ مراجعه', type: 'textarea', required: true, placeholder: 'به طور مختصر...' },
      { id: 'prev_visit', label: 'سابقه‌ی مراجعه‌ی قبلی', type: 'select', required: true, options: ['خیر، اولین بار است', 'بله، قبلاً مراجعه داشتم'] },
    ]},
    { id: 'father', title: 'اطلاعاتِ پدر', fields: [
      { id: 'father_name', label: 'نام', type: 'text', required: true, placeholder: 'علی' },
      { id: 'father_education', label: 'تحصیلات', type: 'text', required: false, placeholder: 'لیسانس' },
      { id: 'father_job', label: 'شغل', type: 'text', required: false, placeholder: 'مهندس' },
    ]},
    { id: 'mother', title: 'اطلاعاتِ مادر', fields: [
      { id: 'mother_name', label: 'نام', type: 'text', required: true, placeholder: 'مریم' },
      { id: 'mother_phone', label: 'شماره تماس', type: 'phone', required: true },
      { id: 'mother_education', label: 'تحصیلات', type: 'text', required: false, placeholder: 'دیپلم' },
      { id: 'mother_job', label: 'شغل', type: 'text', required: false, placeholder: 'خانه‌دار' },
    ]},
    { id: 'family', title: 'خواهر/برادر و محلِ زندگی', fields: [
      { id: 'has_siblings', label: 'آیا خواهر یا برادر دارد؟', type: 'select', required: true, options: ['بله', 'خیر'] },
      { id: 'siblings_info', label: 'سن و تحصیلاتِ هر خواهر/برادر', type: 'textarea', required: true, placeholder: 'مثلاً: خواهر 10 ساله کلاس چهارم', showIf: { fieldId: 'has_siblings', value: 'بله' } },
      { id: 'other_residents', label: 'آیا عضوِ دیگری غیر از اعضای اصلیِ خانواده با شما زندگی می‌کند؟', type: 'select', required: true, options: ['بله', 'خیر'] },
      { id: 'other_residents_info', label: 'چه کسی؟', type: 'text', required: true, placeholder: 'مثلاً: پدربزرگ', showIf: { fieldId: 'other_residents', value: 'بله' } },
      { id: 'home_address', label: 'آدرسِ خانه', type: 'textarea', required: true, placeholder: 'آدرسِ کاملِ محلِ سکونت...' },
    ]},
    { id: 'family_status', title: 'وضعیتِ خانوادگی', fields: [
      { id: 'family_status', label: 'موارد را انتخاب کنید', type: 'multiselect', required: true,
        options: ['فوت پدر', 'فوت مادر', 'طلاق', 'ازدواج مجدد پدر', 'ازدواج مجدد مادر', 'بیماری جسمی در خانواده', 'هیچ‌کدام'] },
    ]},
    { id: 'child_status', title: 'وضعیتِ جسمی و روحیِ کودک', fields: [
      { id: 'child_conditions', label: 'موارد موجود را انتخاب کنید', type: 'multiselect', required: true,
        options: [...CHILD_CONDITIONS_DEFAULT, 'هیچ‌کدام'] },
    ]},
    { id: 'pregnancy', title: 'دورانِ بارداریِ مادر', fields: [
      { id: 'pregnancy_age', label: 'سنِ مادر هنگامِ بارداری', type: 'text', required: false, placeholder: '28' },
      { id: 'pregnancy_count', label: 'تعدادِ دفعاتِ بارداری', type: 'text', required: false, placeholder: '2' },
      { id: 'pregnancy_factors', label: 'موارد را انتخاب کنید', type: 'multiselect', required: false,
        options: ['استرس', 'افسردگی', 'مشکلاتِ خانوادگی', 'سابقه‌ی سقط', 'هیچ‌کدام'] },
    ]},
    { id: 'birth', title: 'زایمان و تولد', fields: [
      { id: 'birth_type', label: 'نوعِ زایمان', type: 'select', required: true, options: ['طبیعی', 'سزارین'] },
      { id: 'birth_weight', label: 'وزنِ هنگامِ تولد', type: 'text', required: true, placeholder: '3.2 کیلوگرم' },
    ]},
    { id: 'growth', title: 'رشد و تکامل', fields: [
      { id: 'growth_crawl', label: 'سینه‌خیز رفته؟', type: 'select', required: true, options: ['بله', 'خیر'] },
      { id: 'growth_crawl_duration', label: 'چه مدت؟', type: 'text', required: false, showIf: { fieldId: 'growth_crawl', value: 'بله' } },
      { id: 'growth_walk4', label: 'چهار دست و پا رفته؟', type: 'select', required: true, options: ['بله', 'خیر'] },
      { id: 'growth_walk4_duration', label: 'چه مدت؟', type: 'text', required: false, showIf: { fieldId: 'growth_walk4', value: 'بله' } },
      { id: 'growth_walk_age', label: 'سنِ راه رفتن', type: 'text', required: true, placeholder: '12 ماه' },
      { id: 'growth_talk_age', label: 'سنِ اولین کلمه', type: 'text', required: true, placeholder: '18 ماه' },
      { id: 'growth_issues', label: 'مشکلِ خاص در مراحلِ رشد', type: 'textarea', required: false, placeholder: 'در صورتِ وجود توضیح دهید...' },
    ]},
    { id: 'medical', title: 'اطلاعاتِ پزشکی', fields: [
      { id: 'seizure_history', label: 'سابقه‌ی غش‌وتشنج؟', type: 'select', required: true, options: ['بله', 'خیر'] },
      { id: 'current_meds', label: 'داروهای در حالِ مصرف', type: 'text', required: true, placeholder: 'نام دارو و دوز...' },
    ]},
    { id: 'sports', title: 'فعالیتِ ورزشی', fields: [
      { id: 'sports_activity', label: 'نوع و زمانِ فعالیت', type: 'text', required: true, placeholder: 'فوتبال، 2 روز در هفته' },
      { id: 'sports_limit', label: 'محدودیتِ ورزشی', type: 'text', required: false, placeholder: 'در صورتِ وجود...' },
    ]},
    { id: 'parenting', title: 'رفتارِ والدین با فرزند', fields: [
      { id: 'father_behavior', label: 'رفتارِ پدر با فرزند', type: 'text', required: true, placeholder: 'توضیح دهید...' },
      { id: 'mother_behavior', label: 'رفتارِ مادر با فرزند', type: 'text', required: true, placeholder: 'توضیح دهید...' },
      { id: 'main_supervisor', label: 'چه کسی بیشتر نظارت دارد؟', type: 'text', required: true, placeholder: 'پدر / مادر / پدربزرگ...' },
    ]},
    { id: 'extra', title: 'موارد دیگر', fields: [
      { id: 'extra_notes', label: 'مواردی که می‌خواهید دکتر بداند', type: 'textarea', required: false, placeholder: 'هر نکته‌ای که فکر می‌کنید مهم است...' },
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
