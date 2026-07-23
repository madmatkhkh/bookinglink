'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { PERSIAN_MONTHS, toLatinNum, getCurrentJalali, getDaysInJalaliMonth, jalaliDateTimeToTimestamp } from '@/lib/calendar'
import { STAGE_TYPE_LABEL, STAGE_STATUS_LABEL, stageTitle } from '@/lib/flow'
import { PLAN_LABELS } from '@/lib/plans'
import { PRICING, PLATFORM_NAME, RESERVED_SLUGS, SLUG_PATTERN, SLUG_RULE_TEXT } from '@/lib/config'
import { ClinicSettings, DEFAULT_SETTINGS, SessionMode, OfficeLocation, PaymentCardInfo } from '@/lib/settings'
import { IntakeForm, FormField, FormFieldType, DEFAULT_INTAKE_FORM, LEGACY_DETAIL_LABELS, CancellationPolicy, PaymentMethods, DEFAULT_PAYMENT_METHODS, DEFAULT_CANCELLATION_POLICY, Pricing, DEFAULT_PRICING, TermsSettings, DEFAULT_TERMS, INTAKE_KNOWN_COLUMNS, fieldVisible } from '@/lib/psy'
import { DialogHost, uiAlert, uiConfirm, uiPrompt } from '@/components/ui/Dialog'
import { useResendCooldown } from '@/lib/useResendCooldown'
import { Glyph } from '@/components/Glyph'
import { MonthYearWheel, JalaliDateWheel } from '@/components/WheelPicker'
import { useModalBackClose } from '@/lib/useModalBackClose'
import useSWR, { mutate as globalMutate } from 'swr'
import { LIVE_SWR_OPTIONS, FetchError } from '@/lib/swr'
import { moduleOn, GROWTH_SUBTABS, type ModuleFlags } from '@/lib/moduleManifest'
import { PageHeader, EmptyState, SkeletonRows, timeKey, enTime } from './modules/shared'
import ScheduleTab, { type SchedJump } from './modules/schedule/ScheduleTab'
import FinanceTab, { type FinanceData } from './modules/finance/FinanceTab'
import StaffTab, { type ResourceRow } from './modules/staff/StaffTab'
import BookingsTab from './modules/bookings/BookingsTab'
import PatientsTab from './modules/patients/PatientsTab'
import GrowthTab, { type WaitlistEntry } from './modules/growth/GrowthTab'
import CapabilitiesTab from './modules/capabilities/CapabilitiesTab'
import { MEET_METHODS, MEET_META, MeetChannel, isMeetMethod, meetHref, usableMeetChannels } from '@/lib/meet'
import ThemeModePicker from '@/components/ThemeModePicker'
import { DEFAULT_SAFE_THEME } from '@/lib/theme'

// در پنل ادمین همه‌ی ارقام لاتین نمایش داده می‌شوند (فقط نمایش؛ فرمت ذخیره دست‌نخورده)
const toFarsiNum = (n: number | string) => toLatinNum(String(n))
// enTime به panel/modules/shared.tsx منتقل شد (فاز 4).

// ─── Types ───────────────────────────────────────────────────────────────────

export type Patient = {
 id: string
 case_number: string
 // هویت مراجع
 client_name: string
 client_name_en?: string
 birth_date: string
 birth_place?: string
 nationality?: string
 religion?: string
 grade?: string
 school_name?: string
 school_type?: string    // دولتی / خصوصی / غیرانتفاعی
 // شکایت اصلی
 reason: string
 complaint_duration?: string // مدت شکایت
 referred_by?: string     // معرف
 prev_visit?: string     // مراجعه قبلی
 prev_diagnosis?: string   // تشخیص قبلی
 prev_treatment?: string   // درمان قبلی
 // اطلاعات خانواده
 contact_name: string
 father_birth_year?: string
 father_education?: string
 father_job?: string
 contact_phone: string
 father_health?: string    // وضعیت سلامت پدر
 contact2_name: string
 mother_birth_year?: string
 mother_education?: string
 mother_job?: string
 contact2_phone: string
 mother_health?: string    // وضعیت سلامت مادر
 family_status?: string    // وضعیت زندگی والدین
 siblings_count?: string   // تعداد خواهر و برادر
 child_order?: string     // ترتیب تولد
 family_income?: string    // وضعیت اقتصادی
 home_address?: string
 siblings_info?: string    // سن و تحصیلات خواهر/برادر
 family_members_info?: string // اعضای دیگر ساکن
 // سابقه بارداری و تولد
 pregnancy_info?: string   // شرایط بارداری
 birth_type?: string     // نوع زایمان
 birth_weight?: string    // وزن هنگام تولد
 birth_complications?: string // عوارض هنگام تولد
 // رشد و تکامل
 walking_age?: string     // سن راه رفتن
 talking_age?: string     // سن صحبت کردن
 toilet_training?: string   // سن کنترل ادرار
 growth_info?: string     // مشکلات رشدی
 // سابقه پزشکی
 medical_info?: string    // بیماری‌های خاص
 medications?: string     // داروهای مصرفی
 allergies?: string      // آلرژی‌ها
 surgery_history?: string   // سابقه جراحی
 head_trauma?: string     // ضربه به سر
 // اطلاعات تکمیلی
 sleep_info?: string     // مشکلات خواب
 appetite_info?: string    // مشکلات اشتها
 sports_info?: string     // فعالیت ورزشی
 social_info?: string     // روابط اجتماعی
 academic_info?: string    // وضعیت تحصیلی
 parent_behavior?: string   // نحوه برخورد والدین
 family_stress?: string    // استرس‌های خانوادگی
 extra_notes?: string     // توضیحات اضافی
 // ستون‌هایی که فرم مصاحبه ذخیره می‌کند (رشته‌ای/ترکیبی)
 school_info?: string     // نام مدرسه | مؤسسه | پایه | تلفن
 child_conditions?: string  // ویژگی‌های مراجع (فقط اگر متخصص از فرم تفصیلی استفاده کند)
 session_type?: string    // online | offline
 // پاسخ‌های فرم رزرو که ستون اختصاصی ندارند (کاملا دیتایی، از فرم‌بیلدر)
 details?: Record<string, any>
 // وضعیت
 status: string
 created_at: string
 // مرحله‌ی جاری پیش‌ازدرمان (join از GET /cases) — قبلا در تایپ نبود ولی
 // در دیتای واقعی همیشه بود؛ برای چک «آیا الان مرحله‌ی باز دارد» لازم است.
 current_stage_id?: string | null
 current_stage?: CaseStage | null
}

// یک مرحله‌ی پیش‌ازدرمان (مصاحبه/ارزیابی) — هر پرونده هر تعداد از این‌ها می‌تواند داشته باشد
export type CaseStage = {
 id: string
 case_number: string
 stage_type: string
 title?: string | null
 is_first?: boolean
 status: 'awaiting_payment' | 'payment_submitted' | 'awaiting_booking' | 'booked' | 'cancelled'
 price: number
 paid: boolean
 payment_submitted?: boolean
 payment_ref?: string
 session_date?: string
 session_time?: string
 held?: boolean
 // «حاضر نشد» (migration 0054): کنار held می‌نشیند، جایگزینش نیست — جلسه‌ی
 // حضورنیافته هم مصرف‌شده حساب می‌شود و پرونده را آزاد می‌کند.
 no_show?: boolean
 notes?: string
 cancel_notice?: string
 payment_reject_reason?: string
 delay_minutes?: number | null
 resource_id?: string | null
 session_type?: 'online' | 'offline' | null
 meet_channel?: string | null
 cancelled_by?: string | null
 created_at: string
}

export type Booking = {
 id: string
 case_number: string
 client_name: string
 contact_name?: string
 contact2_name?: string
 contact_phone?: string
 contact2_phone?: string
 session_type: 'online' | 'offline'
 office_location?: string
 status: 'pending' | 'confirmed' | 'cancelled'
 doctor_notes?: string
 reject_reason?: string
 current_stage_id?: string | null
 current_stage?: CaseStage | null
 created_at: string
}

export type Package = {
 id: string
 case_number: string
 month: string
 year: string
 primary_sessions: number
 secondary_sessions: number
 primary_session_type: string
 secondary_session_type: string
 primary_office_location?: string | null
 primary_meet_channel?: string | null
 secondary_office_location?: string | null
 secondary_meet_channel?: string | null
 notes: string
 status: string
 price?: number
 paid: boolean
 payment_submitted?: boolean
 payment_ref?: string
 payment_reject_reason?: string
}

export type Session = {
 id: string
 package_id: string
 case_number: string
 title?: string
 session_number: number
 session_date: string
 session_time: string
 session_type: string
 attendee: string
 status: string
 session_goals: string
 session_summary: string
 doctor_notes_private: string
 doctor_note_for_patient: string
 price?: number
 paid: boolean
 payment_submitted?: boolean
 payment_ref?: string
 refund_percent?: number
 refund_card?: string
 payment_reject_reason?: string
 refund_status?: string
 refund_ref?: string
 cancelled_by?: string | null
}

// FinanceCats/FinanceData به panel/modules/finance/FinanceTab.tsx منتقل شدند (فاز 4).

// یک «منبع» = یک کارمند/دکتر. name/title/avatar_url هویت نمایشی؛ phone برای
// ورود مستقل کارمند به پنل است (اختیاری — خالی یعنی فقط owner برایش کار می‌کند).
// ResourceRow به panel/modules/staff/StaffTab.tsx منتقل شد (فاز 4).

// پروفایل per-resource که در تب تنظیمات ویرایش می‌شود
type ResourceProfileView = {
 resource_id: string
 name: string
 title: string
 avatar_url: string
 phone?: string | null
 badges: string[]
 session_modes: SessionMode
 cards: PaymentCardInfo[]
 cancellation_policy: CancellationPolicy
 payment_methods: PaymentMethods
 quick_times: string[]
 settlement_sheba: string
 settlement_sheba_holder_name: string
 pricing: Pricing
 companion_label: string
 meet_channels: MeetChannel[]
 terms: TermsSettings
 first_stage_label: string
 stage_presets: string[]
}

const ALL_TIMES = ['8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00']

const DEFAULT_PROFILE: ResourceProfileView = {
 resource_id: '', name: '', title: '', avatar_url: '', badges: [], session_modes: 'both', cards: [],
 cancellation_policy: DEFAULT_CANCELLATION_POLICY,
 payment_methods: DEFAULT_PAYMENT_METHODS,
 quick_times: ALL_TIMES,
 settlement_sheba: '', settlement_sheba_holder_name: '',
 pricing: DEFAULT_PRICING,
 companion_label: '',
 meet_channels: [],
 terms: DEFAULT_TERMS,
 first_stage_label: 'مصاحبه',
 stage_presets: [],
}

// ─── Constants ────────────────────────────────────────────────────────────────


// timeKey به panel/modules/shared.tsx منتقل شد (فاز 4).

// اعتبارسنجی و نرمال‌سازی ساعت دلخواه واردشده‌ی دکتر (مثلا «9», «9:30», «14:05»، همه با
// رقم فارسی یا لاتین) به همان قالب لاتین استفاده‌شده در ALL_TIMES («9:00»)؛ اگر نامعتبر
// بود null برمی‌گرداند. هیچ‌جا خروجی به رقم فارسی تبدیل نمی‌شود.
// parseCustomTime همراه تب «روزهای کاری» به ScheduleTab.tsx رفت (فاز 4).

// stageLabel و STATUS_LABEL/STATUS_COLOR به panel/modules/patients/PatientsTab.tsx منتقل شدند (فاز 4).

// ─── Sub-components ───────────────────────────────────────────────────────────

// ── سربرگ یکدست هر تب — عنوان + یک خط توضیح؛ قبلا فقط داشبورد سربرگ داشت و
// بقیه‌ی تب‌ها مستقیم با محتوا شروع می‌شدند (بی‌جهت‌نما و ناتمام به‌نظر می‌رسید) ──
// سرصفحه‌ی هر تب — فقط توضیح و دکمه‌ی کنش.
//
// عنوان عمدا sr-only است: نوار ثابت بالا (TopBar) از قبل عنوان تب جاری را نشان
// می‌دهد، و نوشتن دوباره‌اش این‌جا یعنی همان کلمه دو بار پشت‌سرهم روی صفحه
// (سایدبار، نوار بالا، سرصفحه). عنوان در DOM می‌ماند تا ساختار heading برای
// screen readerها نشکند، ولی دیده نمی‌شود.
// PageHeader و EmptyState به panel/modules/shared.tsx منتقل شدند (فاز 4).

// SkeletonRows به panel/modules/shared.tsx منتقل شد (فاز 4).

// StageSessionCard به PatientsTab.tsx منتقل شد (فاز 4).
// PendingSection به panel/modules/bookings/BookingsTab.tsx منتقل شد (فاز 4).

// PendingPayCard به BookingsTab.tsx منتقل شد (فاز 4).

// انتخابگر تاریخ جلالی (سال/ماه/روز) برای بازه‌ی گزارش
// JalaliDateSelect همراه تب مالی به FinanceTab.tsx رفت (فقط همان مصرفش می‌کرد).

// InfoRow به PatientsTab.tsx منتقل شد (فاز 4).
// RefundPendingCard به BookingsTab.tsx منتقل شد (فاز 4).

// Section به PatientsTab.tsx منتقل شد (فاز 4).

// ─── Main Component ───────────────────────────────────────────────────────────

// همه‌ی «پرداخت‌های منتظر» را یک‌جا می‌گیرد — fetcher مشترک SWR (بج «تأیید
// پرداخت‌ها») و همچنین تازه‌سازی دستی بعد از تأیید/رد. خروجی همان پنج فهرستی است
// که کامپوننت مصرف می‌کند.
async function loadPendingBundle(api: (path: string) => string) {
 const [pkgRes, sessRes, refundRes, stageRes, stageRefundRes, apptRes] = await Promise.all([
  fetch(api('/packages?pending=1'), { cache: 'no-store' }),
  fetch(api('/sessions?pending=1'), { cache: 'no-store' }),
  fetch(api('/sessions?refunds=1'), { cache: 'no-store' }),
  fetch(api('/stages?pending=1'), { cache: 'no-store' }),
  fetch(api('/stages?refunds=1'), { cache: 'no-store' }),
  fetch(api('/appointment-requests?pending=true'), { cache: 'no-store' }),
 ])
 const [pkg, sess, refunds, stg, stgRefunds, appt] = await Promise.all([
  pkgRes.json().catch(() => ({})), sessRes.json().catch(() => ({})), refundRes.json().catch(() => ({})),
  stageRes.json().catch(() => ({})), stageRefundRes.json().catch(() => ({})), apptRes.json().catch(() => ({})),
 ])
 return {
  pkgs: pkg.packages || [],
  sess: sess.sessions || [],
  // بازپرداخت‌های جلسه و مرحله در یک فهرست؛ مرحله‌ها با _kind مشخص‌اند
  refunds: [...(refunds.sessions || []), ...(stgRefunds.stages || [])],
  stages: stg.stages || [],
  apptRequests: appt.requests || [],
 }
}

// لیست پرونده‌ها را می‌گیرد — fetcher مشترک SWR و همچنین تازه‌سازی دستی. روی
// وضعیت غیر-OK (از جمله 401) خطای دارای status می‌اندازد تا مصرف‌کننده needsLogin
// را تشخیص دهد.
async function fetchCases(api: (path: string) => string, viewingResourceId: string) {
 const url = viewingResourceId ? api(`/cases?resource_id=${viewingResourceId}`) : api('/cases')
 const res = await fetch(url, { cache: 'no-store' })
 if (!res.ok) throw new FetchError(res.status)
 return res.json()
}

export function PsychologyAdmin() {
 const { slug } = useParams<{ slug: string }>()
 const api = (path: string) => `/api/t/${slug}/panel/psy${path}`
 const panelApi = (path: string) => `/api/t/${slug}/panel${path}`

 // ── ناوبری واقعی با تاریخچه‌ی مرورگر ──────────────────────────────────────
 // قبلا تعویض تب/تب‌فرعی/پرونده فقط state بود، هیچ آدرسی عوض نمی‌شد — یعنی
 // مرورگر هیچ تاریخچه‌ای برای این ناوبری نداشت. نتیجه: دکمه‌ی برگشت گوشی یا
 // مرورگر بلافاصله از کل برنامه بیرون می‌رفت، و در دسکتاپ اصلا گزینه‌ی برگشتی
 // برای داخل پنل وجود نداشت. الان هر ناوبری مهم یک ورودی در تاریخچه push
 // ناوبری تب‌ها — قبلا اینجا با router.push/searchParams هماهنگ میشد تا دکمه‌ی
 // برگشت مرورگر کار کنه، ولی همین باعث یک باگ جدی شد: چون router.push
 // ناهمزمانه و state مستقیم (setMainTab) همزمان تغییر میکرد، یک effect که
 // searchParams رو میخوند گاهی مقدار قدیمی/جا‌مانده رو میدید و mainTab رو
 // خودکار برمیگردوند - یعنی کلیک روی تب دیگه گاهی اصلا اثر نمیکرد. کامل به
 // state ساده برگشت داده شد تا ناوبری صددرصد قابل‌اعتماد بمونه.
 // «تنظیمات» دیگر صفحه‌ی دوم سایدبار نیست — یک تب معمولی مثل بقیه است که
 // زیرمجموعه‌هایش (صفحه‌ی عمومی + پنل مراجع) همین‌جا زیرش باز می‌شوند.
 // تیم/حساب/پشتیبانی هم از تنظیمات جدا شدند و تب مستقل خودشان را دارند.
 type MainTab = 'dashboard' | 'patients' | 'bookings' | 'schedule' | 'settings' | 'finance' | 'growth' | 'staff' | 'account' | 'capabilities' | 'tickets'
 type SettingsSub = 'profile' | 'payments' | 'pricing' | 'terms' | 'appearance' | 'form' | 'patient_panel'

 const [mainTab, setMainTab] = useState<MainTab>('dashboard')
 // null = هیچ زیرتبی باز نیست → «نمای کلی تنظیمات» نشان داده می‌شود. کلیک روی
 // خود تب «تنظیمات» فقط منو را باز می‌کند و دیگر خودکار وارد پروفایل نمی‌شود.
 const [settingsSubTab, setSettingsSubTab] = useState<SettingsSub | null>(null)
 const [sidebarOpen, setSidebarOpen] = useState(false)
 // باز/بسته‌بودن زیرمنوی «تنظیمات» در سایدبار — عمدا جدا از mainTab نگه داشته
 // شده: قبلا کلیک روی «تنظیمات» وقتی از قبل باز بود هیچ اثری نداشت (چون فقط
 // navigateTab('settings') صدا زده می‌شد که با مقدار فعلی mainTab فرقی نمی‌کرد)
 // — یعنی کاربر هیچ راهی برای بستنش نداشت. الان کلیک وقتی از قبل روی خود تب
 // تنظیمات هستی فقط این state را toggle می‌کند (باز/بسته)، و وقتی از تب دیگری
 // می‌آیی هم ناوبری می‌کند هم باز می‌کند.
 const [settingsOpen, setSettingsOpen] = useState(false)
 // اگر از جای دیگری (چک‌لیست، هشدارها، ...) مستقیم وارد یک زیرتب تنظیمات شدیم،
 // کرکره باید باز باشد تا کاربر ببیند کجاست.
 useEffect(() => { if (mainTab === 'settings') setSettingsOpen(true) }, [mainTab])
 const [togglingClinicMode, setTogglingClinicMode] = useState(false)
 const [clinicRequestNote, setClinicRequestNote] = useState('')

 // رفتن به یک تب اصلی — وقتی مقصد خود تنظیمات است (از نویگیشن اصلی، نه از
 // داخل زیرتب‌ها)، همیشه به زیرتب پیش‌فرض («پروفایل») برمی‌گردد، نه آخرین
 // زیرتبی که قبلا باز بود.
 function navigateTab(tab: MainTab) {
  setMainTab(tab)
 }

 function navigateSettingsSub(sub: SettingsSub) {
  setMainTab('settings')
  setSettingsSubTab(sub)
 }

 // patients/bookings/loading از SWR لیست پرونده‌ها مشتق می‌شوند — پایین‌تر بعد از
 // viewingResourceId تعریف شده‌اند (چون کلید SWR به آن وابسته است).
 // ── تغییر نشانی اختصاصی (فقط owner) ──────────────────────────────────────
 const [slugEditOpen, setSlugEditOpen] = useState(false)
 const [slugInput, setSlugInput] = useState('')
 const [slugSaving, setSlugSaving] = useState(false)
 const slugInputOk = SLUG_PATTERN.test(slugInput) && !RESERVED_SLUGS.includes(slugInput)

 async function saveSlug() {
  if (!slugInputOk) return
  if (!await uiConfirm(`نشانی به nobatlink.com/${slugInput} تغییر کند؟\n\nهمه‌ی لینک‌های قبلی از کار می‌افتند و نشانی فعلی آزاد می‌شود.`)) return
  setSlugSaving(true)
  const res = await fetch(`/api/t/${slug}/panel/slug`, {
   method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: slugInput }),
  })
  const data = await res.json().catch(() => ({}))
  setSlugSaving(false)
  if (!res.ok) { uiAlert(data.error || 'تغییر نشانی ناموفق بود'); return }
  // آدرس همین صفحه هم عوض شده — کوکی سشن به tenant.id گره خورده (نه slug)، پس
  // با یک ناوبری کامل به نشانی تازه، پنل بدون نیاز به ورود دوباره بالا می‌آید.
  window.location.href = `/${slugInput}/panel`
 }
 // (بقیه‌ی stateهای پرونده هم به PatientsTab رفتند)
 // ── Bookings state ─────────────────────────────────────────────
 // bookings از همان SWR پرونده‌ها مشتق می‌شود (پایین).

 // ── Pending payments (تب تأیید پرداخت‌ها) ─────────────────────────
 // pendingPkgs/Sess/Refunds/Stages/ApptRequests از SWR می‌آیند — پایین‌تر بعد از
 // needsLogin تعریف شده‌اند (چون کلید SWR روی !needsLogin گیت می‌شود).
 // چک‌لیست راه‌اندازی: آیا حداقل یک روز کاری با ساعت باز تعریف شده؟ null یعنی
 // هنوز چک نشده (برای جلوگیری از فلاش «ناقص» قبل از رسیدن جواب).
 const [hasWorkingDays, setHasWorkingDays] = useState<boolean | null>(null)
 // state تب «رشد و مراجعان» به panel/modules/growth/GrowthTab.tsx منتقل شد
 // (فاز 4). لیست انتظار این‌جا مانده چون بج سایدبار بیرون آن تب هم لازمش دارد.
 const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
 const waitlistCount = waitlist.length
 // pendingStages/pendingApptRequests هم از همان SWR پایین مشتق می‌شوند.

 // ── Schedule state ─────────────────────────────────────────────
 // state تب «روزهای کاری» به ScheduleTab.tsx منتقل شد (فاز 4). این‌جا فقط
 // درخواست پرش از داشبورد (schedJump) و quickTimesSaving (که persistQuickTimes
 // والد تنظیمش می‌کند) ماند.
 const today = getCurrentJalali()
 const [schedJump, setSchedJump] = useState<SchedJump | null>(null)
 const [quickTimesSaving, setQuickTimesSaving] = useState(false)
 const [allSessions, setAllSessions] = useState<{ id: string; case_number: string; session_date: string; session_time: string; session_type: string; attendee: string; status: string; delay_minutes?: number | null }[]>([])
 const [allStages, setAllStages] = useState<CaseStage[]>([])
 const [cancelledSlots, setCancelledSlots] = useState<{ id: string; case_number: string; session_date: string; session_time: string; cancelled_by: string }[]>([])

 // ── Loading ────────────────────────────────────────────────────
 // loading از SWR پرونده‌ها مشتق می‌شود (isLoading — فقط لود اول)، پایین.
 // جدا از loading (که هر بار سوییچ منبع/رفرش دوباره true می‌شود): این فقط یک‌بار
 // بعد اولین لود موفق true می‌شود و دیگر false نمی‌شود — برای گیت صفحه‌ی
 // اولیه، تا پنل با دیتای خالی/پیش‌فرض (0 تومان، پرونده‌ی صفر) یک لحظه رندر
 // نشود و بعد یهو با دیتای واقعی جایگزین شود («صفحه‌ی قدیمی/خالی، بعد یهو
 // صفحه‌ی جدید» که گزارش شد).
 const [initialLoadDone, setInitialLoadDone] = useState(false)
 const [needsLogin, setNeedsLogin] = useState(false)

 // پرداخت‌های منتظر (بج «تأیید پرداخت‌ها») از SWR — خودش روی focus و هر 30 ثانیه
 // (فقط وقتی تب دیده می‌شود) بی‌اسپینر تازه می‌کند و درخواست‌های هم‌کلید را یکی
 // می‌کند. وقتی needsLogin است کلید null می‌شود و اصلا fetch/poll نمی‌کند.
 const { data: pendingData } = useSWR(needsLogin ? null : 'pending', () => loadPendingBundle(api), LIVE_SWR_OPTIONS)
 const pendingPkgs: Package[] = pendingData?.pkgs ?? []
 const pendingSess: Session[] = pendingData?.sess ?? []
 const pendingRefunds: Session[] = pendingData?.refunds ?? []
 const pendingStages: CaseStage[] = pendingData?.stages ?? []
 const pendingApptRequests: { id: string; case_number: string; note?: string | null; client_name?: string; created_at: string }[] = pendingData?.apptRequests ?? []
 // ── تیکت پشتیبانی ────────────────────────────────────────────────────────────
 type Ticket = { id: string; category: string; subject: string; message: string; status: string; admin_reply?: string | null; created_at: string }
 const [tickets, setTickets] = useState<Ticket[]>([])
 const [ticketsLoaded, setTicketsLoaded] = useState(false)
 const [ticketForm, setTicketForm] = useState({ category: 'bug', subject: '', message: '' })
 const [ticketSubmitting, setTicketSubmitting] = useState(false)

 async function loadTickets() {
  try {
   const res = await fetch(panelApi('/tickets'), { cache: 'no-store' })
   const d = await res.json().catch(() => ({}))
   setTickets(d.tickets || [])
  } catch {}
  setTicketsLoaded(true)
 }

 async function submitTicket() {
  if (!ticketForm.subject.trim() || !ticketForm.message.trim()) { uiAlert('موضوع و متن پیام را بنویسید'); return }
  setTicketSubmitting(true)
  try {
   const res = await fetch(panelApi('/tickets'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ticketForm),
   })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { uiAlert(d.error || 'ثبت تیکت ناموفق بود'); setTicketSubmitting(false); return }
   setTicketForm({ category: 'bug', subject: '', message: '' })
   await loadTickets()
  } catch { uiAlert('خطا در ارتباط با سرور') }
  setTicketSubmitting(false)
 }

 async function doLogout() {
  const ok = await uiConfirm('از پنل خارج شوید؟')
  if (!ok) return
  await fetch(panelApi('/logout'), { method: 'POST' })
  setMe(null)
  setNeedsLogin(true)
 }

 // ── تغییر خودسرویس شماره‌ی ورود (owner یا خود درمانگر) با تایید OTP ──────────
 async function sendChangePhoneCode() {
  if (!/^09\d{9}$/.test(newPhoneInput.trim())) { uiAlert('شماره‌ی موبایل معتبر نیست'); return }
  setChangePhoneBusy(true)
  try {
   const res = await fetch(panelApi('/change-phone'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_phone: newPhoneInput.trim() }),
   })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { uiAlert(d.error || 'ارسال کد ناموفق بود'); setChangePhoneBusy(false); return }
   setChangePhoneDevCode(d.devCode || '')
   setChangePhoneStep('code')
  } catch { uiAlert('خطا در ارتباط با سرور') }
  setChangePhoneBusy(false)
 }

 async function verifyChangePhoneCode() {
  if (changePhoneCode.trim().length < 5) { uiAlert('کد را کامل وارد کنید'); return }
  setChangePhoneBusy(true)
  try {
   const res = await fetch(panelApi('/change-phone'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_phone: newPhoneInput.trim(), code: changePhoneCode.trim() }),
   })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { uiAlert(d.error || 'تایید کد ناموفق بود'); setChangePhoneBusy(false); return }
   setChangePhoneOpen(false); setChangePhoneStep('phone'); setNewPhoneInput(''); setChangePhoneCode(''); setChangePhoneDevCode('')
   await loadMe()
   uiAlert('شماره‌ی ورود با موفقیت تغییر کرد.')
  } catch { uiAlert('خطا در ارتباط با سرور') }
  setChangePhoneBusy(false)
 }

 // ── Settings (تنظیمات کلینیک + ظاهر) ──────────────────────────
 const [settings, setSettings] = useState<ClinicSettings>(DEFAULT_SETTINGS)
 const [settingsLoaded, setSettingsLoaded] = useState(false)
 const [settingsSaving, setSettingsSaving] = useState(false)
 const [settingsSaved, setSettingsSaved] = useState(false)
 const [darkMode, setDarkMode] = useState(false)
 // state تب مالی به FinanceTab منتقل شد؛ گزارش داشبورد جداست و همین‌جا می‌ماند.
 const [dashboardFinance, setDashboardFinance] = useState<FinanceData | null>(null)
 const [dashboardLoaded, setDashboardLoaded] = useState(false)

 // ── چندکارمندی: کی وارد شده (صاحب مجموعه یا یک کارمند مشخص)؟ ──
 const [me, setMe] = useState<{ isOwner: boolean; resourceId: string | null; resourceName: string | null; phone: string | null; slug: string | null; multiTherapist: boolean; multiTherapistRequested: boolean; modules: ModuleFlags } | null>(null)
 // پنل‌های دیگر همین صاحب (tenantهای هم‌شماره) — برای سوییچ بدون OTP دوباره
 const [myPanels, setMyPanels] = useState<{ slug: string; display_name: string; current: boolean }[]>([])
 const [changePhoneOpen, setChangePhoneOpen] = useState(false)
 const [newPhoneInput, setNewPhoneInput] = useState('')
 const [changePhoneCode, setChangePhoneCode] = useState('')
 const [changePhoneStep, setChangePhoneStep] = useState<'phone' | 'code'>('phone')
 const [changePhoneBusy, setChangePhoneBusy] = useState(false)
 const [changePhoneDevCode, setChangePhoneDevCode] = useState('')
 const [staffList, setStaffList] = useState<ResourceRow[]>([])
 const [staffLoaded, setStaffLoaded] = useState(false)
 // owner: کدام کارمند را می‌بینیم؟ '' = همه (پرونده‌ها) — برنامه/پروفایل همیشه یک نفر مشخص لازم دارد
 const [viewingResourceId, setViewingResourceId] = useState<string>('')

 // لیست پرونده‌ها از SWR — کلید با viewingResourceId عوض می‌شود (سوییچ منبع
 // owner) و روی !needsLogin گیت است؛ focus+polling و dedup را خود SWR می‌دهد.
 // گیت‌های اسپلش/لاگین (initialLoadDone/needsLogin) در onSuccess/onError ست
 // می‌شوند تا رفتار قبلی دقیقا حفظ شود (اسپلش اولیه، صفحه‌ی لاگین روی 401).
 const casesKey = needsLogin ? null : (viewingResourceId ? `cases:${viewingResourceId}` : 'cases')
 const { data: casesData, mutate: casesMutate, isLoading: loading } = useSWR(
  casesKey,
  () => fetchCases(api, viewingResourceId),
  {
   ...LIVE_SWR_OPTIONS,
   onSuccess: () => setInitialLoadDone(true),
   onError: (err) => { if ((err as FetchError)?.status === 401) setNeedsLogin(true); setInitialLoadDone(true) },
  },
 )
 // patients و bookings هر دو همان bookings پرونده‌ها هستند (یک منبع)
 const patients: Patient[] = casesData?.bookings ?? []
 const bookings: Booking[] = casesData?.bookings ?? []
 // پروفایل per-resource (نام/عنوان/آواتار/بج/نوع جلسه/کارت) — جایگزین فیلدهای قدیمی settings
 const [profile, setProfile] = useState<ResourceProfileView>(DEFAULT_PROFILE)
 const [profileLoaded, setProfileLoaded] = useState(false)
 const [profileSaving, setProfileSaving] = useState(false)
 const [profileSaved, setProfileSaved] = useState(false)
 const [tenantPlan, setTenantPlan] = useState<string>('free')
 const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null)
 // چک‌لیست راه‌اندازی داشبورد — پیش‌فرض جمع (فقط سربرگ فشرده)، و انتخاب کاربر
 // بین سشن‌ها حفظ می‌شود تا هر بار مجبور نباشد دوباره ببندد.
 const [setupOpen, setSetupOpen] = useState(false)
 useEffect(() => {
  try { setSetupOpen(localStorage.getItem('pb_setup_open') === '1') } catch {}
 }, [])
 useEffect(() => {
  try { localStorage.setItem('pb_setup_open', setupOpen ? '1' : '0') } catch {}
 }, [setupOpen])
 // کارت‌به‌کارت فقط وقتی سوپرادمین برای این tenant روشنش کرده باشد در UI دیده می‌شود
 const [cardToCardAllowed, setCardToCardAllowed] = useState(false)
 // فرم رزرو per-resource (بخش‌ها/سوال‌ها/نوع/اجباری‌بودن — کاملا دیتایی)
 const [intakeForm, setIntakeForm] = useState<IntakeForm>(DEFAULT_INTAKE_FORM)
 const [intakeLoaded, setIntakeLoaded] = useState(false)
 const [intakeSaving, setIntakeSaving] = useState(false)
 const [intakeSaved, setIntakeSaved] = useState(false)
 // متن زیرسوال تازه‌ای که دکتر داره برای هر گزینه می‌نویسه (کلید: fieldId:option)
 const [newSubQuestion, setNewSubQuestion] = useState<Record<string, string>>({})
 // فرم‌بیلدر استادو-جزئیات: کدام سوال/بخش الان در پنل ویرایش انتخاب شده
 const [builderSel, setBuilderSel] = useState<{ sIdx: number; fIdx: number | null } | null>(null)
 // کدام بخش تو لیست بازه (آکاردئون — فقط یکی هم‌زمان)
 const [openSection, setOpenSection] = useState<string | null>(null)
 // درگ‌اند‌دراپ جابه‌جایی سوال/بخش تو لیست
 const [dragField, setDragField] = useState<{ sIdx: number; fIdx: number } | null>(null)
 const [dragOverField, setDragOverField] = useState<{ sIdx: number; fIdx: number } | null>(null)
 const [dragSectionIdx, setDragSectionIdx] = useState<number | null>(null)
 const [dragOverSectionIdx, setDragOverSectionIdx] = useState<number | null>(null)

 // ── Package / Session forms ────────────────────────────────────
 // پیش‌فرض سال/ماه باید همیشه «همین الان» باشد، نه یک تاریخ ثابت کدشده که با
 // گذشت زمان قدیمی می‌ماند (باگ قبلی: 1404/فروردین برای همیشه، حتی در 1405 و بعدش)
 const [newPkg, setNewPkg] = useState(() => {
  const t = getCurrentJalali()
  return {
   month: String(t.month + 1), year: String(t.year),
   primary_sessions: 8, secondary_sessions: 2,
   primary_session_type: 'offline', secondary_session_type: 'offline', notes: '',
  }
 })
 // sessForm به PatientsTab رفت.
 // ─── Data fetching ───────────────────────────────────────────────────────────

 // چه کسی وارد شده؟ (owner یا یک کارمند مشخص) — تعیین می‌کند تب «کارمندها» و
 // سوییچر منبع نمایش داده شوند یا نه
 const loadMe = useCallback(async () => {
  try {
   const r = await fetch(panelApi('/whoami'), { cache: 'no-store' })
   if (r.status === 401) { setNeedsLogin(true); return }
   const d = await r.json()
   setMe({ isOwner: !!d.isOwner, resourceId: d.resourceId || null, resourceName: d.resourceName || null, phone: d.phone || null, slug: d.slug || null, multiTherapist: !!d.multiTherapist, multiTherapistRequested: !!d.multiTherapistRequested, modules: d.modules || {} })
   if (d.isOwner) loadStaff()
   loadProfile()
  } catch {}
 }, [])

 async function loadStaff() {
  try {
   const r = await fetch(panelApi('/resources'), { cache: 'no-store' })
   if (r.ok) { const d = await r.json(); setStaffList(d.resources || []) }
  } catch {}
  setStaffLoaded(true)
 }

 // فرم و CRUD درمانگرها به StaffTab.tsx منتقل شد (فاز 4).

 // نامش نگه داشته شد تا همه‌ی جاهای صداکننده (بعد از mutationها، لاگین، سوییچ
 // منبع) بدون تغییر کار کنند؛ حالا کش SWR پرونده‌ها را revalidate می‌کند.
 // اسپینر/گیت‌ها (loading/initialLoadDone/needsLogin) خودکار از SWR می‌آیند.
 const fetchAll = useCallback(async () => {
  try { await casesMutate() } catch {}
  loadMe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [casesMutate])

 // تازه‌سازی بج «تأیید پرداخت‌ها» — نامش نگه داشته شد تا همه‌ی جاهای صداکننده
 // (بعد از تأیید/رد پرداخت و بازپرداخت) بدون تغییر کار کنند؛ حالا کش SWR را
 // revalidate می‌کند به‌جای ست‌کردن state.
 async function loadPendingPayments() {
  await globalMutate('pending')
 }

 // فهرست پنل‌های همین صاحب — یک بار در mount. اگر بیش از یکی بود، سوییچر در
 // «حساب من» نشان داده می‌شود.
 async function loadMyPanels() {
  try {
   const res = await fetch(panelApi('/switch'), { cache: 'no-store' })
   if (!res.ok) return
   const d = await res.json()
   setMyPanels(d.panels || [])
  } catch {}
 }

 // سوییچ به پنل دیگر همین صاحب — بدون OTP دوباره (سرور هویت را چک می‌کند)،
 // بعد به پنل مقصد ریدایرکت.
 async function switchPanel(targetSlug: string) {
  try {
   const res = await fetch(panelApi('/switch'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetSlug }),
   })
   const d = await res.json()
   if (d.success && d.slug) window.location.href = `/${d.slug}/panel`
   else uiAlert(d.error || 'سوییچ ناموفق بود')
  } catch { uiAlert('خطا در سوییچ پنل') }
 }

 useEffect(() => { fetchAll(); loadSettings(); loadProfile() }, [fetchAll])
 useEffect(() => { loadMyPanels() }, []) // فهرست پنل‌های همین صاحب، یک‌بار

 // لیست پرونده‌ها را خود SWR روی focus و هر 30 ثانیه (فقط وقتی تب دیده می‌شود)
 // بی‌اسپینر تازه می‌کند — هوک useAutoRevalidate قبلی دیگر لازم نیست.

 // همان دلیل نسخه‌ی مراجع: برگشت از bfcache (دکمه‌ی برگشت مرورگر، یا در
 // مرورگرهای موبایل حتی سوییچ‌کردن بین اپ‌ها و برگشتن) React را remount
 // نمی‌کند — یعنی همون DOM منجمد لحظه‌ی خروج، دقیقا همان‌طور که بود، فورا
 // نشان داده می‌شود. باگ قبلی: fetchAll را بی‌سروصدا در پس‌زمینه صدا می‌زدیم
 // درحالی‌که همان محتوای قدیمی/منجمد روی صفحه می‌ماند، و وقتی دیتای تازه
 // می‌رسید یهو جایگزین می‌شد («اول قدیمی، بعد یهو جدید» که دقیقا گزارش شد).
 // فیکس: همان گیت لودینگ اولیه (initialLoadDone) را هم دوباره false می‌کنیم
 // تا هرچه زودتر اسپینر جای محتوای منجمد را بگیرد؛ کاربر «صفحه‌ی قدیمی» را
 // اصلا نمی‌بیند، فقط اسپینر تا رسیدن دیتای تازه.
 useEffect(() => {
  function onPageShow(e: PageTransitionEvent) {
   if (e.persisted) { setInitialLoadDone(false); fetchAll() }
  }
  window.addEventListener('pageshow', onPageShow)
  return () => window.removeEventListener('pageshow', onPageShow)
 }, [fetchAll])

 // توابع پرونده‌ها به PatientsTab.tsx منتقل شدند (فاز 4)؛ اکشن‌های تایید/رد
 // پرداخت (props تب «تأیید پرداخت‌ها») این‌جا ماندند:
 async function confirmPackagePayment(pkgId: string) {
  if (!await uiConfirm('پرداخت پروتکل درمان تأیید شود؟ پس از تأیید، مراجع می‌تواند روزهای جلسات را انتخاب کند.')) return
  const res = await fetch(api('/packages'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: pkgId, paid: true, payment_reject_reason: null }),
  })
  if (!res.ok) { uiAlert('خطا در تأیید پرداخت'); return }
  loadPendingPayments()
  // پرونده‌ی باز: PatientsTab با هر ورود به تب remount و تازه می‌شود (فاز 4)
 }

 // افزودن جلسه‌ی تازه به پرونده — تنها مسیر «دادن جلسه به مراجع». روی psy_stages
 // می‌نشیند و مراجع را در پنل خودش وارد چرخه‌ی «پرداخت → گرفتن وقت» می‌کند.

 async function confirmSessionPayment(sessionId: string) {
  if (!await uiConfirm('پرداخت جلسه‌ی جایگزین تأیید شود؟')) return
  await fetch(api('/sessions'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: sessionId, paid: true, payment_reject_reason: null }),
  })
  loadPendingPayments()
  // پرونده‌ی باز: PatientsTab با هر ورود به تب remount و تازه می‌شود (فاز 4)
 }

 // ثبت بازپرداخت کنسلی به‌همراه فیش واریز
 async function approveApptRequest(id: string, clientName: string) {
  const title = await uiPrompt(`عنوان جلسه‌ای که برای ${clientName} باز می‌شود:`, { defaultValue: profile.first_stage_label || 'مصاحبه', required: true })
  if (title === null) return
  if (!title.trim()) { uiAlert('عنوان لازم است'); return }
  const res = await fetch(api('/appointment-requests'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id, action: 'approve', stage_type: 'custom', title: title.trim() }),
  })
  if (!res.ok) { const d = await res.json().catch(() => ({})); uiAlert(d.error || 'خطا در تأیید'); return }
  await loadPendingPayments(); fetchAll()
 }

 async function rejectApptRequest(id: string) {
  const r = await uiPrompt('دلیل رد درخواست (اختیاری، برای مراجع نمایش داده می‌شود):', {})
  if (r === null) return
  const res = await fetch(api('/appointment-requests'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id, action: 'reject', reject_reason: r.trim() || undefined }),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  await loadPendingPayments()
 }

 async function markRefunded(sessionId: string, refundRef: string, kind?: string) {
  if (!refundRef.trim()) { uiAlert('برای ثبت بازپرداخت، شماره پیگیری لازم است'); return }
  const res = await fetch(api(kind === 'stage' ? '/stages' : '/sessions'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: sessionId, refund_status: 'done', refund_ref: refundRef.trim() }),
  })
  if (!res.ok) { const d = await res.json().catch(() => ({})); uiAlert(d.error || 'ثبت بازپرداخت ناموفق بود'); return }
  await loadPendingPayments()
  // پرونده‌ی باز: PatientsTab با هر ورود به تب remount و تازه می‌شود (فاز 4)
 }


 async function confirmStagePayment(stageId: string, label: string) {
  if (!await uiConfirm(`پرداخت ${label} تأیید شود؟ پس از تأیید، مراجع می‌تواند وقت بگیرد.`)) return
  const res = await fetch(api('/stages'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: stageId, confirm_payment: true }),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  fetchAll()
 }

 // رد پرداخت یک مرحله → بازگشت به مرحله‌ی پرداخت تا مراجع دوباره واریز کند
 async function rejectStagePayment(stageId: string) {
  const r = await uiPrompt('دلیل رد پرداخت را بنویسید (برای مراجع نمایش داده می‌شود):', { required: true })
  if (r === null) return
  const reason = r.trim()
  if (!reason) { uiAlert('لطفا دلیل را بنویسید.'); return }
  const res = await fetch(api('/stages'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: stageId, reject_payment: true, reject_reason: reason }),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  await loadPendingPayments(); fetchAll()
 }

 // رد پرداخت پروتکل درمان → مراجع باید دوباره واریز کند
 async function rejectPackagePayment(pkgId: string) {
  const r = await uiPrompt('دلیل رد پرداخت این پروتکل درمان را بنویسید (مراجع باید دوباره کارت‌به‌کارت کند):', { required: true })
  if (r === null) return
  // ستون اختصاصی — قبلا روی notes می‌نشست که همان توضیح پروتکل درمانی است
  // که خود دکتر نوشته؛ رد پرداخت آن را کامل پاک/بازنویسی می‌کرد.
  const res = await fetch(api('/packages'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: pkgId, payment_submitted: false, paid: false, payment_reject_reason: r.trim() }),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  await loadPendingPayments()
  // پرونده‌ی باز: PatientsTab با هر ورود به تب remount و تازه می‌شود (فاز 4)
 }

 // رد پرداخت جلسه‌ی جایگزین → مراجع باید دوباره واریز کند
 async function rejectSessionPayment(sessionId: string) {
  const r = await uiPrompt('دلیل رد پرداخت این جلسه را بنویسید (مراجع باید دوباره کارت‌به‌کارت کند):', { required: true })
  if (r === null) return
  // ستون اختصاصی (نه doctor_note_for_patient) — وگرنه یادداشت واقعی دکتر
  // برای این جلسه با پیام رد پرداخت جایگزین می‌شد و بعد از تایید نهایی هم
  // پاک نمی‌شد.
  const res = await fetch(api('/sessions'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: sessionId, payment_submitted: false, paid: false, payment_reject_reason: r.trim() }),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  await loadPendingPayments()
  // پرونده‌ی باز: PatientsTab با هر ورود به تب remount و تازه می‌شود (فاز 4)
 }


 const childNameOf = (cn: string) => bookings.find(b => b.case_number === cn)?.client_name || cn

 // یک ردیف جلسه (هم برای «جلسات تکی» هم برای جلسه‌های زیر هر پروتکل درمان)
 // renderSessionList به PatientsTab.tsx منتقل شد (فاز 4).
 // همه‌ی نوبت‌های یک تاریخ (مصاحبه + ارزیابی + جلسه) مرتب‌شده بر اساس ساعت
 function apptsForDate(dateStr: string) {
  const out: { time: string; name: string; type: string; mode?: string; loc?: string; channel?: string | null; modeText: string; color: string; kind: 'stage' | 'session'; id: string; caseNumber: string; delayMinutes?: number | null; cancelled?: boolean; cancelledBy?: string }[] = []
  const bookingByCase = new Map(bookings.map(b => [b.case_number, b]))
  const channelLabel = (m?: string | null) => (m && isMeetMethod(m)) ? MEET_META[m].label : ''
  const modeTextOf = (mode?: string, loc?: string, channel?: string | null) =>
   mode === 'online'
    ? (channelLabel(channel) ? `آنلاین · ${channelLabel(channel)}` : 'آنلاین')
    : mode === 'offline'
    ? (loc ? `حضوری · ${loc}` : 'حضوری')
    : ''
  for (const s of allStages) {
   if (s.session_date === dateStr && s.session_time && s.status === 'booked') {
    const b = bookingByCase.get(s.case_number)
    const mode = s.session_type || b?.session_type
    const loc = b?.office_location
    out.push({
     time: s.session_time, name: childNameOf(s.case_number),
     type: stageTitle(s),
     mode, loc, channel: s.meet_channel, modeText: modeTextOf(mode, loc, s.meet_channel),
     color: s.is_first ? 'bg-sky-500/10 text-sky-600 border-sky-500/20'
      : 'bg-violet-500/10 text-violet-600 border-violet-500/20',
     kind: 'stage', id: s.id, caseNumber: s.case_number, delayMinutes: s.delay_minutes,
    })
   }
  }
  for (const s of allSessions) {
   if (s.session_date === dateStr && s.session_time && s.status !== 'cancelled' && s.status !== 'forfeited' && s.status !== 'replaced') {
    const b = bookingByCase.get(s.case_number)
    const loc = b?.office_location
    out.push({ time: s.session_time, name: childNameOf(s.case_number), type: s.attendee === 'secondary' ? `جلسه (${profile.companion_label || 'همراه'})` : 'جلسه (مراجع)', mode: s.session_type, loc, channel: null, modeText: modeTextOf(s.session_type, loc, null), color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', kind: 'session', id: s.id, caseNumber: s.case_number, delayMinutes: s.delay_minutes })
   }
  }
  // فلگ نوبت‌های لغوشده — فقط اگر روی همان ساعت نوبت فعالی نیست (وگرنه نوبت فعال
  // اولویت دارد). «توسط مطب» = آن ساعت بلاک است؛ «توسط مراجع» = آزاد شده.
  for (const cs of cancelledSlots) {
   if (cs.session_date === dateStr && cs.session_time && !out.some(a => a.time === cs.session_time)) {
    out.push({
     time: cs.session_time, name: childNameOf(cs.case_number),
     type: cs.cancelled_by === 'doctor' ? 'لغو توسط مطب' : 'لغو توسط مراجع',
     mode: undefined, loc: undefined, channel: null, modeText: '',
     color: 'bg-red-500/5 text-red-500 border-red-500/20',
     kind: 'stage', id: `cancel-${cs.id}`, caseNumber: cs.case_number, delayMinutes: null,
     cancelled: true, cancelledBy: cs.cancelled_by,
    })
   }
  }
  return out.sort((a, b) => timeKey(a.time) - timeKey(b.time))
 }

 // اعلام تاخیر برای یک نوبت رزروشده — مراجع در پنل خودش می‌بیند
 async function announceDelay(appt: { kind: 'stage' | 'session'; id: string; name: string; delayMinutes?: number | null }) {
  const r = await uiPrompt(`تاخیر نوبت «${appt.name}» به دقیقه (برای پاک‌کردن تاخیر قبلی، عدد 0 بزن):`,
   { defaultValue: appt.delayMinutes ? String(appt.delayMinutes) : '' })
  if (r === null) return
  const n = parseInt(String(r).trim(), 10)
  if (isNaN(n) || n < 0) { uiAlert('عدد معتبر (0 یا بیشتر) وارد کن.'); return }
  const delay_minutes = n === 0 ? null : n
  if (appt.kind === 'session') {
   await fetch(api('/sessions'), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: appt.id, delay_minutes }),
   })
  } else {
   await fetch(api('/stages'), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: appt.id, delay_minutes }),
   })
  }
  await Promise.all([loadAllSessions(), loadAllStages()])
 }

 // لغو یک نوبت توسط مطب → کاربر بدون پرداخت اضافه دوباره وقت می‌گیرد
 async function cancelAppointment(appt: { kind: 'stage' | 'session'; id: string; name: string }) {
  const notice = await uiPrompt(`لغو نوبت «${appt.name}». پیامی برای مراجع بنویسید (اختیاری):`,
   { defaultValue: 'نوبت شما توسط مطب لغو شد. لطفا بدون پرداخت اضافه، زمان جدیدی انتخاب کنید.' })
  if (notice === null) return
  const msg = notice.trim() || 'نوبت شما توسط مطب لغو شد. لطفا زمان جدیدی انتخاب کنید.'
  if (appt.kind === 'session') {
   await fetch(api('/sessions'), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: appt.id, doctor_cancel: true, doctor_note_for_patient: msg }),
   })
  } else {
   await fetch(api('/stages'), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: appt.id, doctor_cancel: true, cancel_notice: msg }),
   })
  }
  await Promise.all([fetchAll(), loadAllSessions(), loadAllStages()])
 }

 // لغو همه‌ی نوبت‌های یک روز
 async function cancelDay(dateStr: string, appts: { kind: 'stage' | 'session'; id: string; name: string }[]) {
  if (appts.length === 0) return
  if (!await uiConfirm(`همه‌ی ${appts.length} نوبت این روز لغو شود؟ به همه‌ی مراجعان اطلاع داده می‌شود تا دوباره وقت بگیرند.`)) return
  const msg = 'نوبت شما توسط مطب لغو شد. لطفا بدون پرداخت اضافه، زمان جدیدی انتخاب کنید.'
  for (const a of appts) {
   if (a.kind === 'session') {
    await fetch(api('/sessions'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: a.id, doctor_cancel: true, doctor_note_for_patient: msg }) })
   } else {
    await fetch(api('/stages'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: a.id, doctor_cancel: true, cancel_notice: msg }) })
   }
  }
  await Promise.all([fetchAll(), loadAllSessions(), loadAllStages()])
 }



 // changeMonth و loadMonthSchedules همراه تب به ScheduleTab.tsx رفتند (فاز 4).
 // owner با viewingResourceId مشخص می‌کند برنامه‌ی کدام دکتر را می‌بیند/ویرایش می‌کند
 const scheduleResourceQS = () => (me?.isOwner && viewingResourceId) ? `&resource_id=${viewingResourceId}` : ''

 // همه‌ی جلسه‌های زمان‌بندی‌شده را بخوان (برای نمای برنامه)
 async function loadAllSessions() {
  try {
   const res = await fetch(api('/sessions?all=1'), { cache: 'no-store' })
   const data = await res.json()
   setAllSessions(data.sessions || [])
  } catch {}
 }

 // همه‌ی مراحل رزروشده (مصاحبه/ارزیابی) را بخوان (برای نمای برنامه)
 async function loadAllStages() {
  try {
   const res = await fetch(api('/stages?all=1'), { cache: 'no-store' })
   const data = await res.json()
   setAllStages(data.stages || [])
  } catch {}
  try {
   const res = await fetch(api('/stages?cancelled_slots=1'), { cache: 'no-store' })
   const data = await res.json()
   setCancelledSlots(data.cancelled_slots || [])
  } catch {}
 }

 // تازه‌سازی رزروها بدون لودینگ کلی (برای به‌روزماندن تعداد نوبت تقویم)
 async function refreshBookings() {
  try { await casesMutate() } catch {}
 }

 // ماژول‌های پنل مراجع (روشن/خاموش)
 const [patientFeatures, setPatientFeatures] = useState<Record<string, boolean>>({
  patient_buy_extra_session: true, patient_self_cancel: true,
 })
 const [patientFeaturesLoaded, setPatientFeaturesLoaded] = useState(false)
 async function loadPatientFeatures() {
  const r = await fetch(api('/features'), { cache: 'no-store' })
  if (r.ok) { const d = await r.json(); setPatientFeatures(d.features || {}) }
  setPatientFeaturesLoaded(true)
 }
 async function togglePatientFeature(key: string, enabled: boolean) {
  setPatientFeatures(prev => ({ ...prev, [key]: enabled }))
  await fetch(api('/features'), {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ key, enabled }),
  })
 }

 // با ورود به تب برنامه، داده‌های ماه و جلسه‌ها را بارگذاری کن
 useEffect(() => {
  if (mainTab === 'dashboard') { loadAllSessions(); loadAllStages(); if (!profileLoaded) loadProfile(); loadDashboardFinance(); if (hasWorkingDays === null) checkWorkingDays() }
  if (mainTab === 'patients') { loadAllSessions(); loadAllStages(); refreshBookings() }
  if (mainTab === 'schedule') { /* ماه را خود ScheduleTab هنگام mount می‌خواند */ loadAllSessions(); loadAllStages(); refreshBookings(); if (!profileLoaded) loadProfile() }
  if (mainTab === 'settings') {
   if (!settingsLoaded) loadSettings()
   loadProfile()
   loadIntakeForm()
   if (me?.isOwner !== false && !patientFeaturesLoaded) loadPatientFeatures()
   // staffList برای سوییچر «پروفایل کدام دکتر» بالای تب‌های صفحه‌ی عمومی لازم است
   if (me?.isOwner && !staffLoaded) loadStaff()
   if (me?.isOwner && !themeLoaded) loadThemeProfile()
  }
  if (mainTab === 'staff' && me?.isOwner && !staffLoaded) loadStaff()
  if (mainTab === 'tickets') loadTickets()
  // تب «گزارشات مالی»: load داخل خود FinanceTab است (هنگام mount)
  // تب «رشد و مراجعان»: loadهایش داخل خود GrowthTab است (هنگام mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [mainTab, viewingResourceId])

 // بج عددی لیست انتظار روی خود منو، حتی وقتی داخل این تب نیستیم
 useEffect(() => { loadWaitlist() }, [])

 async function loadWaitlist() {
  try {
   const res = await fetch(api('/waitlist'), { cache: 'no-store' })
   const data = await res.json()
   setWaitlist(data.waitlist || [])
  } catch {}
 }
 // loadReviews/loadAnalytics/loadCampaigns و اکشن‌های لیست انتظار/نظرات به
 // GrowthTab منتقل شدند (فاز 4).

 // ── دارک‌مود: از localStorage بخوان و روی پنل اعمال کن ──────────
 useEffect(() => {
  const saved = typeof window !== 'undefined' && localStorage.getItem('pb_admin_dark') === '1'
  setDarkMode(saved)
 }, [])

 function toggleDark(on: boolean) {
  setDarkMode(on)
  try { localStorage.setItem('pb_admin_dark', on ? '1' : '0') } catch {}
 }

 // ── تنظیمات سطح tenant (فقط آدرس‌های مطب — مشترک همه‌ی دکترها) ─
 // ── رد تغییرات: تا دکمه‌ی ذخیره فقط وقتی نشان داده شود که واقعا چیزی عوض شده ──
 const [settingsSnapshot, setSettingsSnapshot] = useState('')
 const [profileSnapshot, setProfileSnapshot] = useState('')
 const [intakeSnapshot, setIntakeSnapshot] = useState('')
 const isSettingsDirty = settingsLoaded && JSON.stringify(settings) !== settingsSnapshot
 const isProfileDirty = profileLoaded && JSON.stringify(profile) !== profileSnapshot
 const isIntakeDirty = intakeLoaded && JSON.stringify(intakeForm) !== intakeSnapshot
 const isSettingsTabDirty = isSettingsDirty || isProfileDirty || isIntakeDirty

 // انصراف — برگرداندن فرم‌ها به آخرین نسخه‌ی ذخیره‌شده (snapshot)، بدون فراخوانی سرور
 function cancelSettingsChanges() {
  try { if (settingsSnapshot) setSettings(JSON.parse(settingsSnapshot)) } catch {}
  try { if (profileSnapshot) setProfile(JSON.parse(profileSnapshot)) } catch {}
  try { if (intakeSnapshot) setIntakeForm(JSON.parse(intakeSnapshot)) } catch {}
 }

 async function loadSettings() {
  try {
   const res = await fetch(api('/settings'), { cache: 'no-store' })
   if (res.status === 401) { setNeedsLogin(true); return }
   const data = await res.json()
   const next = { ...DEFAULT_SETTINGS, office_locations: data.settings?.office_locations ?? DEFAULT_SETTINGS.office_locations }
   setSettings(next)
   setSettingsSnapshot(JSON.stringify(next))
  } catch {}
  setSettingsLoaded(true)
 }

 async function saveSettings() {
  setSettingsSaving(true); setSettingsSaved(false)
  try {
   const res = await fetch(api('/settings'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
   })
   if (res.status === 401) { setNeedsLogin(true); return }
   const data = await res.json().catch(() => ({}))
   if (!res.ok) { uiAlert((data.error || 'ذخیره‌ی تنظیمات ناموفق بود') + (data.detail ? `\n\n(جزئیات فنی: ${data.detail})` : '')); setSettingsSaving(false); return }
   const next = data.settings ? { ...DEFAULT_SETTINGS, ...data.settings } : settings
   if (data.settings) setSettings(next)
   setSettingsSnapshot(JSON.stringify(next))
   setSettingsSaved(true)
   setTimeout(() => setSettingsSaved(false), 2500)
  } catch {}
  setSettingsSaving(false)
 }

 // ── پروفایل per-resource (نام/عنوان/آواتار/بج/نوع جلسه/کارت) ────
 // owner با viewingResourceId انتخاب می‌کند پروفایل کدام دکتر را می‌بیند
 // (خالی = تنها/اولین دکتر، دقیقا رفتار تک‌دکترهای فعلی)؛ کارمند همیشه پروفایل خودش.
 async function loadProfile() {
  try {
   const url = me?.isOwner && viewingResourceId ? api(`/profile?resource_id=${viewingResourceId}`) : api('/profile')
   const res = await fetch(url, { cache: 'no-store' })
   if (res.status === 401) { setNeedsLogin(true); return }
   const data = await res.json()
   const next = { ...DEFAULT_PROFILE, ...(data.profile || {}) }
   setProfile(next)
   setProfileSnapshot(JSON.stringify(next))
   if (data.plan) setTenantPlan(data.plan)
   setTrialExpiresAt(data.trial_expires_at || null)
   setCardToCardAllowed(!!data.card_to_card_allowed)
  } catch {}
  setProfileLoaded(true)
 }

 async function saveProfile() {
  setProfileSaving(true); setProfileSaved(false)
  try {
   const body: Record<string, any> = { ...profile }
   if (me?.isOwner && viewingResourceId) body.resource_id = viewingResourceId
   const res = await fetch(api('/profile'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
   })
   if (res.status === 401) { setNeedsLogin(true); return }
   if (!res.ok) { const d = await res.json().catch(() => ({})); uiAlert((d.error || 'ذخیره نشد') + (d.detail ? `\n\n(جزئیات فنی: ${d.detail})` : '')); setProfileSaving(false); return }
   setProfileSnapshot(JSON.stringify(profile))
   setProfileSaved(true)
   setTimeout(() => setProfileSaved(false), 2500)
  } catch {}
  setProfileSaving(false)
 }

 const patchProfile = (p: Partial<ResourceProfileView>) => setProfile(s => ({ ...s, ...p }))

 // ── تم برند (سطح tenant، نه resource) — رنگ صفحه‌ی عمومی و پنل مراجع.
 // این‌جا از /panel/profile استفاده می‌کند (نه psy/profile که بالاست و سطح
 // resource است)؛ چون این روت همه‌ی فیلدهای tenant_profiles را با هم می‌خواند/
 // می‌نویسد، کل ردیف نگه داشته می‌شود تا ذخیره‌ی جزئی، بقیه‌ی فیلدها (نام،
 // بیوگرافی، شماره‌کارت و ...) را خالی نکند.
 const [themeProfile, setThemeProfile] = useState<any>(null)
 const [themeLoaded, setThemeLoaded] = useState(false)
 const [themeSaving, setThemeSaving] = useState(false)
 const [themeSaved, setThemeSaved] = useState(false)

 async function loadThemeProfile() {
  try {
   const res = await fetch(`/api/t/${slug}/panel/profile`, { cache: 'no-store' })
   if (res.ok) { const d = await res.json(); setThemeProfile(d.profile || {}) }
  } catch {}
  setThemeLoaded(true)
 }

 function patchTheme(p: Record<string, unknown>) {
  setThemeProfile((s: any) => ({ ...(s || {}), ...p }))
 }

 async function saveTheme() {
  if (!themeProfile) return
  setThemeSaving(true); setThemeSaved(false)
  try {
   const res = await fetch(`/api/t/${slug}/panel/profile`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(themeProfile),
   })
   if (!res.ok) { const d = await res.json().catch(() => ({})); uiAlert(d.error || 'ذخیره نشد'); setThemeSaving(false); return }
   setThemeSaved(true); setTimeout(() => setThemeSaved(false), 2500)
  } catch {}
  setThemeSaving(false)
 }

 // ── آپلود عکس پروفایل با ویرایشگر برش ──────────────────────────────
 // انتخاب فایل → مودال برش (جابه‌جایی با درگ + زوم با اسلایدر، تا صورت وسط
 // دایره بیفتد) → خروجی مربع 512px با canvas (JPEG فشرده، معمولا <100KB) →
 // آپلود به روت خودمان (upload-avatar) که سمت سرور به R2 می‌فرستد — عمدا نه
 // آپلود مستقیم مرورگر به R2، چون آن مسیر CORS policy روی bucket می‌خواهد.
 // avatar_url فقط در state ست می‌شود — ذخیره‌ی واقعی با «ذخیره‌ی تغییرات».
 const avatarInputRef = useRef<HTMLInputElement>(null)
 const [avatarUploading, setAvatarUploading] = useState(false)
 const CROP_VIEW = 260 // ضلع پنجره‌ی برش (px)
 const [cropSrc, setCropSrc] = useState<string | null>(null)
 const cropImgRef = useRef<HTMLImageElement | null>(null)
 const [cropDims, setCropDims] = useState<{ w: number; h: number } | null>(null)
 const [cropZoom, setCropZoom] = useState(1)
 const [cropOff, setCropOff] = useState({ x: 0, y: 0 })
 const cropDragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)
 useModalBackClose(!!cropSrc, () => closeCropper())

 function closeCropper() {
  if (cropSrc) URL.revokeObjectURL(cropSrc)
  setCropSrc(null); setCropDims(null); setCropZoom(1); setCropOff({ x: 0, y: 0 })
  cropImgRef.current = null
 }

 function handleAvatarFile(file: File | undefined | null) {
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
   uiAlert('فقط عکس JPG، PNG یا WebP قابل قبول است'); return
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
   cropImgRef.current = img
   setCropDims({ w: img.width, h: img.height })
   setCropZoom(1); setCropOff({ x: 0, y: 0 })
   setCropSrc(url)
  }
  img.onerror = () => { URL.revokeObjectURL(url); uiAlert('تصویر خوانده نشد') }
  img.src = url
 }

 // مقیاس نمایش: پایه = پوشش کامل پنجره (cover)، ضرب‌در زوم کاربر
 function cropScale() {
  if (!cropDims) return 1
  return (CROP_VIEW / Math.min(cropDims.w, cropDims.h)) * cropZoom
 }
 // جابه‌جایی همیشه طوری محدود می‌شود که هیچ لبه‌ی خالی داخل کادر نیفتد
 function clampCropOff(x: number, y: number, zoom = cropZoom) {
  if (!cropDims) return { x: 0, y: 0 }
  const s = (CROP_VIEW / Math.min(cropDims.w, cropDims.h)) * zoom
  const maxX = Math.max(0, (cropDims.w * s - CROP_VIEW) / 2)
  const maxY = Math.max(0, (cropDims.h * s - CROP_VIEW) / 2)
  return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) }
 }

 async function confirmCrop() {
  const img = cropImgRef.current
  if (!img || !cropDims) return
  setAvatarUploading(true)
  try {
   // ناحیه‌ی دیده‌شده در کادر را به مختصات عکس اصلی برمی‌گردانیم
   const s = cropScale()
   const W = cropDims.w * s, H = cropDims.h * s
   const sx = ((W - CROP_VIEW) / 2 - cropOff.x) / s
   const sy = ((H - CROP_VIEW) / 2 - cropOff.y) / s
   const sside = CROP_VIEW / s
   const canvas = document.createElement('canvas')
   canvas.width = 512; canvas.height = 512
   const ctx = canvas.getContext('2d')
   if (!ctx) throw new Error('canvas')
   ctx.drawImage(img, sx, sy, sside, sside, 0, 0, 512, 512)
   const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', 0.85))

   const fd = new FormData()
   fd.append('file', blob, 'avatar.jpg')
   if (me?.isOwner && viewingResourceId) fd.append('resource_id', viewingResourceId)
   const res = await fetch(panelApi('/upload-avatar'), { method: 'POST', body: fd })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { uiAlert(d.error || 'آپلود عکس ناموفق بود — دوباره امتحان کن'); return }
   patchProfile({ avatar_url: d.public_url })
   closeCropper()
  } catch {
   uiAlert('آپلود عکس ناموفق بود — دوباره امتحان کن')
  } finally {
   setAvatarUploading(false)
  }
 }

 // ذخیره‌ی مستقل لیست «ساعت‌های سریع» — بلافاصله پس از افزودن/حذف در تب
 // «روزهای کاری» (نه منتظر دکمه‌ی «ذخیره‌ی تغییرات» تب تنظیمات سایت که
 // برای بقیه‌ی فیلدهای پروفایل است). هر دکتر لیست خودش را مستقل ویرایش می‌کند.
 async function persistQuickTimes(next: string[]) {
  setQuickTimesSaving(true)
  try {
   const body: Record<string, any> = { quick_times: next }
   if (me?.isOwner && viewingResourceId) body.resource_id = viewingResourceId
   const res = await fetch(api('/profile'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
   })
   if (res.status === 401) { setNeedsLogin(true); return }
   if (!res.ok) { const d = await res.json().catch(() => ({})); uiAlert(d.error || 'ذخیره نشد'); return }
   patchProfile({ quick_times: next })
   setProfileSnapshot(s => {
    try { return JSON.stringify({ ...JSON.parse(s), quick_times: next }) } catch { return s }
   })
  } finally {
   setQuickTimesSaving(false)
  }
 }

 // ── فرم رزرو (per-resource) ───────────────────────────────────────────────
 async function loadIntakeForm() {
  try {
   const url = me?.isOwner && viewingResourceId ? api(`/intake-form?resource_id=${viewingResourceId}`) : api('/intake-form')
   const res = await fetch(url, { cache: 'no-store' })
   if (res.status === 401) { setNeedsLogin(true); return }
   const data = await res.json()
   const next = data.form || DEFAULT_INTAKE_FORM
   setIntakeForm(next)
   setIntakeSnapshot(JSON.stringify(next))
  } catch {}
  setIntakeLoaded(true)
  setBuilderSel(null)
  setOpenSection(null)
 }

 // سوال‌هایی که می‌توانند «شرط» یک سوال بعدی باشند: فقط تک‌گزینه‌ای/چندگزینه‌ای، و فقط آن‌هایی که قبل از این سوال آمده‌اند
 function eligibleTriggerFields(sIdx: number, fIdx: number): FormField[] {
  const result: FormField[] = []
  for (let si = 0; si < intakeForm.sections.length; si++) {
   for (let fi = 0; fi < intakeForm.sections[si].fields.length; fi++) {
    if (si === sIdx && fi === fIdx) return result
    const fld = intakeForm.sections[si].fields[fi]
    if ((fld.type === 'select' || fld.type === 'multiselect') && (fld.options || []).length > 0) result.push(fld)
   }
  }
  return result
 }
 // همه‌ی سوال‌هایی که بعد این سوال می‌آیند — برای وصل‌کردن «این گزینه، کدام سوال‌های بعدی رو نشون بده»
 function downstreamFields(sIdx: number, fIdx: number): { sIdx: number; fIdx: number; field: FormField }[] {
  const result: { sIdx: number; fIdx: number; field: FormField }[] = []
  let started = false
  for (let si = 0; si < intakeForm.sections.length; si++) {
   for (let fi = 0; fi < intakeForm.sections[si].fields.length; fi++) {
    if (si === sIdx && fi === fIdx) { started = true; continue }
    if (started) result.push({ sIdx: si, fIdx: fi, field: intakeForm.sections[si].fields[fi] })
   }
  }
  return result
 }
 const fieldTypeIcon = (t: FormFieldType) => t === 'text' ? 'Aa' : t === 'textarea' ? '¶' : t === 'select' ? '◉' : t === 'date' ? '' : t === 'phone' ? '☎' : t === 'email' ? '@' : '☑'
 const fieldTypeLabel = (t: FormFieldType) => t === 'text' ? 'متن کوتاه' : t === 'textarea' ? 'متن بلند' : t === 'select' ? 'تک‌گزینه‌ای' : t === 'date' ? 'تاریخ' : t === 'phone' ? 'شماره‌تماس' : t === 'email' ? 'ایمیل' : 'چندگزینه‌ای'

 async function saveIntakeForm() {
  setIntakeSaving(true); setIntakeSaved(false)
  try {
   const body: Record<string, any> = { form: intakeForm }
   if (me?.isOwner && viewingResourceId) body.resource_id = viewingResourceId
   const res = await fetch(api('/intake-form'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
   })
   if (res.status === 401) { setNeedsLogin(true); return }
   if (!res.ok) { const d = await res.json().catch(() => ({})); uiAlert((d.error || 'ذخیره‌ی فرم ناموفق بود') + (d.detail ? `\n\n(جزئیات فنی: ${d.detail})` : '')); setIntakeSaving(false); return }
   setIntakeSnapshot(JSON.stringify(intakeForm))
   setIntakeSaved(true)
   setTimeout(() => setIntakeSaved(false), 2500)
  } catch {}
  setIntakeSaving(false)
 }

 function addFormSection() {
  const id = genId('section')
  setIntakeForm(f => ({ sections: [...f.sections, { id, title: 'بخش جدید', fields: [] }] }))
  setBuilderSel({ sIdx: intakeForm.sections.length, fIdx: null })
  setOpenSection(id)
 }
 function updateFormSection(idx: number, patch: Partial<IntakeForm['sections'][number]>) {
  setIntakeForm(f => ({ sections: f.sections.map((s, i) => i === idx ? { ...s, ...patch } : s) }))
 }
 function removeFormSection(idx: number) {
  setIntakeForm(f => ({ sections: f.sections.filter((_, i) => i !== idx) }))
  setBuilderSel(sel => (sel && sel.sIdx === idx) ? null : sel)
 }
 function moveFormSection(idx: number, dir: -1 | 1) {
  setIntakeForm(f => {
   const next = [...f.sections]
   const j = idx + dir
   if (j < 0 || j >= next.length) return f
   ;[next[idx], next[j]] = [next[j], next[idx]]
   return { sections: next }
  })
 }
 // جابه‌جایی آزاد (برای درگ‌اند‌دراپ) — از هر اندیس به هر اندیس دیگر
 function reorderFormSection(from: number, to: number) {
  if (from === to) return
  setIntakeForm(f => {
   const next = [...f.sections]
   const [item] = next.splice(from, 1)
   next.splice(to, 0, item)
   return { sections: next }
  })
  setBuilderSel(sel => {
   if (!sel) return sel
   if (sel.sIdx === from) return { ...sel, sIdx: to }
   if (from < to && sel.sIdx > from && sel.sIdx <= to) return { ...sel, sIdx: sel.sIdx - 1 }
   if (from > to && sel.sIdx >= to && sel.sIdx < from) return { ...sel, sIdx: sel.sIdx + 1 }
   return sel
  })
 }
 function addFormField(sIdx: number) {
  const newIdx = intakeForm.sections[sIdx].fields.length
  updateFormSection(sIdx, {
   fields: [...intakeForm.sections[sIdx].fields, { id: genId('field'), label: 'سوال جدید', type: 'text' as FormFieldType, required: false }],
  })
  setBuilderSel({ sIdx, fIdx: newIdx })
  setOpenSection(intakeForm.sections[sIdx].id)
 }
 // زیرسوال تازه که خود دکتر متنش رو می‌نویسه — درست بعد سوال محرک اضافه می‌شه و
 // به همون گزینه وصل می‌شه (showIf از قبل ست شده، دیگه نیازی به لینک‌کردن دستی نیست)
 function addSubQuestion(sIdx: number, fIdx: number, optionValue: string) {
  const triggerField = intakeForm.sections[sIdx].fields[fIdx]
  const key = `${triggerField.id}:${optionValue}`
  const label = (newSubQuestion[key] || '').trim()
  if (!label) return
  const newField: FormField = { id: genId('field'), label, type: 'text', required: false, showIf: { fieldId: triggerField.id, value: optionValue } }
  setIntakeForm(f => ({
   sections: f.sections.map((s, i) => i !== sIdx ? s : {
    ...s, fields: [...s.fields.slice(0, fIdx + 1), newField, ...s.fields.slice(fIdx + 1)],
   }),
  }))
  setNewSubQuestion(s => ({ ...s, [key]: '' }))
  setBuilderSel({ sIdx, fIdx: fIdx + 1 })
 }
 function updateFormField(sIdx: number, fIdx: number, patch: Partial<FormField>) {
  setIntakeForm(f => ({
   sections: f.sections.map((s, i) => i !== sIdx ? s : {
    ...s, fields: s.fields.map((fl, j) => j === fIdx ? { ...fl, ...patch } : fl),
   }),
  }))
 }
 function removeFormField(sIdx: number, fIdx: number) {
  setIntakeForm(f => ({
   sections: f.sections.map((s, i) => i !== sIdx ? s : { ...s, fields: s.fields.filter((_, j) => j !== fIdx) }),
  }))
  setBuilderSel(sel => (sel && sel.sIdx === sIdx && sel.fIdx === fIdx) ? null : sel)
 }
 function moveFormField(sIdx: number, fIdx: number, dir: -1 | 1) {
  setIntakeForm(f => ({
   sections: f.sections.map((s, i) => {
    if (i !== sIdx) return s
    const next = [...s.fields]
    const j = fIdx + dir
    if (j < 0 || j >= next.length) return s
    ;[next[fIdx], next[j]] = [next[j], next[fIdx]]
    return { ...s, fields: next }
   }),
  }))
 }
 // جابه‌جایی آزاد سوال داخل همان بخش (برای درگ‌اند‌دراپ)
 function reorderFormField(sIdx: number, from: number, to: number) {
  if (from === to) return
  setIntakeForm(f => ({
   sections: f.sections.map((s, i) => {
    if (i !== sIdx) return s
    const next = [...s.fields]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return { ...s, fields: next }
   }),
  }))
  setBuilderSel(sel => {
   if (!sel || sel.sIdx !== sIdx || sel.fIdx === null) return sel
   if (sel.fIdx === from) return { ...sel, fIdx: to }
   if (from < to && sel.fIdx > from && sel.fIdx <= to) return { ...sel, fIdx: sel.fIdx - 1 }
   if (from > to && sel.fIdx >= to && sel.fIdx < from) return { ...sel, fIdx: sel.fIdx + 1 }
   return sel
  })
 }


 // helperهای ویرایش آرایه‌ها
 // برچسب یک کلید details: اول از فرم فعلی همین دکتر (اگر چنین فیلدی هنوز هست)، بعد از نقشه‌ی پرونده‌های قدیمی، وگرنه خود کلید
 // detailFieldLabel/formatDetailValue به PatientsTab رفتند (فاز 4).

 const patchSettings = (p: Partial<ClinicSettings>) => setSettings(s => ({ ...s, ...p }))
 const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`

 // ── گزارشات مالی ──────────────────────────────────────────────
 // loadFinance به FinanceTab.tsx منتقل شد (فاز 4).

 // گزارش مالی داشبورد — state کاملا جدا از تب «گزارشات مالی» تا انتخاب
 // بازه‌ی کاربر توی اون تب با فچ داشبورد قاطی/بازنویسی نشود
 async function loadDashboardFinance() {
  try {
   const fromIso = new Date(Date.now() - 180 * 86400000).toISOString()
   const res = await fetch(api('/finance') + `?from=${encodeURIComponent(fromIso)}`, { cache: 'no-store' })
   if (res.status === 401) { setNeedsLogin(true); return }
   const data = await res.json()
   setDashboardFinance(data)
  } catch {}
  setDashboardLoaded(true)
 }

 // برای چک‌لیست راه‌اندازی — فقط یک بار لازم است، سبک است (بدون year/month
 // همه‌ی روزهای ثبت‌شده را برمی‌گرداند، صرفا طولش را می‌خواهیم)
 async function checkWorkingDays() {
  try {
   const res = await fetch(api('/schedule'), { cache: 'no-store' })
   const data = await res.json()
   const days = Array.isArray(data.schedules) ? data.schedules : []
   setHasWorkingDays(days.some((d: any) => !d.is_off && Array.isArray(d.available_times) && d.available_times.length > 0))
  } catch { setHasWorkingDays(false) }
 }

 // applyCustomRange همراه تب مالی به FinanceTab.tsx رفت.

 // saveSchedule و selectSchedDay همراه تب به ScheduleTab.tsx رفتند (فاز 4).

 // ─── Filtered lists ──────────────────────────────────────────────────────────

 // filteredPatients همراه patientSearch به PatientsTab رفت (فاز 4).

 const bookingCounts = {
  all: bookings.length,
  pending: bookings.filter(b => b.status === 'pending').length,
  confirmed: bookings.filter(b => b.status === 'confirmed').length,
  cancelled: bookings.filter(b => b.status === 'cancelled').length,
 }

 // ⚠️ این useState باید همیشه قبل از هر early-return زیر بماند — این کامپوننت
 // چند تا `if (...) return` (لاگین، لودینگ اولیه) دارد و React هوک‌هایی که بعد
 // از یک early-return بیایند را «مشروط» حساب می‌کند: رندر اول (initialLoadDone
 // هنوز false) اصلا به این خط نمی‌رسید، رندر بعدی (initialLoadDone=true) می‌رسید
 // — یعنی تعداد هوک‌ها بین دو رندر فرق می‌کرد و React همان لحظه کرش می‌کرد
 // («خطای غیرمنتظره» که دقیقا با اضافه‌شدن گیت initialLoadDone افتاد).
 // این دو گروه، حالا زیر خود تب «تنظیمات» در سایدبار اصلی نمایش داده می‌شوند
 // (نه یک صفحه‌ی جدا). تیم/حساب/پشتیبانی از این‌جا جدا و تب مستقل خودشان‌اند.
 type SettingsGroup = { title: string; items: { key: SettingsSub; icon: string; label: string }[] }
 const settingsGroups: SettingsGroup[] = [
  {
   title: 'صفحه‌ی عمومی', items: [
    { key: 'profile', icon: '👤', label: 'پروفایل' },
    { key: 'payments', icon: '💳', label: 'روش پرداخت' },
    { key: 'pricing', icon: '💰', label: 'قیمت‌گذاری' },
    { key: 'terms', icon: '📝', label: 'شرایط و مقررات' },
    { key: 'form', icon: '📝', label: 'فرم رزرو' },
    ...(me?.isOwner !== false ? [{ key: 'appearance' as const, icon: '🎨', label: 'ظاهر و برند' }] : []),
   ],
  },
  ...(me?.isOwner !== false ? [{
   title: 'پنل مراجع', items: [
    { key: 'patient_panel' as const, icon: '⚙️', label: 'ماژول‌ها و سیاست‌ها' },
   ],
  }] : []),
 ]

 // مودال‌های سفارشی هم مثل uiAlert/uiConfirm با دکمه‌ی برگشت هماهنگ می‌شوند —
 // اول برگشت فقط مودال را می‌بندد، نه صفحه‌ی زیرین را.
 useModalBackClose(sidebarOpen, () => setSidebarOpen(false))
 // هوک‌های back-close مودال‌های پرونده به PatientsTab رفتند (فاز 4).

 // ─── Render ──────────────────────────────────────────────────────────────────

 if (needsLogin) return <PanelLogin slug={slug} onSuccess={() => { setNeedsLogin(false); fetchAll() }} />

 if (!initialLoadDone) return (
  <div className="min-h-screen bg-canvas flex items-center justify-center" dir="rtl">
   <div className="text-center">
    <div className="w-8 h-8 border-2 border-ink/20 border-t-ink rounded-full animate-spin mx-auto mb-3" />
    <p className="text-sm text-soot">در حال بارگذاری پنل...</p>
   </div>
  </div>
 )

 const pendingActionCount = pendingStages.length + pendingPkgs.length + pendingSess.length + pendingRefunds.length + pendingApptRequests.length

 // تب «تأیید پرداخت‌ها» فقط وقتی به‌دردبخور است که کارت‌به‌کارت واقعا استفاده می‌شود
 // (وگرنه پرداخت‌ها آنلاین و خودکار تایید می‌شوند) — مگر این‌که از قبل چیزی منتظر
 // رسیدگی مانده باشد (مثلا یک بازپرداخت کنسلی که همیشه دستی می‌ماند).
 const showBookingsTab = profile.payment_methods.card_to_card || pendingActionCount > 0

 // ── سیستم ماژولار (فاز 3): تب/زیرتب‌ها از روی ماژول‌های فعال tenant ─────────
 // mod() fail-open است — قبل از migration 0029 (نقشه‌ی خالی از whoami) همه‌چیز
 // مثل قبل دیده می‌شود. با خاموش‌کردن ماژول از سوپرادمین، هم تبش این‌جا غیب
 // می‌شود هم API‌اش (requireModule فاز 2) رد می‌کند — UI و سرور هماهنگ.
 const mod = (key: string) => moduleOn(me?.modules, key)
 const growthTabs = GROWTH_SUBTABS.filter(t => mod(t.module))

 const navItems = [
  { key: 'dashboard' as const, icon: '🏠', label: 'داشبورد', badge: 0 },
  { key: 'patients' as const, icon: '📁', label: 'پرونده‌ها', badge: 0 },
  { key: 'schedule' as const, icon: '🗓', label: 'روزهای کاری', badge: 0 },
  ...(showBookingsTab ? [{ key: 'bookings' as const, icon: '💳', label: 'تأیید پرداخت‌ها', badge: pendingActionCount }] : []),
  { key: 'finance' as const, icon: '📊', label: 'گزارشات مالی', badge: 0 },
  ...(growthTabs.length ? [{ key: 'growth' as const, icon: '👥', label: 'رشد و مراجعان', badge: mod('waitlist') ? waitlistCount : 0 }] : []),
 ]

 // این‌ها قبلا زیر «تنظیمات» صفحه‌ی دوم بودند ولی خودشان واقعا تنظیمات نیستند —
 // حالا هم‌سطح بقیه‌ی تب‌های اصلی‌اند، بعد از خود تب «تنظیمات».
 const bottomNavItems = [
  ...(me?.isOwner && me?.multiTherapist ? [{ key: 'staff' as const, icon: '🩺', label: 'درمانگرها', badge: 0 }] : []),
  { key: 'account' as const, icon: '🪪', label: 'حساب من', badge: 0 },
  { key: 'tickets' as const, icon: '🎫', label: 'پشتیبانی', badge: 0 },
  { key: 'capabilities' as const, icon: '🧩', label: 'قابلیت‌ها', badge: 0 },
 ]

 function NavItemButton({ item, onNavigate }: { item: { key: MainTab; icon: string; label: string; badge: number }; onNavigate?: () => void }) {
  return (
   <button onClick={() => { navigateTab(item.key); onNavigate?.() }}
    className={`relative w-full text-right px-3 py-2.5 rounded-lg text-sm flex items-center justify-between gap-2 transition-colors ${
     mainTab === item.key ? 'bg-gray-200 text-ink font-semibold' : 'text-soot hover:bg-gray-100'}`}>
    {mainTab === item.key && <span className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-ink" aria-hidden="true" />}
    <span className="flex items-center gap-2"><Glyph icon={item.icon} /> {item.label}</span>
    {item.badge > 0 && (
     <span className="w-5 h-5 shrink-0 bg-amber-100 text-amber-800 text-[11px] rounded-full flex items-center justify-center font-bold leading-none">
      {toFarsiNum(item.badge)}
     </span>
    )}
   </button>
  )
 }

 // سایدبار حالا فقط یک «صفحه» است — قبلا کلیک روی «تنظیمات» کل سایدبار را عوض
 // می‌کرد و به یک صفحه‌ی دوم می‌رفت؛ حالا «تنظیمات» فقط یک تب دیگر مثل بقیه است
 // که با کلیک، زیرمجموعه‌هایش (صفحه‌ی عمومی + پنل مراجع) همین زیرش باز می‌شود.
 function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
   <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
    {navItems.map(item => <NavItemButton key={item.key} item={item} onNavigate={onNavigate} />)}

    <div>
     {/* «تنظیمات» یک تب نیست، یک کرکره است: کلیک روی آن فقط زیرمنو را باز/بسته
        می‌کند و کاربر را از تبی که در آن است بیرون نمی‌آورد. تنها با انتخاب یک
        زیرآیتم (مثلا «فرم رزرو») واقعا وارد صفحه‌ی تنظیمات می‌شویم. */}
     <button onClick={() => setSettingsOpen(o => !o)}
      aria-expanded={settingsOpen}
      className={`relative w-full text-right px-3 py-2.5 rounded-lg text-sm flex items-center justify-between gap-2 transition-colors ${
       mainTab === 'settings' ? 'bg-gray-200 text-ink font-semibold' : 'text-soot hover:bg-gray-100'}`}>
      {mainTab === 'settings' && <span className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-ink" aria-hidden="true" />}
      <span className="flex items-center gap-2"><Glyph icon="⚙️" /> تنظیمات</span>
      <svg viewBox="0 0 24 24" className={`w-3.5 h-3.5 shrink-0 transition-transform ${settingsOpen ? '-rotate-90' : ''}`}
       fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
       <path d="M15 6l-6 6 6 6" />
      </svg>
     </button>
     {settingsOpen && (
      <div className="mr-2 pr-2 border-r-2 border-sand space-y-2 my-1">
       {settingsGroups.map(group => (
        <div key={group.title}>
         <div className="px-3 pt-1.5 pb-0.5 text-[11px] font-bold text-ink uppercase tracking-wide">{group.title}</div>
         <div className="space-y-0.5">
          {group.items.map(item => (
           <button key={item.key} onClick={() => { navigateSettingsSub(item.key); onNavigate?.() }}
            className={`w-full text-right px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
             settingsSubTab === item.key ? 'bg-sand text-ink font-semibold' : 'text-soot hover:bg-gray-100'}`}>
            <Glyph icon={item.icon} /> {item.label}
           </button>
          ))}
         </div>
        </div>
       ))}
      </div>
     )}
    </div>

    <div className="pt-3 mt-2 border-t border-sand">
     <div className="px-3 pb-1 text-[10px] font-bold text-soot/70 tracking-wide">مجموعه</div>
     <div className="space-y-0.5">
      {bottomNavItems.map(item => <NavItemButton key={item.key} item={item} onNavigate={onNavigate} />)}
     </div>
    </div>
   </nav>
  )
 }

 // هدر سایدبار — نام دکتر/کلینیک. دکمه‌ی «سایت من» از این‌جا به نوار ثابت بالا
 // منتقل شد: آن‌جا در هر تب و هم در دسکتاپ هم موبایل همیشه دیده می‌شود، در حالی
 // که این‌جا روی موبایل فقط داخل دراور بسته پیدا می‌شد.
 function SidebarHeader() {
  const displayName = profile.name || me?.resourceName || 'دکتر'
  return (
   <div className="p-4 border-b border-sand">
    <div className="flex items-center gap-2.5 min-w-0">
     <div className="w-9 h-9 rounded-full bg-sand overflow-hidden flex items-center justify-center shrink-0 font-display font-bold text-sm text-ink">
      {profile.avatar_url
       // eslint-disable-next-line @next/next/no-img-element
       ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
       : (displayName.charAt(0) || '؟')}
     </div>
     <div className="min-w-0">
      <div className="text-[10px] text-soot">پنل مدیریت{me && !me.isOwner ? ' · درمانگر' : ''}</div>
      <div className="text-sm font-display font-semibold text-ink truncate mt-0.5">{displayName}</div>
     </div>
    </div>
   </div>
  )
 }

 // عنوان تب جاری — هم در نوار بالا استفاده می‌شود
 const currentTabLabel = mainTab === 'settings'
  ? (settingsGroups.flatMap(g => g.items).find(i => i.key === settingsSubTab)?.label || 'تنظیمات')
  : ([...navItems, ...bottomNavItems].find(i => i.key === mainTab)?.label || 'پنل مدیریت')

 // نوار ثابت بالا — یکی برای دسکتاپ و موبایل. روی دسکتاپ داخل کانتینری است که
 // sm:pr-56 دارد، پس زیر سایدبار نمی‌رود. sticky (نه fixed) تا عرضش را از همان
 // کانتینر بگیرد و نیازی به محاسبه‌ی دستی جای سایدبار نباشد.
 function TopBar() {
  return (
   <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-sand px-3 sm:px-4 py-2.5 flex items-center gap-2">
    <button onClick={() => setSidebarOpen(true)} aria-label="بازکردن منو"
     className="sm:hidden text-soot w-8 h-8 flex items-center justify-center shrink-0">
     <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
    <div className="flex-1 min-w-0 text-base font-display font-bold text-ink truncate">{currentTabLabel}</div>
    <a href={`/${slug}`} target="_blank" rel="noopener noreferrer" title="مشاهده‌ی صفحه‌ی عمومی شما"
     className="shrink-0 text-[11px] text-soot hover:text-ink border border-sand rounded-lg px-2.5 py-1.5 flex items-center gap-1 transition-colors">
     سایت من
     <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14 21 3" />
     </svg>
    </a>
   </div>
  )
 }

 // سوییچ حالت تیره — دقیقا جای دکمه‌ی قدیمی «⚙️ تنظیمات» که به صفحه‌ی دوم
 // می‌رفت؛ حالا که تنظیمات خودش یک تب معمولی در همین سایدبار است، این‌جا فقط
 // سوییچ دارک‌مود ماند.
 function DarkModeSwitch() {
  return (
   <div className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-soot">
    <span className="flex items-center gap-2">
     <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /></svg>
     حالت تیره
    </span>
    <button type="button" role="switch" aria-checked={darkMode} onClick={() => toggleDark(!darkMode)} dir="ltr"
     className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${darkMode ? 'bg-ink' : 'bg-gray-300'}`}>
     <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${darkMode ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
   </div>
  )
 }

 return (
  <div className={`min-h-screen bg-canvas sm:pr-56 ${darkMode ? 'pb-admin-dark' : ''}`} dir="rtl">
   <DialogHost />

   {/* ── مودال برش عکس پروفایل — درگ برای جابه‌جایی، اسلایدر برای زوم ── */}
   {cropSrc && cropDims && (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !avatarUploading && closeCropper()}>
     <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
      <h2 className="font-display font-semibold text-ink mb-1">تنظیم عکس پروفایل</h2>
      <p className="text-xs text-soot mb-4">عکس را بکشید تا جابه‌جا شود؛ با نوار زیر بزرگ‌نمایی کنید. ناحیه‌ی داخل دایره همان چیزی است که مراجع می‌بیند.</p>

      <div className="mx-auto relative overflow-hidden rounded-xl bg-gray-200 touch-none select-none cursor-move"
       style={{ width: CROP_VIEW, height: CROP_VIEW }}
       onPointerDown={e => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId)
        cropDragRef.current = { px: e.clientX, py: e.clientY, ox: cropOff.x, oy: cropOff.y }
       }}
       onPointerMove={e => {
        const d = cropDragRef.current
        if (!d) return
        setCropOff(clampCropOff(d.ox + (e.clientX - d.px), d.oy + (e.clientY - d.py)))
       }}
       onPointerUp={() => { cropDragRef.current = null }}
       onPointerCancel={() => { cropDragRef.current = null }}>
       {/* eslint-disable-next-line @next/next/no-img-element */}
       <img src={cropSrc} alt="" draggable={false} className="absolute max-w-none pointer-events-none"
        style={{
         width: cropDims.w * cropScale(),
         height: cropDims.h * cropScale(),
         left: CROP_VIEW / 2 - (cropDims.w * cropScale()) / 2 + cropOff.x,
         top: CROP_VIEW / 2 - (cropDims.h * cropScale()) / 2 + cropOff.y,
        }} />
       {/* ماسک دایره‌ای — بیرون دایره تیره می‌شود تا نتیجه‌ی نهایی معلوم باشد */}
       <div className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: `inset 0 0 0 ${CROP_VIEW}px rgba(0,0,0,0.45)`, borderRadius: '50%' }} />
      </div>

      <div className="flex items-center gap-3 mt-4" dir="ltr">
       <span className="text-xs text-soot">-</span>
       <input type="range" min={1} max={3} step={0.01} value={cropZoom}
        onChange={e => {
         const z = Number(e.target.value)
         setCropZoom(z)
         setCropOff(o => clampCropOff(o.x, o.y, z))
        }}
        className="flex-1 accent-ink" />
       <span className="text-xs text-soot">+</span>
      </div>

      <div className="flex gap-2 mt-4">
       <button onClick={closeCropper} disabled={avatarUploading}
        className="flex-1 py-2.5 border border-sand rounded-xl text-sm text-soot disabled:opacity-50">انصراف</button>
       <button onClick={confirmCrop} disabled={avatarUploading}
        className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-50">
        {avatarUploading ? 'در حال آپلود...' : 'ثبت عکس'}
       </button>
      </div>
     </div>
    </div>
   )}

   {/* ── سایدبار (دسکتاپ) ───────────────────────────────────────────── */}
   <aside className="hidden sm:flex sm:flex-col fixed top-0 right-0 h-full w-56 bg-white border-l border-sand z-20">
    <SidebarHeader />
    <NavList />
    <div className="p-2 border-t border-sand space-y-1">
     <DarkModeSwitch />
    </div>
   </aside>

   {/* ── نوار ثابت بالا — دسکتاپ و موبایل ─────────────────────────── */}
   <TopBar />

   {/* ── دراور کشویی (موبایل) ──────────────────────────────────────── */}
   {sidebarOpen && (
    <>
     <div className="fixed inset-0 bg-black/30 z-40 sm:hidden" onClick={() => setSidebarOpen(false)} />
     <aside className="fixed top-0 right-0 h-full w-64 bg-white z-50 sm:hidden flex flex-col">
      <div className="flex items-center justify-between border-b border-sand">
       <div className="flex-1"><SidebarHeader /></div>
       <button onClick={() => setSidebarOpen(false)} className="text-soot text-xl w-8 h-8 shrink-0 ml-2">✕</button>
      </div>
      <NavList onNavigate={() => setSidebarOpen(false)} />
      <div className="p-2 border-t border-sand space-y-1">
       <DarkModeSwitch />
      </div>
     </aside>
    </>
   )}

   <div className="max-w-5xl mx-auto p-3 sm:p-4">

    {/* ════════════════════════════════════════════════════════════════
      TAB: DASHBOARD (نمای کلی)
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'dashboard' && (() => {
      const todayJ = getCurrentJalali()
      const todayStr = `${todayJ.year}/${todayJ.month + 1}/${todayJ.day}`
      const todayAppts = apptsForDate(todayStr).sort((a, b) => a.time.localeCompare(b.time))
      const thisMonthKey = `${todayJ.year}/${String(todayJ.month + 1).padStart(2, '0')}`
      const monthAmount = dashboardFinance?.monthly.find(m => m.month === thisMonthKey)?.amount || 0
      const money = (n: number) => n.toLocaleString('en-US')
      const activeCases = bookings.length
      const needsSheba = !cardToCardAllowed || profile.payment_methods.online
      const missingSheba = needsSheba && !profile.settlement_sheba

      return (
       <div className="space-y-4">
        {/* خوش‌آمد + تاریخ امروز */}
        <div className="flex items-center justify-between flex-wrap gap-2">
         <div>
          <h1 className="text-lg font-display font-bold text-ink">
           سلام{profile.name ? `، ${profile.name}` : ''}
          </h1>
          <p className="text-xs text-soot mt-0.5">
           {toFarsiNum(todayJ.day)} {PERSIAN_MONTHS[todayJ.month]}، {toFarsiNum(todayJ.year)}
          </p>
         </div>
        </div>

        {/* چک‌لیست راه‌اندازی اولیه — فقط تا وقتی همه‌چیز کامل نشده نشان داده
           می‌شود؛ بعدش خودش برای همیشه محو می‌شود. */}
        {(() => {
         const checklist = [
          {
           key: 'profile', label: 'تکمیل پروفایل عمومی (نام و عنوان)',
           done: !!(profile.name?.trim() && profile.title?.trim()),
           go: () => navigateSettingsSub('profile'),
          },
          {
           key: 'schedule', label: 'تعریف حداقل یک روز کاری',
           done: hasWorkingDays === true,
           go: () => navigateTab('schedule'),
          },
          {
           key: 'payment', label: 'تنظیم روش دریافت پرداخت',
           done: (profile.payment_methods.card_to_card && profile.cards.length > 0) || (profile.payment_methods.online && !!profile.settlement_sheba),
           go: () => navigateSettingsSub('payments'),
          },
          ...(profile.session_modes !== 'offline' ? [{
           key: 'meet', label: 'افزودن روش جلسه‌ی آنلاین',
           done: usableMeetChannels(profile.meet_channels).length > 0,
           go: () => navigateSettingsSub('profile'),
          }] : []),
          ...(profile.session_modes !== 'online' ? [{
           key: 'location', label: 'ثبت مکان حضوری',
           done: settings.office_locations.length > 0,
           go: () => navigateSettingsSub('profile'),
          }] : []),
         ]
         const doneCount = checklist.filter(c => c.done).length
         if (doneCount === checklist.length) return null
         const nextItem = checklist.find(c => !c.done)
         return (
          <div className="bg-white rounded-2xl border border-sand overflow-hidden">
           {/* سربرگ فشرده — همیشه دیده می‌شود؛ خود فهرست جمع‌شونده است تا
              داشبورد را اشغال نکند (قبلا همیشه کامل باز و بزرگ بود). */}
           <button onClick={() => setSetupOpen(o => !o)}
            className="w-full px-5 py-3.5 flex items-center gap-3 text-right hover:bg-gray-50 transition-colors">
            <div className="flex-1 min-w-0">
             <div className="flex items-center gap-2">
              <h2 className="text-sm font-display font-semibold text-ink">راه‌اندازی اولیه</h2>
              <span className="text-[11px] text-soot tnum">{toFarsiNum(doneCount)} از {toFarsiNum(checklist.length)}</span>
             </div>
             {!setupOpen && nextItem && (
              <p className="text-xs text-soot mt-1 truncate">مرحله‌ی بعد: {nextItem.label}</p>
             )}
             <div className="bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
             </div>
            </div>
            <svg viewBox="0 0 24 24" className={`w-4 h-4 shrink-0 text-soot transition-transform ${setupOpen ? 'rotate-180' : ''}`}
             fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
             <path d="m6 9 6 6 6-6" />
            </svg>
           </button>

           {setupOpen && (
            <div className="px-5 pb-5 pt-1">
             <p className="text-xs text-soot mb-3">با تکمیل این موارد، صفحه‌ی شما به‌طور کامل برای مراجعان آماده می‌شود.</p>
             <div className="space-y-1">
              {checklist.map(item => (
               <button key={item.key} onClick={item.done ? undefined : item.go} disabled={item.done}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-right transition-colors ${item.done ? 'cursor-default' : 'hover:bg-gray-50'}`}>
                <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${item.done ? 'bg-emerald-500' : 'border-2 border-sand'}`}>
                 {item.done && (
                  <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                   <path d="M5 13l4 4L19 7" />
                  </svg>
                 )}
                </span>
                <span className={`flex-1 text-sm ${item.done ? 'text-soot line-through' : 'text-ink'}`}>{item.label}</span>
                {!item.done && <span className="text-[11px] text-soot shrink-0">تنظیم ←</span>}
               </button>
              ))}
             </div>
            </div>
           )}
          </div>
         )
        })()}

        {/* هشدارها — فقط وقتی واقعا اقدامی لازم است */}
        {pendingActionCount > 0 && (
         <button onClick={() => navigateTab('bookings')}
          className="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-right hover:bg-amber-100 transition-colors">
          <span className="text-sm text-amber-800">
           <strong className="tnum">{toFarsiNum(pendingActionCount)}</strong> مورد منتظر تأیید پرداخت شماست
          </span>
          <span className="text-amber-700 text-xs">بررسی ←</span>
         </button>
        )}
        {missingSheba && (
         <button onClick={() => navigateSettingsSub('payments')}
          className="w-full flex items-center justify-between bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 text-right hover:bg-sky-100 transition-colors">
          <span className="text-sm text-sky-800">برای دریافت خودکار سهمتان از پرداخت آنلاین، شماره‌شبا ثبت نکرده‌اید</span>
          <span className="text-sky-700 text-xs">تنظیم ←</span>
         </button>
        )}

        {/* کارت‌های KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
         <button onClick={() => navigateTab('patients')} className="bg-white rounded-2xl border border-sand p-4 text-right hover:border-ink transition-colors group">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors"><Glyph icon="📁" className="w-[18px] h-[18px] text-ink" /></div>
          <div className="text-xl font-bold text-ink mt-2.5 tnum">{toFarsiNum(activeCases)}</div>
          <div className="text-[11px] text-soot">پرونده‌ی فعال</div>
         </button>
         <div className="bg-white rounded-2xl border border-sand p-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"><Glyph icon="🗓" className="w-[18px] h-[18px] text-ink" /></div>
          <div className="text-xl font-bold text-ink mt-2.5 tnum">{toFarsiNum(todayAppts.length)}</div>
          <div className="text-[11px] text-soot">نوبت امروز</div>
         </div>
         <button onClick={() => navigateTab('bookings')} className="bg-white rounded-2xl border border-sand p-4 text-right hover:border-ink transition-colors group">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${pendingActionCount > 0 ? 'bg-amber-500/15' : 'bg-gray-100 group-hover:bg-gray-200'}`}><Glyph icon="💳" className={`w-[18px] h-[18px] ${pendingActionCount > 0 ? 'text-amber-700' : 'text-ink'}`} /></div>
          <div className={`text-xl font-bold mt-2.5 tnum ${pendingActionCount > 0 ? 'text-amber-700' : 'text-ink'}`}>{toFarsiNum(pendingActionCount)}</div>
          <div className="text-[11px] text-soot">منتظر تأیید</div>
         </button>
         <button onClick={() => navigateTab('finance')} className="bg-white rounded-2xl border border-sand p-4 text-right hover:border-ink transition-colors group">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors"><Glyph icon="📊" className="w-[18px] h-[18px] text-ink" /></div>
          <div className="text-xl font-bold text-ink mt-2.5 tnum">{money(monthAmount)}</div>
          <div className="text-[11px] text-soot">درآمد این ماه (تومان)</div>
         </button>
        </div>

        {/* برنامه‌ی امروز */}
        <div className="bg-white rounded-2xl border border-sand p-5">
         <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-display font-semibold text-ink">برنامه‌ی امروز</h2>
          <button onClick={() => {
            const t = getCurrentJalali()
            // درخواست پرش را ثبت کن؛ ScheduleTab هنگام mount اجرایش می‌کند
            setSchedJump({ day: t.day, month: t.month, year: t.year })
            navigateTab('schedule')
           }} className="text-xs text-soot hover:text-ink">مشاهده‌ی همه ←</button>
         </div>
         {todayAppts.length === 0 ? (
          <div className="text-center py-6">
           <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-2"><Glyph icon="📅" className="w-5 h-5 text-soot" /></div>
           <p className="text-xs text-soot">برای امروز نوبتی ثبت نشده است.</p>
          </div>
         ) : (
          <div className="space-y-2">
           {todayAppts.map(a => (
            <div key={a.id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${a.color}`}>
             <span className="text-sm font-bold tnum shrink-0">{toFarsiNum(a.time)}</span>
             <span className="text-sm text-ink flex-1">{a.name}</span>
             <span className="text-[11px] text-soot shrink-0">{a.type}{a.modeText ? ` · ${a.modeText}` : ''}</span>
            </div>
           ))}
          </div>
         )}
        </div>
       </div>
      )
    })()}

    {/* ════════════════════════════════════════════════════════════════
      TAB: PATIENTS
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'patients' && (
     <PatientsTab api={api} patients={patients} fetchAll={fetchAll} bookings={bookings}
      loading={loading} isOwner={!!me?.isOwner} profile={profile} staffList={staffList}
      officeLocations={settings.office_locations}
      viewingResourceId={viewingResourceId} setViewingResourceId={setViewingResourceId} mod={mod}
      todayAppointments={apptsForDate(`${getCurrentJalali().year}/${getCurrentJalali().month + 1}/${getCurrentJalali().day}`)}
      onAppointmentsChanged={() => loadAllSessions()} />
    )}

    {/* ════════════════════════════════════════════════════════════════
      TAB: BOOKINGS
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'bookings' && (
     <BookingsTab loading={loading}
      pendingStages={pendingStages} pendingPkgs={pendingPkgs} pendingSess={pendingSess} pendingRefunds={pendingRefunds}
      pendingApptRequests={pendingApptRequests}
      approveApptRequest={approveApptRequest} rejectApptRequest={rejectApptRequest}
      clientNameOf={(cn) => bookings.find(b => b.case_number === cn)?.client_name || cn}
      sessionTypeOf={(cn) => bookings.find(b => b.case_number === cn)?.session_type}
      confirmStagePayment={confirmStagePayment} rejectStagePayment={rejectStagePayment}
      confirmPackagePayment={confirmPackagePayment} rejectPackagePayment={rejectPackagePayment}
      confirmSessionPayment={confirmSessionPayment} rejectSessionPayment={rejectSessionPayment}
      markRefunded={markRefunded} />
    )}

    {/* ════════════════════════════════════════════════════════════════
      TAB: SCHEDULE
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'schedule' && (
     <ScheduleTab api={api}
      resourceQS={scheduleResourceQS()}
      resourceId={(me?.isOwner && viewingResourceId) ? viewingResourceId : null}
      quickTimes={profile.quick_times} quickTimesSaving={quickTimesSaving} persistQuickTimes={persistQuickTimes}
      sessionModes={profile.session_modes} officeLocations={settings.office_locations}
      apptsForDate={apptsForDate} cancelAppointment={cancelAppointment} cancelDay={cancelDay}
      announceDelay={announceDelay} onUnauthorized={() => setNeedsLogin(true)}
      onSaved={() => { loadAllSessions(); refreshBookings() }}
      jump={schedJump} onJumpConsumed={() => setSchedJump(null)} />
    )}

    {/* ════════════════════════════════════════════════════════════════
      TAB: FINANCE (گزارشات مالی)
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'finance' && (
     <FinanceTab api={api} onUnauthorized={() => setNeedsLogin(true)} />
    )}

    {/* ════════════════════════════════════════════════════════════════
      TAB: GROWTH (رشد و مراجعان — لیست انتظار، نظرات، آمار، کمپین)
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'growth' && (
     <GrowthTab api={api} growthTabs={growthTabs} modules={me?.modules}
      waitlist={waitlist} reloadWaitlist={loadWaitlist} />
    )}

    {/* ════════════════════════════════════════════════════════════════
      TAB: CAPABILITIES (قابلیت‌ها — فعلا فقط بخش پیامک)
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'capabilities' && <CapabilitiesTab slug={slug} />}

    {/* ════════════════════════════════════════════════════════════════
      TAB: SETTINGS
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'settings' && (
     <div className="space-y-4 pb-24">
      <PageHeader title="تنظیمات" desc="صفحه‌ی عمومی، روش‌های پرداخت، قیمت‌گذاری و فرم رزرو خود را از این‌جا مدیریت کنید." />
      {!settingsLoaded || !profileLoaded ? (
       <SkeletonRows count={3} height="h-28" />
      ) : (
      <>
       {/* سوییچر دکتر — فقط وقتی owner است و بیش از یک نفر پرسنل دارد */}
       {!!settingsSubTab && ['profile', 'payments', 'pricing', 'terms', 'form'].includes(settingsSubTab) && me?.isOwner && staffList.filter(r => r.is_active).length > 1 && (
        <section className="bg-white rounded-2xl border border-sand p-5">
         <h2 className="text-sm font-display font-semibold text-ink mb-1">پروفایل کدام دکتر؟</h2>
         <p className="text-xs text-soot mb-3">مجموعه‌ی شما چند نفر پرسنل دارد؛ اول انتخاب کنید پروفایل و برنامه‌ی کاری کدام‌شان را ویرایش می‌کنید.</p>
         <select value={viewingResourceId || staffList.find(r => r.is_active)?.id || ''} onChange={e => { setViewingResourceId(e.target.value); setProfileLoaded(false); setIntakeLoaded(false) }}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink">
          {staffList.filter(r => r.is_active).map(r => (
           <option key={r.id} value={r.id}>{r.name}{r.title ? ` — ${r.title}` : ''}</option>
          ))}
         </select>
        </section>
       )}

       {/* پروفایل عمومی — حالا per-resource؛ دقیقا شبیه‌سازی سر صفحه‌ی مصاحبه، مستقیم روی خودش ویرایش می‌شود */}
       {settingsSubTab === 'profile' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">پروفایل عمومی</h2>
        <p className="text-xs text-soot mb-4">دقیقا همین‌طور بالای صفحه‌ی مصاحبه به مراجع نمایش داده می‌شود — روی هرکدام بزنید تا ویرایش کنید.</p>

        <div className="bg-gray-50 rounded-2xl p-6 text-center">
         <div className="relative w-24 h-24 rounded-full bg-sand border border-sand flex items-center justify-center mx-auto text-3xl overflow-hidden shrink-0 group cursor-pointer"
          onClick={() => !avatarUploading && avatarInputRef.current?.click()}>
          <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
           onChange={e => { handleAvatarFile(e.target.files?.[0]); e.target.value = '' }} />
          {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : ''}
          <div className={`absolute inset-0 bg-black/40 flex items-center justify-center text-white text-[10px] transition-opacity ${avatarUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
           {avatarUploading ? 'در حال آپلود...' : 'تغییر عکس'}
          </div>
         </div>
         <div className="flex items-center justify-center gap-4 mt-2 mb-3">
          <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}
           className="text-xs text-soot hover:text-ink underline underline-offset-4 disabled:opacity-50">
           {profile.avatar_url ? 'تغییر عکس' : 'افزودن عکس'}
          </button>
          {profile.avatar_url && (
           <button type="button" onClick={() => patchProfile({ avatar_url: '' })} disabled={avatarUploading}
            className="text-xs text-red-600 hover:text-red-700 underline underline-offset-4 disabled:opacity-50">
            حذف عکس
           </button>
          )}
         </div>
         <input value={profile.name} onChange={e => patchProfile({ name: e.target.value })} placeholder="نام"
          className="text-lg font-medium text-ink text-center bg-transparent border-b border-dashed border-gray-300 hover:border-gray-400 focus:outline-none focus:border-ink w-full max-w-[260px] mx-auto block py-0.5" />
         <input value={profile.title} onChange={e => patchProfile({ title: e.target.value })} placeholder="عنوان / تخصص"
          className="text-sm text-soot text-center bg-transparent border-b border-dashed border-transparent hover:border-gray-300 focus:outline-none focus:border-ink w-full max-w-[260px] mx-auto block mt-1 py-0.5" />
         <div className="flex gap-2 justify-center mt-3 flex-wrap">
          {profile.badges.map((b, i) => (
           <span key={i} className="text-xs pl-1.5 pr-3 py-1 bg-white border border-sand rounded-lg text-soot flex items-center gap-1">
            <input value={b} size={Math.max(b.length, 3)}
             onChange={e => { const next = [...profile.badges]; next[i] = e.target.value; patchProfile({ badges: next }) }}
             className="bg-transparent focus:outline-none text-soot" />
            <button onClick={() => patchProfile({ badges: profile.badges.filter((_, j) => j !== i) })}
             className="text-gray-300 hover:text-soot leading-none">×</button>
           </span>
          ))}
          <button onClick={() => patchProfile({ badges: [...profile.badges, 'نشان جدید'] })}
           className="text-xs px-3 py-1 border border-dashed border-gray-300 rounded-lg text-soot hover:border-gray-400 hover:text-soot">
           + نشان
          </button>
         </div>
        </div>
       </section>
       )}

       {/* نوع جلسات — per-resource (هر دکتر مد خودش را دارد) */}
       {settingsSubTab === 'profile' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">نوع جلسات قابل ارائه</h2>
        <p className="text-xs text-soot mb-4">تعیین می‌کند مراجع هنگام رزرو چه گزینه‌هایی ببیند.</p>
        <div className="grid grid-cols-3 gap-2">
         {([
          ['both', '', 'هردو'],
          ['online', '', 'فقط آنلاین'],
          ['offline', '', 'فقط حضوری'],
         ] as [SessionMode, string, string][]).map(([val, icon, label]) => (
          <button key={val} onClick={() => patchProfile({ session_modes: val })}
           className={`p-3 rounded-xl border text-center transition-all ${
            profile.session_modes === val
             ? 'border-ink border-2 bg-sand'
             : 'border-sand hover:border-gray-300'}`}>
           <div className="mb-1 flex justify-center"><Glyph icon={icon} className="w-6 h-6" /></div>
           <div className="text-xs font-medium text-ink">{label}</div>
          </button>
         ))}
        </div>
       </section>
       )}

       {/* جلسه‌ی آنلاین — متخصص می‌تواند «چند روش» را هم‌زمان فعال کند (مثلا هم
           واتساپ هم تماس تلفنی)؛ مراجع در زمان جلسه هرکدام را خواست می‌زند.
           هیچ‌کدام نیاز به OAuth ندارند: فقط لینک ثابت یا شماره. */}
       {/* روند جلسات — عنوان اولین جلسه + عنوان‌های آماده. این همان چیزی است که
           سیستم را از فلوی ثابت «مصاحبه/ارزیابی» آزاد می‌کند: هر متخصص روند و
           نام‌گذاری خودش را تعریف می‌کند. */}
       {settingsSubTab === 'profile' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">روند جلسات</h2>
        <p className="text-xs text-soot mb-4">
         سیستم هیچ روند ثابتی به شما تحمیل نمی‌کند. نام اولین جلسه‌ی مراجع جدید و عنوان‌های آماده‌ی جلسات بعدی را خودتان تعیین کنید.
        </p>

        <label className="text-xs text-soot mb-1 block">عنوان اولین جلسه‌ی مراجع جدید</label>
        <p className="text-[11px] text-soot mb-2">وقتی مراجع تازه‌ای فرم را پر می‌کند، اولین جلسه‌اش این عنوان را می‌گیرد (مثلا «مصاحبه»، «ویزیت اول»، «جلسه‌ی آشنایی»).</p>
        <input value={profile.first_stage_label} maxLength={40}
         onChange={e => patchProfile({ first_stage_label: e.target.value })}
         placeholder="مصاحبه"
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg mb-4 focus:outline-none focus:border-ink" />

        <label className="text-xs text-soot mb-1 block">عنوان‌های آماده‌ی جلسات (اختیاری)</label>
        <p className="text-[11px] text-soot mb-2">این‌ها موقع «افزودن جلسه‌ی جدید» برای یک مراجع به‌صورت دکمه‌ی سریع نشان داده می‌شوند تا هر بار تایپ نکنید. هر عنوان یک خط.</p>
        <div className="space-y-2">
         {profile.stage_presets.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
           <input value={p} maxLength={40}
            onChange={e => {
             const next = [...profile.stage_presets]; next[i] = e.target.value
             patchProfile({ stage_presets: next })
            }}
            placeholder="مثلا: جلسه‌ی پیگیری"
            className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
           <button onClick={() => patchProfile({ stage_presets: profile.stage_presets.filter((_, j) => j !== i) })}
            className="text-xs px-2.5 py-2 border border-red-500/30 text-red-600 rounded-lg shrink-0 hover:bg-red-500/5">حذف</button>
          </div>
         ))}
        </div>
        {profile.stage_presets.length < 20 && (
         <button onClick={() => patchProfile({ stage_presets: [...profile.stage_presets, ''] })}
          className="mt-2 text-xs px-3 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand">+ افزودن عنوان</button>
        )}
       </section>
       )}

       {settingsSubTab === 'profile' && profile.session_modes !== 'offline' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">جلسه‌ی آنلاین</h2>
        <p className="text-xs text-soot mb-4">
         هر روشی را که می‌خواهید اضافه کنید؛ همه‌ی روش‌های فعال به مراجع نشان داده می‌شوند و او یکی را انتخاب می‌کند.
        </p>

        {/* کانال‌های فعال */}
        <div className="space-y-2.5 mb-3">
         {profile.meet_channels.map((ch, i) => {
          const meta = MEET_META[ch.method]
          const invalid = !!ch.value.trim() && !meetHref(ch.method, ch.value)
          return (
           <div key={ch.method} className="border border-sand rounded-xl p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
             <span className="text-sm font-medium text-ink">{meta.label}</span>
             <button type="button" onClick={() => patchProfile({ meet_channels: profile.meet_channels.filter((_, j) => j !== i) })}
              className="text-xs text-red-600 hover:text-red-700">حذف</button>
            </div>
            <input value={ch.value} dir="ltr" placeholder={meta.placeholder}
             inputMode={meta.kind === 'phone' ? 'tel' : 'url'}
             onChange={e => {
              const next = [...profile.meet_channels]
              next[i] = { ...ch, value: e.target.value }
              patchProfile({ meet_channels: next })
             }}
             className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
            <p className={`text-[11px] mt-1.5 ${invalid ? 'text-amber-700' : 'text-soot'}`}>
             {invalid
              ? (meta.kind === 'phone' ? 'شماره‌ی موبایل معتبر وارد کنید (مثال: 09123456789)' : 'نشانی کامل با https:// وارد کنید')
              : meta.hint}
            </p>
           </div>
          )
         })}
        </div>

        {/* افزودن روش تازه — فقط روش‌هایی که هنوز اضافه نشده‌اند */}
        {MEET_METHODS.filter(m => !profile.meet_channels.some(ch => ch.method === m)).length > 0 && (
         <div>
          <p className="text-xs text-soot mb-2">افزودن روش:</p>
          <div className="flex flex-wrap gap-2">
           {MEET_METHODS.filter(m => !profile.meet_channels.some(ch => ch.method === m)).map(m => (
            <button key={m} type="button"
             onClick={() => patchProfile({ meet_channels: [...profile.meet_channels, { method: m, value: '' }] })}
             className="px-3 py-2 rounded-xl border border-sand text-xs text-soot hover:border-ink hover:text-ink transition-colors">
             + {MEET_META[m].label}
            </button>
           ))}
          </div>
         </div>
        )}

        {profile.meet_channels.length === 0 && (
         <p className="text-[11px] text-soot mt-3">هنوز هیچ روشی اضافه نشده — تا زمانی که روشی اضافه نکنید، مراجع راهی برای پیوستن به جلسه‌ی آنلاین نخواهد داشت.</p>
        )}
       </section>
       )}

       {/* روش‌های پرداخت — per-resource؛ کارت‌به‌کارت فقط وقتی سوپرادمین برای
          این tenant فعالش کرده باشد اصلا دیده می‌شود؛ وگرنه فقط آنلاین. */}
       {settingsSubTab === 'payments' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">روش‌های پرداخت</h2>
        {!cardToCardAllowed ? (
         <>
          <p className="text-xs text-soot mb-4">
           پرداخت مراجعان به‌صورت آنلاین (درگاه پرداخت نوبت‌لینک) انجام می‌شود — تایید خودکار، بدون نیاز به بررسی دستی شما.
          </p>
          <div className="flex items-center justify-between p-3 rounded-xl border border-sand">
           <div>
            <span className="text-sm text-ink block">پرداخت آنلاین (درگاه نوبت‌لینک)</span>
            <span className="text-[11px] text-soot">فعال — مراجع بلافاصله بعد از پرداخت می‌تواند ادامه دهد</span>
           </div>
           <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">فعال</span>
          </div>
         </>
        ) : (
         <>
          <p className="text-xs text-soot mb-4">
           آنلاین یعنی مراجع بلافاصله بعد پرداخت می‌تواند ادامه دهد (بدون نیاز به تایید شما).
           کارت‌به‌کارت مثل قبل: مراجع فیشش را می‌فرستد و شما تایید می‌کنید.
          </p>
          <div className="space-y-2">
           <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer">
            <div>
             <span className="text-sm text-ink block">کارت‌به‌کارت</span>
             <span className="text-[11px] text-soot">نیاز به تایید دستی شما دارد</span>
            </div>
            <input type="checkbox" checked={profile.payment_methods.card_to_card}
             onChange={e => patchProfile({ payment_methods: { ...profile.payment_methods, card_to_card: e.target.checked } })}
             className="w-5 h-5 accent-ink" />
           </label>
           <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer">
            <div>
             <span className="text-sm text-ink block">پرداخت آنلاین (درگاه نوبت‌لینک)</span>
             <span className="text-[11px] text-soot">تایید خودکار — مراجع بلافاصله می‌تواند نوبت بگیرد</span>
            </div>
            <input type="checkbox" checked={profile.payment_methods.online}
             onChange={e => patchProfile({ payment_methods: { ...profile.payment_methods, online: e.target.checked } })}
             className="w-5 h-5 accent-ink" />
           </label>
           {!profile.payment_methods.card_to_card && !profile.payment_methods.online && (
            <p className="text-[11px] text-ink px-1">حداقل یک روش باید فعال بماند.</p>
           )}
          </div>
         </>
        )}
       </section>
       )}

       {/* مکان‌های حضوری — سطح tenant، مشترک همه‌ی دکترها؛ فقط owner ویرایش می‌کند.
           قبلا تب مستقل خودش بود؛ چون فقط یک بخش کوچک از تنظیمات پروفایل است،
           به همین تب منتقل شد. */}
       {settingsSubTab === 'profile' && me?.isOwner !== false && (
        <section className="bg-white rounded-2xl border border-sand p-5">
         <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-display font-semibold text-ink">مکان‌های جلسه‌ی حضوری</h2>
         </div>
         <p className="text-xs text-soot mb-4">می‌توانید چند مطب/آدرس تعریف کنید؛ بین همه‌ی دکترهای این مجموعه مشترک است.</p>
         <div className="space-y-3">
          {settings.office_locations.map((loc, i) => (
           <div key={loc.id} className="border border-sand rounded-xl p-3 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
             <input value={loc.title}
              onChange={e => {
               const next = [...settings.office_locations]; next[i] = { ...loc, title: e.target.value }
               patchSettings({ office_locations: next })
              }}
              placeholder="نام مطب (مثلا مطب ولنجک)"
              className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
             <button onClick={() => patchSettings({ office_locations: settings.office_locations.filter((_, j) => j !== i) })}
              className="text-xs px-2.5 py-2 border border-red-500/30 text-red-600 rounded-lg shrink-0 hover:bg-red-500/5">حذف</button>
            </div>
            <input value={loc.address}
             onChange={e => {
              const next = [...settings.office_locations]; next[i] = { ...loc, address: e.target.value }
              patchSettings({ office_locations: next })
             }}
             placeholder="آدرس کامل"
             className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
           </div>
          ))}
         </div>
         <button onClick={() => patchSettings({ office_locations: [...settings.office_locations, { id: genId('loc'), title: '', address: '' }] })}
          className="mt-3 text-xs px-3 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand">+ افزودن مکان</button>
        </section>
       )}

       {/* ظاهر و برند — تم صفحه‌ی عمومی و پنل مراجع؛ سطح tenant، فقط owner */}
       {settingsSubTab === 'appearance' && me?.isOwner !== false && (
        <section className="bg-white rounded-2xl border border-sand p-5">
         <h2 className="text-sm font-display font-semibold text-ink mb-1">ظاهر و برند</h2>
         <p className="text-xs text-soot mb-4">
          رنگ اصلی صفحه‌ی عمومی و پنل مراجع خودتان را انتخاب کنید — یا از رنگ‌های آماده، یا با آپلود لوگو تا سیستم خودش رنگ برند شما را استخراج کند. برای خوانایی، رنگ نهایی همیشه کنتراست کافی روی زمینه‌ی سفید خواهد داشت.
         </p>
         {!themeLoaded ? (
          <SkeletonRows count={1} height="h-56" />
         ) : (
          <>
           <ThemeModePicker slug={slug} themeMode={themeProfile?.theme_mode || 'preset'} themeColor={themeProfile?.theme_color || DEFAULT_SAFE_THEME}
            logoUrl={themeProfile?.logo_url || null} onChange={patchTheme} uiAlert={uiAlert} />
           <button onClick={saveTheme} disabled={themeSaving}
            className="w-full mt-4 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-ink/90 transition-colors">
            {themeSaving ? 'در حال ذخیره...' : themeSaved ? '✓ ذخیره شد' : 'ذخیره‌ی تم'}
           </button>
          </>
         )}
        </section>
       )}

       {/* شماره کارت‌ها — per-resource (کارت دریافت وجه/بازپرداخت خود هر دکتر)؛
          فقط وقتی کارت‌به‌کارت برای این tenant فعال است معنا دارد */}
       {settingsSubTab === 'payments' && cardToCardAllowed && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">شماره کارت‌های واریزی</h2>
        <p className="text-xs text-soot mb-4">این کارت‌ها در صفحه‌ی پرداخت کارت‌به‌کارت به مراجع نمایش داده می‌شوند.</p>
        <div className="space-y-3">
         {profile.cards.map((c, i) => (
          <div key={c.id} className="border border-sand rounded-xl p-3 bg-gray-50 space-y-2">
           <div className="flex items-center gap-2">
            <input value={c.number}
             onChange={e => {
              const next = [...profile.cards]; next[i] = { ...c, number: e.target.value }
              patchProfile({ cards: next })
             }}
             dir="ltr" placeholder="6037-9900-0000-0000"
             className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg bg-white font-mono tracking-wider focus:outline-none focus:border-ink" />
            <button onClick={() => patchProfile({ cards: profile.cards.filter((_, j) => j !== i) })}
             className="text-xs px-2.5 py-2 border border-red-500/30 text-red-600 rounded-lg shrink-0 hover:bg-red-500/5">حذف</button>
           </div>
           <div className="grid grid-cols-2 gap-2">
            <input value={c.holder}
             onChange={e => {
              const next = [...profile.cards]; next[i] = { ...c, holder: e.target.value }
              patchProfile({ cards: next })
             }}
             placeholder="نام صاحب کارت"
             className="text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
            <input value={c.bank || ''}
             onChange={e => {
              const next = [...profile.cards]; next[i] = { ...c, bank: e.target.value }
              patchProfile({ cards: next })
             }}
             placeholder="نام بانک (اختیاری)"
             className="text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
           </div>
          </div>
         ))}
        </div>
        <button onClick={() => patchProfile({ cards: [...profile.cards, { id: genId('card'), number: '', holder: '' }] })}
         className="mt-3 text-xs px-3 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand">+ افزودن کارت</button>
       </section>
       )}

       {/* قیمت‌گذاری — per-resource؛ فقط دو قیمت: آنلاین/حضوری. نوع کار (مصاحبه/
           ارزیابی/جلسه/پروتکل) فرقی نمی‌کند، فقط نوع حضور قیمت را تعیین می‌کند. */}
       {settingsSubTab === 'pricing' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">قیمت‌گذاری</h2>
        <p className="text-xs text-soot mb-4">فقط نوع حضور قیمت را تعیین می‌کند — مصاحبه، ارزیابی، و جلسه هرکدام با همین دو قیمت حساب می‌شوند. روی رزروهای تازه اعمال می‌شود (رزروهای قبلی با همان قیمت زمان ثبت‌شان می‌مانند).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
         <div>
          <label className="text-xs text-soot mb-1 block">هزینه‌ی هر جلسه‌ی آنلاین (تومان)</label>
          <input type="number" min={0} value={profile.pricing.online}
           onChange={e => patchProfile({ pricing: { ...profile.pricing, online: Math.max(0, Number(e.target.value) || 0) } })}
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
         </div>
         <div>
          <label className="text-xs text-soot mb-1 block">هزینه‌ی هر جلسه‌ی حضوری (تومان)</label>
          <input type="number" min={0} value={profile.pricing.offline}
           onChange={e => patchProfile({ pricing: { ...profile.pricing, offline: Math.max(0, Number(e.target.value) || 0) } })}
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
         </div>
        </div>

        <div className="border-t border-sand mt-4 pt-4">
         <h3 className="text-xs font-medium text-ink mb-1">مدت زمان جلسات</h3>
         <p className="text-xs text-soot mb-3">صرفا نمایشی/مرجع است — روی ساعت‌های قابل‌رزرو اثر نمی‌گذارد.</p>
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
           <label className="text-xs text-soot mb-1 block">مدت جلسه‌ی آنلاین (دقیقه)</label>
           <input type="number" min={1} value={profile.pricing.duration_online}
            onChange={e => patchProfile({ pricing: { ...profile.pricing, duration_online: Math.max(1, Number(e.target.value) || 1) } })}
            className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
          </div>
          <div>
           <label className="text-xs text-soot mb-1 block">مدت جلسه‌ی حضوری (دقیقه)</label>
           <input type="number" min={1} value={profile.pricing.duration_offline}
            onChange={e => patchProfile({ pricing: { ...profile.pricing, duration_offline: Math.max(1, Number(e.target.value) || 1) } })}
            className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
          </div>
         </div>
        </div>

        <div className="border-t border-sand mt-4 pt-4">
         <label className="text-xs text-soot mb-1 block">هزینه‌ی هر دقیقه‌ی اضافه (تومان)</label>
         <p className="text-xs text-soot mb-2">اگر جلسه‌ای بیشتر از مدت معمول طول بکشد، برای محاسبه‌ی هزینه‌ی دقایق اضافه (هنگام ارسال شارژ اضافه) استفاده می‌شود. صفر یعنی هزینه‌ی اضافه محاسبه نمی‌شود.</p>
         <input type="number" min={0} value={profile.pricing.extra_minute_price}
          onChange={e => patchProfile({ pricing: { ...profile.pricing, extra_minute_price: Math.max(0, Number(e.target.value) || 0) } })}
          className="w-full sm:w-56 text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
        </div>
       </section>
       )}

       {/* سیاست کنسلی — per-resource؛ وقتی مراجع خودش کنسل می‌کند این محاسبه
           می‌شود. قبلا در تب «ماژول‌ها و سیاست‌ها» بود؛ چون مستقیم به قیمت‌گذاری
           مربوط است (چند درصد از همان مبلغ برگردد)، به این تب منتقل شد. */}
       {settingsSubTab === 'pricing' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">سیاست کنسلی جلسه</h2>
        <p className="text-xs text-soot mb-4">وقتی مراجع خودش یک جلسه را کنسل می‌کند، طبق همین قانون بازپرداخت محاسبه می‌شود.</p>
        <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer mb-3">
         <span className="text-sm text-ink">مراجع اجازه‌ی کنسل‌کردن خودکار داشته باشد</span>
         <input type="checkbox" checked={profile.cancellation_policy.enabled}
          onChange={e => patchProfile({ cancellation_policy: { ...profile.cancellation_policy, enabled: e.target.checked } })}
          className="w-5 h-5 accent-ink shrink-0" />
        </label>
        {profile.cancellation_policy.enabled && (
         <div className="space-y-3 bg-gray-50 rounded-xl p-3.5">
          <div className="flex items-center gap-2">
           <span className="text-xs text-soot shrink-0">اگه حداقل</span>
           <input type="number" min={0} value={profile.cancellation_policy.threshold_hours}
            onChange={e => patchProfile({ cancellation_policy: { ...profile.cancellation_policy, threshold_hours: parseInt(e.target.value) || 0 } })}
            className="w-16 text-sm px-2 py-1.5 border border-sand rounded-lg bg-white text-center" />
           <span className="text-xs text-soot shrink-0">ساعت قبل از جلسه کنسل کرد:</span>
          </div>
          <div className="flex items-center gap-2 pr-2">
           <span className="text-xs text-soot shrink-0">چند درصد پول برگردد؟</span>
           <input type="number" min={0} max={100} value={profile.cancellation_policy.early_refund_percent}
            onChange={e => patchProfile({ cancellation_policy: { ...profile.cancellation_policy, early_refund_percent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) } })}
            className="w-16 text-sm px-2 py-1.5 border border-sand rounded-lg bg-white text-center" />
           <span className="text-xs text-soot shrink-0">٪</span>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-sand">
           <span className="text-xs text-soot shrink-0">اگه دیرتر از اون (نزدیک‌تر به جلسه) کنسل کرد، چند درصد برگردد؟</span>
           <input type="number" min={0} max={100} value={profile.cancellation_policy.late_refund_percent}
            onChange={e => patchProfile({ cancellation_policy: { ...profile.cancellation_policy, late_refund_percent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) } })}
            className="w-16 text-sm px-2 py-1.5 border border-sand rounded-lg bg-white text-center shrink-0" />
           <span className="text-xs text-soot shrink-0">٪</span>
          </div>
         </div>
        )}
       </section>
       )}

       {/* کدهای تخفیف — per-resource؛ اختیاری برای بعضی مراجعان.
           فقط وقتی ماژول discount_codes روشن است (API‌اش هم از فاز 2 گیت دارد). */}
       {settingsSubTab === 'pricing' && mod('discount_codes') && (
        <DiscountCodesSection slug={slug} isOwner={!!me?.isOwner} viewingResourceId={viewingResourceId} />
       )}

       {/* شرایط و مقررات قبل از پرداخت — کاملا اختیاری و کاملا متن آزاد خود
           دکتر. عمدا هیچ متن پیش‌فرض/قالبی (مثل مدت جلسه یا سیاست کنسلی)
           به آن اضافه نمی‌شود — چون هر دکتری ممکن است مدل کاملا متفاوتی
           برای نوشتن شرایطش بخواهد. */}
       {settingsSubTab === 'terms' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">شرایط و مقررات قبل از پرداخت</h2>
        <p className="text-xs text-soot mb-4">اگر روشن باشد، مراجع پیش از هر پرداخت (آنلاین یا کارت‌به‌کارت) باید این متن را ببیند و با تیک‌زدن آن را بپذیرد — وگرنه دکمه‌ی پرداخت غیرفعال می‌ماند. اگر خاموش باشد، این بخش برای مراجع اصلا نمایش داده نمی‌شود.</p>

        <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
         <input type="checkbox" checked={profile.terms.enabled}
          onChange={e => patchProfile({ terms: { ...profile.terms, enabled: e.target.checked } })}
          className="w-4 h-4" />
         <span className="text-sm text-ink">پیش از پرداخت از مراجع تاییدیه بگیر</span>
        </label>

        <div className={profile.terms.enabled ? '' : 'opacity-50 pointer-events-none'}>
         <label className="text-xs text-soot mb-1 block">متن شرایط و مقررات</label>
         <p className="text-xs text-soot mb-2">هر مدل و فرمتی که خودتان می‌خواهید — مدت جلسه، هزینه‌ی دقیقه‌ی اضافه، شرایط کنسلی هر دو طرف، یا هر نکته‌ی دیگر. دقیقا همین متن به مراجع نشان داده می‌شود.</p>
         <textarea value={profile.terms.extra} rows={7} maxLength={2000}
          onChange={e => patchProfile({ terms: { ...profile.terms, extra: e.target.value } })}
          placeholder={'مثلا:\nمدت هر جلسه 50 دقیقه است. هر دقیقه‌ی اضافه 50,000 تومان محاسبه می‌شود.\nکنسلی تا 12 ساعت قبل: 50٪ بازگشت وجه. دیرتر از آن: بدون بازگشت.\nدر صورت کنسلی از طرف من، جلسه‌ی جایگزین رایگان تعیین می‌شود.'}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink resize-none" />
        </div>
       </section>
       )}

       {/* همراه/تماس دوم — کاملا اختیاری، برچسبش را خود متخصص تعیین می‌کند.
           اینجاست چون مستقیم به فرم رزرو مربوط می‌شود (بخش «همراه» توی فرم و
           انتخاب حضور جلسات)، نه به هویت خود متخصص. */}
       {settingsSubTab === 'form' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">همراه / تماس دوم</h2>
        <p className="text-xs text-soot mb-4">
         اگر معمولا یک نفر دیگر هم توی کارتان دخیل است (والدین کودک، همسر، همراه سالمند...)، اسمش را اینجا بگذارید تا توی فرم رزرو و جلسات با همین اسم نمایش داده شود. اگر کارتان مستقیم با خود مراجع است، خالی بگذارید.
        </p>
        <input value={profile.companion_label} onChange={e => patchProfile({ companion_label: e.target.value })}
         placeholder="مثلا: والدین، همسر، همراه (خالی = استفاده نمی‌کنم)"
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
       </section>
       )}

       {/* فرم رزرو — استادو-جزئیات: لیست سوال‌ها + پنل ویرایش متمرکز */}
       {settingsSubTab === 'form' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">فرم رزرو</h2>
        <p className="text-xs text-soot mb-4">
         از لیست یه سوال رو انتخاب کن تا تو پنل کنارش ویرایشش کنی. نام و شماره‌تماس همیشه ثابت‌اند و این‌جا نیستند.
        </p>
        {!intakeLoaded ? (
         <div className="text-center py-8 text-soot text-sm">در حال بارگذاری فرم...</div>
        ) : (
         <div className="grid sm:grid-cols-[260px_1fr] gap-4 items-start">
          {/* ── لیست: آکاردئون + جابه‌جایی با درگ (فقط از دستگیره‌ی ⠿) ── */}
          <div className="bg-gray-50 rounded-xl p-2 sm:max-h-[560px] sm:overflow-y-auto">
           {intakeForm.sections.map((section, sIdx) => {
            const isOpen = openSection === section.id
            return (
             <div key={section.id} className="mb-1.5"
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragSectionIdx !== null) setDragOverSectionIdx(sIdx) }}
              onDragLeave={() => setDragOverSectionIdx(x => x === sIdx ? null : x)}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragSectionIdx !== null) reorderFormSection(dragSectionIdx, sIdx); setDragSectionIdx(null); setDragOverSectionIdx(null) }}
             >
              {dragOverSectionIdx === sIdx && dragSectionIdx !== null && dragSectionIdx !== sIdx && (
               <div className="h-0.5 bg-ink rounded-full mb-1 mx-2" />
              )}
              {/* ── ردیف بخش: پس‌زمینه‌ی پررنگ‌تر + بولد + آیکون پوشه، تا کاملا از سوال‌ها جدا دیده شود ── */}
              <div
               className={`w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg transition-colors bg-gray-200/70 ${
                isOpen ? 'ring-1 ring-inset ring-gray-300' : 'hover:bg-gray-200'}`}>
               <span draggable title="جابه‌جایی"
                onDragStart={e => { e.stopPropagation(); setDragSectionIdx(sIdx) }}
                onDragEnd={() => { setDragSectionIdx(null); setDragOverSectionIdx(null) }}
                className="text-soot text-xs shrink-0 cursor-grab active:cursor-grabbing px-0.5">⠿</span>
               <button onClick={() => { setOpenSection(x => x === section.id ? null : section.id); setBuilderSel({ sIdx, fIdx: null }) }}
                className="flex-1 min-w-0 flex items-center gap-2 text-right">
                <svg viewBox="0 0 24 24" className={`w-2.5 h-2.5 text-soot shrink-0 transition-transform ${isOpen ? '-rotate-90' : ''}`}
                 fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M15 6l-6 6 6 6" />
                </svg>
                <span className="text-xs shrink-0"></span>
                <span className="flex-1 min-w-0 truncate text-sm font-bold text-ink">{section.title || 'بخش بی‌نام'}</span>
                <span className="text-[10px] text-soot shrink-0 bg-white px-1.5 py-0.5 rounded-full">{section.fields.length}</span>
               </button>
              </div>
              {isOpen && (
               <div className="mt-1 space-y-1 pr-2">
                {section.fields.map((field, fIdx) => {
                 const isConditional = !!field.showIf
                 return (
                  <div key={field.id}
                   className={isConditional ? 'mr-4' : ''}
                   onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragField && dragField.sIdx === sIdx) setDragOverField({ sIdx, fIdx }) }}
                   onDragLeave={() => setDragOverField(x => (x && x.sIdx === sIdx && x.fIdx === fIdx) ? null : x)}
                   onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragField && dragField.sIdx === sIdx) reorderFormField(sIdx, dragField.fIdx, fIdx); setDragField(null); setDragOverField(null) }}
                  >
                   {dragOverField?.sIdx === sIdx && dragOverField.fIdx === fIdx && dragField && dragField.fIdx !== fIdx && (
                    <div className="h-0.5 bg-ink rounded-full mb-0.5 mr-4" />
                   )}
                   <div className={`w-full flex items-center gap-1 pr-1 pl-2.5 py-2 rounded-lg transition-colors border ${
                     builderSel?.sIdx === sIdx && builderSel?.fIdx === fIdx
                      ? 'bg-white border-sand shadow-sm'
                      : isConditional ? 'bg-gray-100/60 border-sand hover:bg-gray-100' : 'bg-white/60 border-transparent hover:bg-gray-100'
                    } ${field.hidden ? 'opacity-40' : ''}`}>
                    {isConditional && <span className="text-soot text-xs shrink-0">↳</span>}
                    <span draggable title="جابه‌جایی"
                     onDragStart={e => { e.stopPropagation(); setDragField({ sIdx, fIdx }) }}
                     onDragEnd={() => { setDragField(null); setDragOverField(null) }}
                     className="text-gray-300 text-xs shrink-0 cursor-grab active:cursor-grabbing px-0.5">⠿</span>
                    <button onClick={() => setBuilderSel({ sIdx, fIdx })}
                     className="flex-1 min-w-0 flex items-center gap-2 text-right">
                     <span className="text-[10px] text-gray-300 shrink-0 w-4 text-center">{fieldTypeIcon(field.type)}</span>
                     <span className={`flex-1 min-w-0 truncate text-xs ${isConditional ? 'text-ink' : 'text-ink'}`}>{field.label || 'بدون عنوان'}</span>
                     {field.hidden && <span title="مخفی" className="text-[10px] text-soot shrink-0">🚫</span>}
                     {field.required && <span title="اجباری" className="w-1.5 h-1.5 rounded-full bg-ink shrink-0" />}
                    </button>
                   </div>
                  </div>
                 )
                })}
                <button onClick={() => addFormField(sIdx)}
                 className="w-full text-[11px] pr-4 pl-2.5 py-1.5 text-soot hover:text-ink text-right">+ سوال جدید</button>
               </div>
              )}
             </div>
            )
           })}
           <button onClick={addFormSection}
            className="w-full mt-1 text-xs py-2 border border-dashed border-gray-300 text-soot rounded-lg hover:border-gray-400 hover:text-ink">+ بخش جدید</button>
          </div>

          {/* ── پنل ویرایش متمرکز ── */}
          <div>
           {!builderSel ? (
            <div className="h-full min-h-[240px] flex items-center justify-center text-center text-sm text-soot bg-gray-50 rounded-xl p-8">
             یه سوال یا بخش رو از لیست انتخاب کن تا اینجا ویرایشش کنی
            </div>
           ) : builderSel.fIdx === null ? (
            // ── ویرایش بخش ──
            (() => {
             const sIdx = builderSel.sIdx
             const section = intakeForm.sections[sIdx]
             if (!section) return null
             return (
              <div className="bg-gray-50 rounded-xl p-5">
               <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-soot">ویرایش بخش — برای جابه‌جایی، از لیست کنار درگ کن</span>
                <button onClick={async () => { if (await uiConfirm(`بخش «${section.title}» با همه‌ی سوال‌هایش حذف شود؟`)) removeFormSection(sIdx) }}
                 className="text-xs px-2.5 py-1.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5 shrink-0">حذف بخش</button>
               </div>
               <label className="text-xs text-soot mb-1 block">عنوان بخش</label>
               <input value={section.title} onChange={e => updateFormSection(sIdx, { title: e.target.value })}
                className="w-full text-base font-medium px-3 py-2.5 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
              </div>
             )
            })()
           ) : (
            // ── ویرایش سوال ──
            (() => {
             const { sIdx, fIdx } = builderSel
             const section = intakeForm.sections[sIdx]
             const field = section?.fields[fIdx]
             if (!field) return null
             const triggers = eligibleTriggerFields(sIdx, fIdx)
             const triggerField = field.showIf ? triggers.find(t => t.id === field.showIf!.fieldId) : undefined
             const downstream = downstreamFields(sIdx, fIdx)
             const canBeTrigger = (field.type === 'select' || field.type === 'multiselect') && (field.options || []).some(o => o.trim())
             return (
              <div className="bg-gray-50 rounded-xl p-5 space-y-5">
               <div className="flex items-center justify-between">
                <span className="text-xs text-soot">ویرایش سوال — برای جابه‌جایی، از لیست کنار درگ کن</span>
                <div className="flex items-center gap-1.5 shrink-0">
                 <button onClick={() => updateFormField(sIdx, fIdx, { hidden: !field.hidden })}
                  title={field.hidden ? 'نمایش دوباره' : 'مخفی‌کردن موقت (بدون حذف)'}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg border ${field.hidden ? 'border-sand bg-gray-100 text-soot' : 'border-sand bg-white text-soot hover:text-soot'}`}>
                  {field.hidden ? (
                   <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" /><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6 0 9.5 5 10.5 7-.4.8-1.3 2.2-2.7 3.5M6.6 6.6C4.4 8 3 10.3 1.5 12c1 2 4.5 7 10.5 7 1.5 0 2.9-.3 4.1-.8" />
                    <path d="M9.9 10a3 3 0 0 0 4.2 4.2" />
                   </svg>
                  ) : (
                   <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" />
                    <circle cx="12" cy="12" r="3" />
                   </svg>
                  )}
                 </button>
                 <button onClick={() => removeFormField(sIdx, fIdx)}
                  className="text-xs px-2.5 py-1.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5">حذف سوال</button>
                </div>
               </div>

               {field.hidden && (
                <div className="text-xs text-ink bg-gray-100 border border-sand rounded-lg p-2.5">
                 این سوال الان مخفی است — مراجع اصلا نمی‌بیندش، ولی حذف نشده و هروقت خواستی می‌تونی برش‌گردونی.
                </div>
               )}

               {/* پیش‌نمایش زنده */}
               <div className="bg-white rounded-xl border border-sand p-4">
                <p className="text-[10px] text-soot mb-2">این‌طوری مراجع می‌بیند:</p>
                <div className="flex items-center gap-1 mb-1.5">
                 <span className="text-xs text-soot">{field.label || 'بدون عنوان'}</span>
                 {field.required && <span className="text-soot text-xs">*</span>}
                </div>
                {field.type === 'text' && (
                 <input disabled placeholder={field.placeholder} className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-gray-50 text-soot" />
                )}
                {field.type === 'textarea' && (
                 <textarea disabled rows={2} placeholder={field.placeholder} className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-gray-50 text-soot resize-none" />
                )}
                {(field.type === 'select' || field.type === 'multiselect') && (
                 <div className="flex gap-2 flex-wrap">
                  {(field.options || []).length === 0 && <span className="text-xs text-gray-300">هنوز گزینه‌ای نیست</span>}
                  {(field.options || []).map((o, oi) => (
                   <span key={oi} className={`text-xs px-3 py-1.5 border border-sand text-soot bg-gray-50 ${field.type === 'select' ? 'rounded-lg' : 'rounded-full'}`}>{o}</span>
                  ))}
                 </div>
                )}
                {field.type === 'date' && (
                 <div className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl bg-gray-50 text-soot flex items-center justify-between">
                  <span>انتخاب تاریخ</span>
                  <span></span>
                 </div>
                )}
                {field.type === 'phone' && (
                 <input disabled dir="ltr" placeholder="09xxxxxxxxx" className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-gray-50 text-soot" />
                )}
                {field.type === 'email' && (
                 <input disabled dir="ltr" placeholder="example@gmail.com" className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-gray-50 text-soot" />
                )}
               </div>

               {/* اگر این سوال خودش وابسته به یه سوال قبلیه — فقط نمایشی، ساخته نمی‌شه اینجا */}
               {field.showIf && (
                <div className="flex items-center justify-between gap-2 text-xs bg-gray-100 border border-sand rounded-lg p-3">
                 <span className="text-ink">
                  ⑂ این سوال فقط وقتی نشون داده می‌شه که پاسخ «{triggerField?.label || '؟'}» برابر «{field.showIf.value}» باشد
                 </span>
                 <button onClick={() => updateFormField(sIdx, fIdx, { showIf: undefined })}
                  className="text-red-500 hover:text-red-700 shrink-0">حذف شرط</button>
                </div>
               )}

               <div>
                <label className="text-xs text-soot mb-1 block">متن سوال</label>
                <input value={field.label} onChange={e => updateFormField(sIdx, fIdx, { label: e.target.value })}
                 className="w-full text-base px-3 py-2.5 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
               </div>

               <div>
                <label className="text-xs text-soot mb-2 block">نوع پاسخ</label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                 {(['text', 'textarea', 'select', 'multiselect', 'date', 'phone', 'email'] as FormFieldType[]).map(t => (
                  <button key={t} onClick={() => updateFormField(sIdx, fIdx, { type: t })}
                   className={`py-2 rounded-xl border text-center transition-all ${field.type === t ? 'border-ink border-2 bg-sand text-ink' : 'border-sand bg-white text-soot hover:border-gray-300'}`}>
                   <div className="text-sm mb-0.5">{fieldTypeIcon(t)}</div>
                   <div className="text-[9px]">{fieldTypeLabel(t)}</div>
                  </button>
                 ))}
                </div>
                <p className="text-[11px] text-soot mt-1.5 px-0.5">
                 {field.type === 'text' && 'مراجع یک خط متن کوتاه می‌نویسد — مثل اسم یا سن.'}
                 {field.type === 'textarea' && 'مراجع چند خط توضیح می‌نویسد — مثل دلیل مراجعه.'}
                 {field.type === 'select' && 'مراجع فقط یکی از گزینه‌ها را انتخاب می‌کند — مثل بله/خیر.'}
                 {field.type === 'multiselect' && 'مراجع می‌تواند چند گزینه را همزمان انتخاب کند — مثل چند علامت رفتاری.'}
                 {field.type === 'date' && 'مراجع با یک تقویم واقعی شمسی (کلیک‌پذیر) تاریخ را انتخاب می‌کند — نه تایپ دستی.'}
                 {field.type === 'phone' && 'فقط شماره‌ی موبایل معتبر (11 رقم، با 09) قبول می‌شود — نه هر متنی.'}
                 {field.type === 'email' && 'فقط ایمیل معتبر قبول می‌شود.'}
                </p>
               </div>

               {(field.type === 'select' || field.type === 'multiselect') && (
                <div>
                 <label className="text-xs text-soot mb-2 block">گزینه‌ها</label>
                 <div className="space-y-1.5">
                  {(field.options || []).map((o, oi) => (
                   <div key={oi} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-300 w-4 text-center shrink-0">{toFarsiNum(oi + 1)}</span>
                    <input value={o}
                     onChange={e => { const next = [...(field.options || [])]; next[oi] = e.target.value; updateFormField(sIdx, fIdx, { options: next }) }}
                     className="flex-1 text-sm px-3 py-1.5 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
                    <button onClick={() => updateFormField(sIdx, fIdx, { options: (field.options || []).filter((_, j) => j !== oi) })}
                     className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-ink shrink-0">×</button>
                   </div>
                  ))}
                 </div>
                 <button onClick={() => updateFormField(sIdx, fIdx, { options: [...(field.options || []), ''] })}
                  className="mt-2 text-xs px-3 py-1.5 border border-dashed border-gray-300 text-soot rounded-lg hover:border-gray-400 hover:text-soot">+ افزودن گزینه</button>
                </div>
               )}

               <label className="flex items-center justify-between p-3 rounded-xl border border-sand bg-white cursor-pointer">
                <span className="text-sm text-ink">پاسخ به این سوال اجباری باشد</span>
                <input type="checkbox" checked={field.required}
                 onChange={e => updateFormField(sIdx, fIdx, { required: e.target.checked })}
                 className="w-5 h-5 accent-ink" />
               </label>

               {/* منطق شرطی — از اینجا (سوال گزینه‌ای) تعیین می‌کنی هر جواب چه سوال‌هایی رو بعدش باز کنه */}
               {canBeTrigger && (
                <div>
                 <label className="text-xs text-soot mb-1 block">این سوال کدام سوال‌های بعدی را کنترل می‌کند؟</label>
                 <p className="text-[11px] text-soot mb-2">برای هر گزینه، فقط زیرسوالی که می‌خواهی بنویس — خودش وصل می‌شود.</p>
                 <div className="space-y-2">
                  {(field.options || []).filter(o => o.trim()).map(opt => {
                   const key = `${field.id}:${opt}`
                   const linked = downstream.filter(d => d.field.showIf?.fieldId === field.id && d.field.showIf?.value === opt)
                   return (
                    <div key={opt} className="p-3 rounded-xl bg-white border border-sand">
                     <p className="text-xs text-soot mb-2">وقتی پاسخ «{opt}» بود:</p>

                     {linked.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                       {linked.map(d => (
                        <span key={d.field.id} className="text-[11px] pl-1.5 pr-2.5 py-1 bg-sand text-ink rounded-lg flex items-center gap-1">
                         {d.field.label || 'بدون عنوان'}
                         <button onClick={() => updateFormField(d.sIdx, d.fIdx, { showIf: undefined })}
                          title="قطع این زیرسوال از این گزینه" className="text-soot hover:text-ink leading-none">×</button>
                        </span>
                       ))}
                      </div>
                     )}

                     <div className="flex items-center gap-2">
                      <input value={newSubQuestion[key] || ''}
                       onChange={e => setNewSubQuestion(s => ({ ...s, [key]: e.target.value }))}
                       onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubQuestion(sIdx, fIdx, opt) } }}
                       placeholder="زیرسوال تازه بنویس..."
                       className="flex-1 min-w-0 text-xs px-2.5 py-1.5 border border-dashed border-gray-300 rounded-lg focus:outline-none focus:border-ink focus:border-solid" />
                      <button onClick={() => addSubQuestion(sIdx, fIdx, opt)} disabled={!(newSubQuestion[key] || '').trim()}
                       className="text-xs px-2.5 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand disabled:opacity-40 shrink-0">+ افزودن</button>
                     </div>
                    </div>
                   )
                  })}
                 </div>
                </div>
               )}
              </div>
             )
            })()
           )}
          </div>
         </div>
        )}
       </section>
       )}

       {/* نوار ذخیره (چسبیده به پایین) — فقط وقتی چیزی واقعا عوض شده باشد، و فقط روی زیرتب‌هایی که این دکمه ذخیره‌شان می‌کند */}
       {!!settingsSubTab && ['profile', 'payments', 'pricing', 'terms', 'form'].includes(settingsSubTab) && (isSettingsTabDirty || settingsSaved || profileSaved || intakeSaved) && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 border-t border-sand backdrop-blur">
         <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-end gap-3">
          {(settingsSaved || profileSaved || intakeSaved) && <span className="text-xs text-emerald-600 font-medium">✓ تنظیمات ذخیره شد</span>}
          {isSettingsTabDirty && (
           <button onClick={cancelSettingsChanges}
            disabled={settingsSaving || profileSaving || intakeSaving}
            className="px-6 py-2.5 border border-sand text-soot rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-gray-100 transition-colors">
            انصراف
           </button>
          )}
          <button onClick={async () => {
            if (me?.isOwner) await Promise.all([saveSettings(), saveProfile(), saveIntakeForm()])
            else await Promise.all([saveProfile(), saveIntakeForm()])
           }}
           disabled={settingsSaving || profileSaving || intakeSaving}
           className="px-6 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-ink/90 transition-colors">
           {(settingsSaving || profileSaving || intakeSaving) ? 'در حال ذخیره...' : 'ذخیره‌ی تغییرات'}
          </button>
         </div>
        </div>
       )}
      </>

      )}
     </div>
    )}
   </div>

   {/* ── New Package Modal ──────────────────────────────────────────── */}
   {/* مودال‌های پرونده (پروتکل جدید/پرونده‌ی جدید/ویرایش جلسه) به PatientsTab رفتند */}
   {/* ════════════════════════════════════════════════════════════════
     TAB: STAFF (کارمندها) — فقط owner می‌بیند
   ════════════════════════════════════════════════════════════════ */}
   {mainTab === 'staff' && me?.isOwner && me?.multiTherapist && (
    <StaffTab panelApi={panelApi} staffList={staffList} staffLoaded={staffLoaded} reloadStaff={loadStaff} />
   )}

   {/* ════════════════════════════════════════════════════════════════
     TAB: PATIENT PANEL SETTINGS (ماژول‌هایی که مراجع می‌بیند)
   ════════════════════════════════════════════════════════════════ */}
   {mainTab === 'settings' && settingsSubTab === 'patient_panel' && (
    <div className="max-w-3xl mx-auto">
     <div className="grid sm:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-sand p-5">
       <h2 className="text-sm font-display font-bold text-ink mb-1">تنظیمات پنل مراجع</h2>
       <p className="text-xs text-soot mb-5 leading-relaxed">
        این‌ها قابلیت‌هایی هستند که مراجع پس از ورود به پنل خودش (/{slug}/my) می‌بیند — پیش‌نمایش زنده کنارش است.
       </p>
       {!patientFeaturesLoaded ? (
        <div className="text-center py-10 text-soot text-sm">در حال بارگذاری...</div>
       ) : (
        <div className="space-y-4">
         <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-sand cursor-pointer">
          <div>
           <div className="text-sm font-medium text-ink">خرید جلسه‌ی جایگزین</div>
           <div className="text-[11px] text-soot mt-0.5">مراجع بتواند پس از سوختن یک جلسه، خودش جلسه‌ی جدید بخرد</div>
          </div>
          <input type="checkbox" checked={!!patientFeatures.patient_buy_extra_session}
           onChange={e => togglePatientFeature('patient_buy_extra_session', e.target.checked)}
           className="w-5 h-5 accent-ink shrink-0" />
         </label>
         <p className="text-[11px] text-soot px-1">
          اجازه‌ی کنسل‌کردن خودکار از تب «قیمت‌گذاری» تنظیمات، کنار سیاست کنسلی، مشخص می‌شود.
         </p>
        </div>
       )}
      </div>

      {/* پیش‌نمایش زنده — دقیقا همان کارتی که مراجع در پنل خودش می‌بیند */}
      <div>
       <p className="text-xs text-soot mb-2 px-1">پیش‌نمایش زنده</p>
       <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
        <div className="bg-white rounded-xl border border-sand p-3">
         <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-ink">جلسه‌ی 3</span>
          <span className="text-xs text-soot">1405/04/10 — 16:00 | آنلاین</span>
         </div>
         {profile.cancellation_policy.enabled && (
          <button disabled className="text-xs px-2.5 py-1 border border-sand text-ink rounded-lg mt-1">کنسل</button>
         )}
        </div>
        <div className="bg-white rounded-xl border border-sand p-3">
         <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-ink">جلسه‌ی 2</span>
          <span className="text-xs text-ink">سوخت شد — مبلغ برنگشت</span>
         </div>
         {patientFeatures.patient_buy_extra_session && (
          <button disabled className="w-full mt-2 py-2 border border-gray-300 text-soot rounded-xl text-xs">خرید جلسه‌ی جایگزین</button>
         )}
        </div>
        {!profile.cancellation_policy.enabled && !patientFeatures.patient_buy_extra_session && (
         <p className="text-[11px] text-soot text-center py-2">هر دو قابلیت خاموش‌اند — مراجع فقط وضعیت را می‌بیند.</p>
        )}
       </div>
      </div>
     </div>
    </div>
   )}

   {/* ════════════════════════════════════════════════════════════════
     TAB: ACCOUNT (پلن + ظاهر) — زیر تنظیمات، برای همه (owner و درمانگر)
   ════════════════════════════════════════════════════════════════ */}
   {mainTab === 'account' && (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
     <PageHeader title="حساب من" desc="مشخصات حساب، پلن مجموعه و تنظیمات سطح دسترسی." />

     {/* پنل‌های دیگر همین صاحب — سوییچ بدون OTP دوباره. فقط وقتی بیش از یک پنل باشد. */}
     {myPanels.length > 1 && (
      <section className="bg-white rounded-2xl border border-sand p-5">
       <h2 className="text-sm font-display font-bold text-ink mb-1">پنل‌های شما</h2>
       <p className="text-xs text-soot mb-4">
        شما بیش از یک پنل با همین شماره دارید. برای جابه‌جایی بین آن‌ها، بدون کد پیامکی دوباره، روی هرکدام بزنید.
       </p>
       <div className="space-y-2">
        {myPanels.map(p => (
         <div key={p.slug}
          className={`flex items-center justify-between gap-2 p-3 rounded-xl border ${p.current ? 'border-ink/20 bg-brand-50' : 'border-sand'}`}>
          <div className="min-w-0">
           <div className="text-sm text-ink truncate">{p.display_name}</div>
           <div className="text-xs text-soot truncate" dir="ltr">nobatlink.com/{p.slug}</div>
          </div>
          {p.current ? (
           <span className="text-xs text-soot font-medium shrink-0">پنل فعلی</span>
          ) : (
           <button onClick={() => switchPanel(p.slug)}
            className="text-xs text-white bg-ink rounded-lg px-3 py-1.5 shrink-0 hover:bg-ink/90 transition-colors">ورود به این پنل</button>
          )}
         </div>
        ))}
       </div>
      </section>
     )}

     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-1">مشخصات حساب</h2>
      <p className="text-xs text-soot mb-4">
       ورود به این پنل با پسورد یا یوزرنیم نیست — فقط با کد پیامکی به همین شماره. یوزرنیم/پسوردی برای نگه‌داشتن وجود ندارد.
      </p>
      <div className="space-y-2">
       <div className="p-3 rounded-xl border border-sand">
        <div className="flex items-center justify-between gap-2">
         <span className="text-sm text-ink">نشانی اختصاصی</span>
         {me?.isOwner !== false && !slugEditOpen && (
          <button onClick={() => { setSlugEditOpen(true); setSlugInput(me?.slug || slug) }}
           className="text-xs text-ink underline shrink-0">تغییر</button>
         )}
        </div>
        {!slugEditOpen ? (
         <a href={`/${slug}`} target="_blank" dir="ltr" className="block mt-1 text-xs text-soot underline">
          nobatlink.com/{me?.slug || slug}
         </a>
        ) : (
         <div className="mt-3 space-y-2">
          {/* هشدار جدی: نشانی همان چیزی است که در بیو اینستاگرام و دست مراجع‌ها است */}
          <div className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 leading-5">
           با تغییر نشانی، همه‌ی لینک‌های قبلی از کار می‌افتند — لینک بیو اینستاگرام، لینک‌هایی که به مراجع‌ها داده‌اید، و آدرس همین پنل. نشانی قبلی هم آزاد می‌شود و ممکن است کس دیگری آن را بگیرد.
          </div>
          <div className="flex items-stretch" dir="ltr">
           <span className="px-2 flex items-center text-[11px] text-soot bg-gray-100 border border-l-0 border-sand rounded-l-lg shrink-0">nobatlink.com/</span>
           <input dir="ltr" value={slugInput} onChange={e => setSlugInput(e.target.value.toLowerCase())}
            placeholder="your-name"
            className="flex-1 min-w-0 text-sm px-2 py-2 border border-sand rounded-r-lg focus:outline-none focus:border-ink" />
          </div>
          <p className={`text-[11px] ${slugInput && !slugInputOk ? 'text-red-500' : 'text-soot'}`}>
           {slugInput && !slugInputOk
            ? (RESERVED_SLUGS.includes(slugInput) ? 'این نشانی رزرو سیستم است' : SLUG_RULE_TEXT)
            : SLUG_RULE_TEXT}
          </p>
          <div className="flex gap-2">
           <button onClick={saveSlug} disabled={slugSaving || !slugInputOk || slugInput === (me?.slug || slug)}
            className="flex-1 py-2 bg-ink text-white rounded-lg text-sm disabled:opacity-40">
            {slugSaving ? 'در حال ذخیره…' : 'ثبت نشانی جدید'}
           </button>
           <button onClick={() => setSlugEditOpen(false)} className="px-4 py-2 border border-sand rounded-lg text-sm text-soot">انصراف</button>
          </div>
         </div>
        )}
       </div>
       <div className="flex items-center justify-between p-3 rounded-xl border border-sand">
        <span className="text-sm text-ink">شماره‌ی ورود{me && !me.isOwner ? ' (شما، به‌عنوان درمانگر)' : ''}</span>
        <span dir="ltr" className="text-xs text-soot tnum">{me?.phone || '—'}</span>
       </div>
      </div>

      {!changePhoneOpen ? (
       <button onClick={() => setChangePhoneOpen(true)} className="mt-3 text-xs text-ink underline">تغییر شماره‌ی ورود</button>
      ) : (
       <div className="mt-3 p-3 rounded-xl border border-sand bg-gray-50 space-y-2">
        {changePhoneStep === 'phone' ? (
         <>
          <label className="text-xs text-soot block">شماره‌ی جدید</label>
          <input dir="ltr" inputMode="numeric" placeholder="09xxxxxxxxx" value={newPhoneInput}
           onChange={e => setNewPhoneInput(e.target.value)}
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
          <div className="flex gap-2">
           <button onClick={sendChangePhoneCode} disabled={changePhoneBusy}
            className="flex-1 py-2 bg-ink text-white rounded-lg text-sm disabled:opacity-50">
            {changePhoneBusy ? 'در حال ارسال…' : 'ارسال کد تایید'}
           </button>
           <button onClick={() => setChangePhoneOpen(false)} className="px-4 py-2 border border-sand rounded-lg text-sm text-soot">انصراف</button>
          </div>
         </>
        ) : (
         <>
          {changePhoneDevCode && (
           <p className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-center">
            کد تست (تا اتصال پیامک): <strong className="text-base">{changePhoneDevCode}</strong>
           </p>
          )}
          <label className="text-xs text-soot block">کد ارسال‌شده به {newPhoneInput}</label>
          <input dir="ltr" inputMode="numeric" placeholder="کد 5 رقمی" value={changePhoneCode}
           onChange={e => setChangePhoneCode(e.target.value)}
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum tracking-widest text-center focus:outline-none focus:border-ink" />
          <div className="flex gap-2">
           <button onClick={verifyChangePhoneCode} disabled={changePhoneBusy}
            className="flex-1 py-2 bg-ink text-white rounded-lg text-sm disabled:opacity-50">
            {changePhoneBusy ? 'در حال تایید…' : 'تایید کد'}
           </button>
           <button onClick={() => { setChangePhoneStep('phone'); setChangePhoneCode('') }} className="px-4 py-2 border border-sand rounded-lg text-sm text-soot">بازگشت</button>
          </div>
         </>
        )}
       </div>
      )}
     </section>

     {me?.isOwner && (
      <section className="bg-white rounded-2xl border border-sand p-5">
       <h2 className="text-sm font-display font-bold text-ink mb-1">حالت کلینیک</h2>
       {me.multiTherapist ? (
        <>
         <p className="text-xs text-soot mb-2">حالت کلینیک برای مجموعه‌ی شما فعال است — تب «درمانگرها» را در سایدبار می‌بینید.</p>
         <p className="text-[11px] text-soot">برای غیرفعال‌کردن با پشتیبانی {PLATFORM_NAME} تماس بگیرید.</p>
        </>
       ) : me.multiTherapistRequested ? (
        <>
         <p className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 mb-3">
          درخواست شما ثبت شد — تا تایید پشتیبانی {PLATFORM_NAME} منتظر بمانید. بعد از تایید، تب «درمانگرها» خودکار ظاهر می‌شود.
         </p>
         <button onClick={async () => {
           setTogglingClinicMode(true)
           const res = await fetch(panelApi('/multi-therapist'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request: false }),
           })
           setTogglingClinicMode(false)
           if (!res.ok) { uiAlert('لغو درخواست ناموفق بود'); return }
           await loadMe()
          }}
          disabled={togglingClinicMode}
          className="text-xs text-soot border border-sand rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
          لغو درخواست
         </button>
        </>
       ) : (
        <>
         <p className="text-xs text-soot mb-3">
          اگر بیش از یک درمانگر دارید، درخواست بدهید تا پشتیبانی {PLATFORM_NAME} بعد از بررسی، تب «درمانگرها» را برایتان فعال کند.
          اگر تک‌درمانگرید، لازم نیست کاری کنید.
         </p>
         <textarea value={clinicRequestNote} onChange={e => setClinicRequestNote(e.target.value)}
          placeholder="اختیاری: چند نفر درمانگر دارید؟ (به بررسی سریع‌تر کمک می‌کند)"
          rows={2} className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none mb-2 focus:outline-none focus:border-ink" />
         <button onClick={async () => {
           setTogglingClinicMode(true)
           const res = await fetch(panelApi('/multi-therapist'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request: true, note: clinicRequestNote.trim() }),
           })
           setTogglingClinicMode(false)
           if (!res.ok) { uiAlert('ثبت درخواست ناموفق بود'); return }
           await loadMe()
          }}
          disabled={togglingClinicMode}
          className="px-4 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {togglingClinicMode ? 'در حال ارسال…' : 'درخواست تبدیل به کلینیک'}
         </button>
        </>
       )}
      </section>
     )}

     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-1">پلن مجموعه</h2>
      <p className="text-xs text-soot mb-4">
       تغییر پلن فقط از سمت پشتیبانی {PLATFORM_NAME} انجام می‌شود؛ برای ارتقا با پشتیبانی تماس بگیرید.
      </p>
      <div className="flex items-center justify-between p-3.5 rounded-xl border border-sand">
       <span className="text-sm text-ink">پلن فعلی</span>
       {(() => {
        const trialDays = trialExpiresAt ? Math.max(0, Math.ceil((new Date(trialExpiresAt).getTime() - Date.now()) / 86400000)) : 0
        const trialActive = trialDays > 0 && tenantPlan !== 'pro' && tenantPlan !== 'team'
        const label = trialActive ? `حرفه‌ای (آزمایشی — ${trialDays} روز)` : (PLAN_LABELS[tenantPlan] || 'پایه')
        const green = trialActive || tenantPlan === 'pro' || tenantPlan === 'team'
        return (
         <span className={`text-xs px-2.5 py-1 rounded-full font-medium tnum ${green ? 'bg-emerald-100 text-emerald-800' : 'bg-sand text-soot'}`}>
          {label}
         </span>
        )
       })()}
      </div>
     </section>

     {/* شبای تسویه — برای واریز خودکار سهم خودتان از پرداخت آنلاین. per-resource
         است، نه صفحه‌ی عمومی، پس اینجا (حساب من) جایش درست‌تر از تب «روش
         پرداخت» بود. این تب بخشی از سیستم نوار ذخیره‌ی مشترک تنظیمات نیست، پس
         سوییچر دکتر و دکمه‌ی ذخیره‌ی خودش را دارد. */}
     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-1">شبای دریافت سهم از پرداخت آنلاین</h2>
      <p className="text-xs text-soot mb-4">
       برای واریز خودکار سهم شما لازم است. تا ثبت نشود، تسویه به‌صورت دستی هماهنگ می‌شود.
      </p>

      {me?.isOwner && staffList.filter(r => r.is_active).length > 1 && (
       <select value={viewingResourceId || staffList.find(r => r.is_active)?.id || ''}
        onChange={e => { setViewingResourceId(e.target.value); setProfileLoaded(false) }}
        className="w-full text-sm px-3 py-2 border border-sand rounded-lg mb-4 focus:outline-none focus:border-ink">
        {staffList.filter(r => r.is_active).map(r => (
         <option key={r.id} value={r.id}>{r.name}{r.title ? ` — ${r.title}` : ''}</option>
        ))}
       </select>
      )}

      {!profileLoaded ? (
       <div className="text-center py-8 text-soot text-sm">در حال بارگذاری...</div>
      ) : (
       <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
         <input
          dir="ltr"
          placeholder="IR00 0000 0000 0000 0000 0000 00"
          value={profile.settlement_sheba}
          onChange={e => patchProfile({ settlement_sheba: e.target.value })}
          className="border border-sand rounded-xl px-3 py-2 text-sm tnum"
         />
         <input
          placeholder="نام صاحب حساب"
          value={profile.settlement_sheba_holder_name}
          onChange={e => patchProfile({ settlement_sheba_holder_name: e.target.value })}
          className="border border-sand rounded-xl px-3 py-2 text-sm"
         />
        </div>
        <div className="flex items-center justify-end gap-3 mt-4">
         {profileSaved && <span className="text-xs text-emerald-600 font-medium">✓ ذخیره شد</span>}
         <button onClick={saveProfile} disabled={profileSaving}
          className="px-5 py-2 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-ink/90">
          {profileSaving ? 'در حال ذخیره...' : 'ذخیره‌ی شبا'}
         </button>
        </div>
       </>
      )}
     </section>

     <button onClick={doLogout}
      className="w-full text-sm px-4 py-3 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 transition-colors">
      خروج از پنل
     </button>
    </div>
   )}

   {/* ════════════════════════════════════════════════════════════════
     TAB: SUPPORT TICKETS (تیکت پشتیبانی)
   ════════════════════════════════════════════════════════════════ */}
   {mainTab === 'tickets' && (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
     <PageHeader title="پشتیبانی" desc="تیکت‌های شما مستقیم به تیم پشتیبانی می‌رسد و پاسخ همین‌جا نمایش داده می‌شود." />
     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-1">ثبت تیکت تازه</h2>
      <p className="text-xs text-soot mb-4">در صورت بروز مشکل یا نیاز به قابلیت تازه، همین‌جا مطرح کنید — مستقیم به تیم {PLATFORM_NAME} می‌رسد.</p>
      <div className="space-y-3">
       <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {([
         ['bug', '🐞 مشکل/باگ'], ['feature', '💡 قابلیت تازه'], ['billing', '💳 مالی/پلن'], ['other', '❓ سایر'],
        ] as [string, string][]).map(([val, label]) => (
         <button key={val} onClick={() => setTicketForm(s => ({ ...s, category: val }))}
          className={`py-2 rounded-lg text-[11px] font-medium transition-colors ${ticketForm.category === val ? 'bg-ink text-white' : 'bg-gray-100 text-soot'}`}>
          {label}
         </button>
        ))}
       </div>
       <input value={ticketForm.subject} onChange={e => setTicketForm(s => ({ ...s, subject: e.target.value }))}
        placeholder="موضوع (خلاصه در یک جمله)"
        className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
       <textarea value={ticketForm.message} onChange={e => setTicketForm(s => ({ ...s, message: e.target.value }))}
        rows={5} placeholder="توضیح کامل..."
        className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none focus:outline-none focus:border-ink" />
       <button onClick={submitTicket} disabled={ticketSubmitting}
        className="w-full py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-50">
        {ticketSubmitting ? 'در حال ارسال…' : 'ارسال تیکت'}
       </button>
      </div>
     </section>

     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-3">تیکت‌های من</h2>
      {!ticketsLoaded ? (
       <p className="text-sm text-soot text-center py-6">در حال بارگذاری…</p>
      ) : tickets.length === 0 ? (
       <div className="text-center py-6">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-2"><Glyph icon="🎫" className="w-5 h-5 text-soot" /></div>
        <p className="text-xs text-soot">هنوز تیکتی ثبت نکرده‌اید.</p>
       </div>
      ) : (
       <div className="space-y-2">
        {tickets.map(tk => (
         <div key={tk.id} className="border border-sand rounded-xl p-3">
          <div className="flex items-center justify-between gap-2">
           <span className="text-sm font-medium text-ink">{tk.subject}</span>
           <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
            tk.status === 'resolved' || tk.status === 'closed' ? 'bg-emerald-100 text-emerald-800'
             : tk.status === 'in_progress' ? 'bg-amber-100 text-amber-800' : 'bg-sand text-soot'}`}>
            {tk.status === 'open' ? 'ثبت‌شده' : tk.status === 'in_progress' ? 'در حال بررسی' : tk.status === 'resolved' ? 'حل‌شده' : 'بسته‌شده'}
           </span>
          </div>
          <p className="text-xs text-soot mt-1 leading-relaxed">{tk.message}</p>
          {tk.admin_reply && (
           <div className="mt-2 pt-2 border-t border-sand">
            <p className="text-[11px] text-soot mb-0.5">پاسخ پشتیبانی:</p>
            <p className="text-xs text-ink leading-relaxed">{tk.admin_reply}</p>
           </div>
          )}
         </div>
        ))}
       </div>
      )}
     </section>
    </div>
   )}
  </div>
 )
}

// ─── کدهای تخفیف — کامپوننت مستقل (نه nested) تا با ری‌رندرهای پنل اصلی
// state‌ش (لیست کد/فرم) پاک نشود ──────────────────────────────────────────────
type DiscountCode = {
  id: string; code: string; discount_type: string; discount_value: number
  is_active: boolean; max_uses: number | null; used_count: number; expires_at: string | null
}

function DiscountCodesSection({ slug, isOwner, viewingResourceId }: { slug: string; isOwner: boolean; viewingResourceId: string }) {
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', discount_type: 'percent', discount_value: '', max_uses: '' })
  const [saving, setSaving] = useState(false)

  const url = (extra?: string) => {
    const qs = isOwner && viewingResourceId ? `?resource_id=${viewingResourceId}${extra ? '&' + extra : ''}` : (extra ? `?${extra}` : '')
    return `/api/t/${slug}/panel/psy/discount-codes${qs}`
  }

  const load = useCallback(async () => {
    const res = await fetch(url(), { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    setCodes(d.codes || [])
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, isOwner, viewingResourceId])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.code.trim() || !form.discount_value) { await uiAlert('کد و مقدار تخفیف را وارد کن'); return }
    setSaving(true)
    const res = await fetch(url(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.code, discount_type: form.discount_type, discount_value: Number(form.discount_value),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
      }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { await uiAlert(d.error || 'ثبت کد ناموفق بود'); return }
    setForm({ code: '', discount_type: 'percent', discount_value: '', max_uses: '' })
    setShowForm(false)
    load()
  }

  async function toggle(c: DiscountCode) {
    await fetch(url(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, is_active: !c.is_active }) })
    load()
  }

  async function remove(c: DiscountCode) {
    if (!await uiConfirm(`کد «${c.code}» حذف شود؟`)) return
    await fetch(url(), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
    load()
  }

  return (
    <section className="bg-white rounded-2xl border border-sand p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-display font-semibold text-ink">کدهای تخفیف</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="text-xs text-ink underline">+ کد تازه</button>}
      </div>
      <p className="text-xs text-soot mb-4">اختیاری — اگر خواستی به بعضی مراجعان تخفیف بدهی، یک کد بساز و به آن‌ها بگو موقع پرداخت وارد کنند.</p>

      {showForm && (
        <div className="border border-sand rounded-xl p-3 mb-3 space-y-3">
          <div>
            <label className="text-xs text-soot mb-1 block">کد</label>
            <input dir="ltr" value={form.code} onChange={e => setForm(s => ({ ...s, code: e.target.value.toUpperCase() }))}
              placeholder="SUMMER10" className="w-36 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="text-xs text-soot mb-1 block">نوع</label>
              <select value={form.discount_type} onChange={e => setForm(s => ({ ...s, discount_type: e.target.value }))}
                className="w-32 text-sm px-3 py-2 border border-sand rounded-lg bg-white">
                <option value="percent">درصدی</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-soot mb-1 block">{form.discount_type === 'percent' ? 'درصد' : 'مبلغ (تومان)'}</label>
              <input type="number" value={form.discount_value} onChange={e => setForm(s => ({ ...s, discount_value: e.target.value }))}
                placeholder={form.discount_type === 'percent' ? '20' : '100000'}
                className="w-24 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
            </div>
            <div>
              <label className="text-xs text-soot mb-1 block">سقف استفاده</label>
              <input type="number" value={form.max_uses} onChange={e => setForm(s => ({ ...s, max_uses: e.target.value }))}
                placeholder="نامحدود" className="w-24 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="px-5 py-2 bg-ink text-white rounded-lg text-xs font-medium disabled:opacity-50">
              {saving ? '...' : 'ساخت کد'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-sand rounded-lg text-xs text-soot">انصراف</button>
          </div>
        </div>
      )}

      {!loaded ? (
        <p className="text-xs text-soot text-center py-3">در حال بارگذاری…</p>
      ) : codes.length === 0 ? (
        <p className="text-xs text-soot text-center py-3">هنوز کدی نساخته‌ای.</p>
      ) : (
        <div className="space-y-2">
          {codes.map(c => (
            <div key={c.id} className="flex items-center justify-between text-sm p-2.5 border border-sand rounded-xl">
              <div>
                <span dir="ltr" className={`font-bold tnum ${!c.is_active ? 'text-soot line-through' : 'text-ink'}`}>{c.code}</span>
                <span className="text-xs text-soot mr-2">
                  {c.discount_type === 'percent' ? `${toFarsiNum(c.discount_value)}٪` : `${toFarsiNum(c.discount_value.toLocaleString('en-US'))} ت`}
                  {' · '}{toFarsiNum(c.used_count)}{c.max_uses ? `/${toFarsiNum(c.max_uses)}` : ''} استفاده
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => toggle(c)} className="text-[11px] text-soot underline">{c.is_active ? 'غیرفعال' : 'فعال'}</button>
                <button onClick={() => remove(c)} className="text-[11px] text-red-600 underline">حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Field/SelectField/TextareaField به panel/modules/shared.tsx منتقل شدند (فاز 4).

// ─── ورود دکتر با OTP (جایگزین ADMIN_SECRET؛ کد پیامکی به موبایل صاحب پنل) ───
function PanelLogin({ slug, onSuccess }: { slug: string; onSuccess: () => void }) {
 const [mode, setMode] = useState<'owner' | 'staff'>('owner')
 // اکثر مجموعه‌ها تک‌درمانگرند و اصلا «ورود درمانگر» ندارند؛ پیش‌فرض مخفی است و
 // فقط اگر حالت کلینیک روشن باشد سوییچ ظاهر می‌شود. تا وقتی پاسخ نیامده هم
 // چیزی نشان نمی‌دهیم — پرش (flash) دکمه‌ای که بعدا محو شود بدتر از نبودنش است.
 const [multiTherapist, setMultiTherapist] = useState(false)
 useEffect(() => {
  let alive = true
  fetch(`/api/t/${slug}/public`)
   .then(r => r.ok ? r.json() : null)
   .then(d => { if (alive && d) setMultiTherapist(!!d.multi_therapist) })
   .catch(() => {})
  return () => { alive = false }
 }, [slug])
 const [phone, setPhone] = useState('')
 const [otpSent, setOtpSent] = useState(false)
 const [devCode, setDevCode] = useState('')
 const [code, setCode] = useState('')
 const [busy, setBusy] = useState(false)
 const [err, setErr] = useState('')
 const resend = useResendCooldown()

 const loginPath = mode === 'owner' ? `/api/t/${slug}/panel/login` : `/api/t/${slug}/panel/staff-login`

 async function send() {
  setBusy(true); setErr('')
  const body = mode === 'owner' ? {} : { phone }
  const res = await fetch(loginPath, {
   method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const d = await res.json().catch(() => ({}))
  setBusy(false)
  if (!res.ok) { setErr(d.error || 'خطا'); return }
  setOtpSent(true); setDevCode(d.dev_code || ''); resend.start()
 }
 async function verify() {
  setBusy(true); setErr('')
  const body = mode === 'owner' ? { code } : { phone, code }
  const res = await fetch(loginPath, {
   method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const d = await res.json().catch(() => ({}))
  setBusy(false)
  if (!res.ok) { setErr(d.error || 'کد نادرست است'); return }
  onSuccess()
 }

 function switchMode(next: 'owner' | 'staff') {
  setMode(next); setOtpSent(false); setCode(''); setDevCode(''); setErr(''); setPhone('')
 }

 return (
  <div className="min-h-screen bg-canvas flex items-center justify-center p-6" dir="rtl">
   <div className="w-full max-w-sm">
    <div className="text-center mb-6">
     <img src="/logo.svg" alt="" className="w-12 h-12 mx-auto mb-3" />
     <h1 className="text-lg font-display font-bold text-ink">ورود به پنل مدیریت</h1>
     <p className="text-xs text-soot mt-1.5 leading-relaxed">
      {mode === 'owner'
       ? 'کد ورود به شماره‌ی موبایل یا ایمیل ثبت‌شده‌ی صاحب این مجموعه فرستاده می‌شود.'
       : 'اگر درمانگر این مجموعه‌اید، شماره‌ی موبایل خودتان را وارد کنید.'}
     </p>
    </div>

    {/* سوییچ صاحب مجموعه / درمانگر — فقط در حالت کلینیک معنا دارد */}
    {multiTherapist && (
     <div className="grid grid-cols-2 gap-2 mb-5 p-1 bg-gray-100 rounded-xl">
      <button onClick={() => switchMode('owner')}
       className={`py-2 rounded-lg text-xs font-medium transition-colors ${mode === 'owner' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
       صاحب مجموعه‌ام
      </button>
      <button onClick={() => switchMode('staff')}
       className={`py-2 rounded-lg text-xs font-medium transition-colors ${mode === 'staff' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
       درمانگرم
      </button>
     </div>
    )}

    {err && <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 mb-3 text-center">{err}</div>}

    {!otpSent ? (
     <div className="space-y-3">
      {mode === 'staff' && (
       <input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" inputMode="tel" autoFocus
        placeholder="09xxxxxxxxx"
        className="w-full p-3 rounded-xl border border-sand text-center tracking-wide focus:outline-none focus:border-ink" />
      )}
      <button onClick={send} disabled={busy || (mode === 'staff' && phone.trim().length < 10)}
       className="w-full py-3 rounded-xl bg-ink text-white font-medium disabled:opacity-50">
       {busy ? 'در حال ارسال…' : 'ارسال کد ورود'}
      </button>
     </div>
    ) : (
     <div className="space-y-3">
      {devCode && (
       <div className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-center">
        کد تست (تا اتصال پیامک): <strong className="text-base">{devCode}</strong>
       </div>
      )}
      <input value={code} onChange={e => setCode(e.target.value)} dir="ltr" inputMode="numeric" autoFocus
       placeholder="کد 5 رقمی"
       className="w-full p-3 rounded-xl border border-sand text-lg text-center tracking-widest focus:outline-none focus:border-ink" />
      <button onClick={verify} disabled={busy || code.trim().length < 5}
       className="w-full py-3 rounded-xl bg-ink text-white font-medium disabled:opacity-40">
       ورود
      </button>
      <div className="text-center">
       {resend.canResend ? (
        <button onClick={send} disabled={busy} className="text-sm text-ink font-medium hover:underline disabled:opacity-40">
         ارسال دوباره‌ی کد
        </button>
       ) : (
        <p className="text-xs text-soot">کد نیامد؟ تا <span className="tnum font-medium text-ink">{toFarsiNum(resend.secondsLeft)}</span> ثانیه‌ی دیگر می‌توانی دوباره درخواست کنی</p>
       )}
      </div>
     </div>
    )}
   </div>
  </div>
 )
}
