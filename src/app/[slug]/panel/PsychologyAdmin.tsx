'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PERSIAN_MONTHS, toLatinNum, getCurrentJalali, getDaysInJalaliMonth, jalaliDateTimeToTimestamp } from '@/lib/calendar'
import { STAGE_TYPE_LABEL, STAGE_STATUS_LABEL } from '@/lib/flow'
import { PRICING, PLATFORM_NAME } from '@/lib/config'
import { ClinicSettings, DEFAULT_SETTINGS, SessionMode, OfficeLocation, PaymentCardInfo } from '@/lib/settings'
import { IntakeForm, FormField, FormFieldType, DEFAULT_INTAKE_FORM, LEGACY_DETAIL_LABELS, CancellationPolicy, PaymentMethods, Pricing, DEFAULT_PRICING, INTAKE_KNOWN_COLUMNS, fieldVisible } from '@/lib/psy'
import { DialogHost, uiAlert, uiConfirm, uiPrompt } from '@/components/ui/Dialog'
import { useResendCooldown } from '@/lib/useResendCooldown'

// در پنلِ ادمین همه‌ی ارقام لاتین نمایش داده می‌شوند (فقط نمایش؛ فرمتِ ذخیره دست‌نخورده)
const toFarsiNum = (n: number | string) => toLatinNum(String(n))
const enTime = (t?: string) => toLatinNum(String(t || ''))

// ─── Types ───────────────────────────────────────────────────────────────────

type Patient = {
 id: string
 case_number: string
 // هویتِ مراجع
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
 siblings_info?: string    // سن و تحصیلاتِ خواهر/برادر
 family_members_info?: string // اعضای دیگرِ ساکن
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
 // ستون‌هایی که فرمِ مصاحبه ذخیره می‌کند (رشته‌ای/ترکیبی)
 school_info?: string     // نام مدرسه | مؤسسه | پایه | تلفن
 child_conditions?: string  // ویژگی‌های مراجع (فقط اگر متخصص از فرمِ تفصیلی استفاده کند)
 session_type?: string    // online | offline
 // پاسخ‌های فرمِ رزرو که ستونِ اختصاصی ندارند (کاملاً دیتایی، از فرم‌بیلدر)
 details?: Record<string, any>
 // وضعیت
 status: string
 created_at: string
}

// یک مرحله‌ی پیش‌ازدرمان (مصاحبه/ارزیابی) — هر پرونده هر تعداد از این‌ها می‌تواند داشته باشد
type CaseStage = {
 id: string
 case_number: string
 stage_type: 'interview' | 'assessment'
 status: 'awaiting_payment' | 'payment_submitted' | 'awaiting_booking' | 'booked'
 price: number
 paid: boolean
 payment_submitted?: boolean
 payment_ref?: string
 session_date?: string
 session_time?: string
 held?: boolean
 notes?: string
 cancel_notice?: string
 delay_minutes?: number | null
 resource_id?: string | null
 created_at: string
}

type Booking = {
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

type Package = {
 id: string
 case_number: string
 month: string
 year: string
 primary_sessions: number
 secondary_sessions: number
 primary_session_type: string
 secondary_session_type: string
 notes: string
 status: string
 price?: number
 paid: boolean
 payment_submitted?: boolean
 payment_ref?: string
}

type Session = {
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
 refund_status?: string
 refund_ref?: string
}

type FinanceCats = { interview: number; assessment: number; packages: number; sessions: number }
type FinanceData = {
 totalPaid: number
 totalPending: number
 refundsTotal: number
 refundsCount: number
 netPaid: number
 paid: FinanceCats
 paidCount: FinanceCats
 pending: FinanceCats
 pendingCount: FinanceCats
 split: { online: number; offline: number }
 monthly: { month: string; amount: number }[]
 topCases: { case_number: string; name: string; amount: number }[]
 refundsList: { case_number: string; name: string; amount: number; percent: number; date: string; card: string | null }[]
 settlement: { totalOnline: number; totalCommission: number; autoSettled: number; owed: number; count: number }
}

// یک «منبع» = یک کارمند/دکتر. name/title/avatar_url هویتِ نمایشی؛ phone برای
// ورودِ مستقلِ کارمند به پنل است (اختیاری — خالی یعنی فقط owner برایش کار می‌کند).
type ResourceRow = {
 id: string
 name: string
 title: string
 avatar_url: string | null
 phone: string | null
 is_active: boolean
 is_selectable: boolean
 sort_order: number
}

// پروفایلِ per-resource که در تبِ تنظیمات ویرایش می‌شود
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
}

const ALL_TIMES = ['8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00']

const DEFAULT_PROFILE: ResourceProfileView = {
 resource_id: '', name: '', title: '', avatar_url: '', badges: [], session_modes: 'both', cards: [],
 cancellation_policy: { enabled: true, threshold_hours: 12, early_refund_percent: 50, late_refund_percent: 0 },
 payment_methods: { card_to_card: true, online: false },
 quick_times: ALL_TIMES,
 settlement_sheba: '', settlement_sheba_holder_name: '',
 pricing: DEFAULT_PRICING,
 companion_label: '',
}

// ─── Constants ────────────────────────────────────────────────────────────────


// کلیدِ مرتب‌سازیِ عددیِ ساعت («11:00» → دقیقه) تا ترتیب درست باشد نه الفبایی
function timeKey(t: string): number {
 const [h, m] = toLatinNum(t || '').split(':').map(x => parseInt(x, 10))
 return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
}

// اعتبارسنجی و نرمال‌سازیِ ساعتِ دلخواهِ واردشده‌ی دکتر (مثلاً «9», «9:30», «14:05»، همه با
// رقمِ فارسی یا لاتین) به همان قالبِ لاتینِ استفاده‌شده در ALL_TIMES («9:00»)؛ اگر نامعتبر
// بود null برمی‌گرداند. هیچ‌جا خروجی به رقمِ فارسی تبدیل نمی‌شود.
function parseCustomTime(raw: string): string | null {
 const s = toLatinNum(raw || '').trim()
 const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/)
 if (!m) return null
 const h = parseInt(m[1], 10)
 const min = m[2] ? parseInt(m[2], 10) : 0
 if (h < 0 || h > 23 || min < 0 || min > 59) return null
 return `${h}:${String(min).padStart(2, '0')}`
}

// برچسبِ ترکیبیِ نمایشِ سریعِ یک مرحله («مصاحبه: منتظر پرداخت»)
function stageLabel(s?: CaseStage | null): string {
 if (!s) return '—'
 return `${STAGE_TYPE_LABEL[s.stage_type] || s.stage_type}: ${STAGE_STATUS_LABEL[s.status] || s.status}`
}

const STATUS_LABEL: Record<string, string> = {
 pending: 'در انتظار',
 confirmed: 'تایید شده',
 cancelled: 'کنسل شده',
 forfeited: 'سوخت شده',
 replaced: 'جایگزین شد',
 completed: 'برگزار شده',
 active: 'فعال',
}
const STATUS_COLOR: Record<string, string> = {
 pending: 'bg-amber-500/10 text-amber-600 border border-amber-500/20',
 confirmed: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
 cancelled: 'bg-red-500/10 text-red-600 border border-red-500/20',
 forfeited: 'bg-red-500/10 text-red-600 border border-red-500/20',
 replaced: 'bg-gray-100 text-soot border border-sand',
 completed: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20',
 active: 'bg-sky-500/10 text-sky-600 border border-sky-500/20',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// کارتِ جلسه‌ی مصاحبه/ارزیابی در پرونده — یادداشت + تأیید برگزاری
function StageSessionCard({ stage, index, onSave }: {
 stage: CaseStage; index?: number
 onSave: (stageId: string, notes: string, markHeld: boolean) => Promise<void> | void
}) {
 const [val, setVal] = useState(stage.notes || '')
 const [saving, setSaving] = useState(false)
 const label = (STAGE_TYPE_LABEL[stage.stage_type] || stage.stage_type) + (index && index > 1 ? ` #${index}` : '')
 const icon = stage.stage_type === 'interview' ? '🩺' : '🧩'
 const held = !!stage.held
 const canHold = stage.status === 'booked' && !held
 return (
  <div className="bg-white rounded-xl border border-sand p-3">
   <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-2">
     <span className="text-lg">{icon}</span>
     <div>
      <div className="text-sm font-medium text-ink">{label}</div>
      <div className="text-xs text-soot">{stage.session_date ? `${enTime(stage.session_date)} — ${enTime(stage.session_time)}` : 'زمان ثبت نشده'}</div>
     </div>
    </div>
    <span className={`text-xs px-2 py-0.5 rounded-full ${held ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'}`}>
     {held ? '✅ برگزار شد' : 'برگزار نشده'}
    </span>
   </div>
   <textarea value={val} onChange={e => setVal(e.target.value)} rows={2} placeholder="مطالب و یادداشتِ این جلسه..."
    className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none focus:outline-none focus:border-ink mb-2" />
   <div className="flex gap-2">
    <button onClick={async () => { setSaving(true); await onSave(stage.id, val, false); setSaving(false) }} disabled={saving}
     className="flex-1 py-2 border border-sand text-soot rounded-lg text-sm disabled:opacity-40">ذخیره یادداشت</button>
    {!held && canHold && (
     <button onClick={async () => { if (!await uiConfirm('تأیید برگزاریِ این جلسه؟ پرونده برای تعیینِ مرحله‌ی بعد آزاد می‌شود.')) return; setSaving(true); await onSave(stage.id, val, true); setSaving(false) }} disabled={saving}
      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-40">✅ تایید برگزاری</button>
    )}
   </div>
  </div>
 )
}

function PendingSection({ title, icon, count, children }: { title: string; icon: string; count: number; children: React.ReactNode }) {
 return (
  <div>
   <div className="flex items-center gap-2 mb-3">
    <span className="text-lg">{icon}</span>
    <h3 className="text-sm font-semibold text-ink">{title}</h3>
    <span className={`text-xs px-2 py-0.5 rounded-full ${count > 0 ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-gray-100 text-soot'}`}>{toFarsiNum(count)}</span>
   </div>
   {count === 0 ? (
    <div className="text-center py-6 text-xs text-gray-300 bg-white rounded-xl border border-dashed border-sand">موردی نیست</div>
   ) : (
    <div className="space-y-2">{children}</div>
   )}
  </div>
 )
}

function PendingPayCard({ name, caseNumber, amount, receipt, sub, children }: {
 name: string; caseNumber: string; amount: number; receipt?: string; sub?: string; children: React.ReactNode
}) {
 return (
  <div className="bg-white rounded-xl border border-sand p-4">
   <div className="flex items-start justify-between mb-2">
    <div>
     <div className="flex items-center gap-2">
      <span className="font-medium text-ink text-sm">{name}</span>
      <span className="text-xs px-2 py-0.5 bg-gray-100 text-soot rounded-md font-mono">{caseNumber}</span>
     </div>
     {sub && <div className="text-xs text-soot mt-0.5">{sub}</div>}
    </div>
    <span className="text-sm font-semibold text-amber-600 shrink-0">{amount.toLocaleString('en-US')} ت</span>
   </div>
   {receipt && (
    <div className="bg-gray-50 rounded-lg p-2.5 border border-sand mb-3">
     <p className="text-xs text-soot mb-0.5">فیش واریزی:</p>
     <p className="text-xs text-ink whitespace-pre-wrap break-words">{receipt}</p>
    </div>
   )}
   {children}
  </div>
 )
}

// انتخابگرِ تاریخِ جلالی (سال/ماه/روز) برای بازه‌ی گزارش
function JalaliDateSelect({ value, onChange }: { value: { y: number; m: number; d: number }; onChange: (v: { y: number; m: number; d: number }) => void }) {
 const nowY = getCurrentJalali().year
 const years = [nowY - 3, nowY - 2, nowY - 1, nowY]
 const days = getDaysInJalaliMonth(value.y, value.m - 1)
 const cls = 'text-xs px-2 py-1.5 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink'
 return (
  <div className="flex gap-1">
   <select value={value.y} onChange={e => onChange({ ...value, y: +e.target.value })} className={cls}>
    {years.map(y => <option key={y} value={y}>{toFarsiNum(y)}</option>)}
   </select>
   <select value={value.m} onChange={e => onChange({ ...value, m: +e.target.value })} className={cls}>
    {PERSIAN_MONTHS.map((mn, i) => <option key={i} value={i + 1}>{mn}</option>)}
   </select>
   <select value={value.d} onChange={e => onChange({ ...value, d: Math.min(+e.target.value, days) })} className={cls}>
    {Array.from({ length: days }, (_, i) => i + 1).map(d => <option key={d} value={d}>{toFarsiNum(d)}</option>)}
   </select>
  </div>
 )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
 if (!value) return null
 return (
  <div className="flex gap-2 py-2 border-b border-sand last:border-0">
   <span className="text-xs text-soot w-40 shrink-0">{label}</span>
   <span className="text-sm text-ink">{value}</span>
  </div>
 )
}

// کارتِ بازپرداختِ کنسلی: نمایشِ کارتِ مراجع + ورودیِ فیشِ واریز
function RefundPendingCard({ name, caseNumber, card, amount, onDone }: {
 name: string; caseNumber: string; card: string; amount: number; onDone: (ref: string) => void
}) {
 const [ref, setRef] = useState('')
 const [saving, setSaving] = useState(false)
 return (
  <div className="bg-white rounded-xl border border-sand p-4">
   <div className="flex items-start justify-between mb-2">
    <div className="flex items-center gap-2">
     <span className="font-medium text-ink text-sm">{name}</span>
     <span className="text-xs px-2 py-0.5 bg-gray-100 text-soot rounded-md font-mono">{caseNumber}</span>
    </div>
    <span className="text-sm font-semibold text-amber-600 shrink-0">{amount.toLocaleString('en-US')} ت</span>
   </div>
   <div className="bg-amber-500/10 rounded-lg p-2.5 border border-amber-500/20 mb-3">
    <p className="text-xs text-soot mb-0.5">شماره کارتِ مراجع برای واریز:</p>
    <p dir="ltr" className="font-mono text-sm text-ink tracking-wider text-right">{card || '—'}</p>
   </div>
   <input value={ref} onChange={e => setRef(e.target.value)} placeholder="متنِ فیشِ واریز (کد پیگیری/تاریخ)"
    className="w-full text-sm px-3 py-2 border border-sand rounded-lg mb-2 focus:outline-none focus:border-ink" />
   <button disabled={saving || !ref.trim()}
    onClick={async () => { if (!await uiConfirm(`واریزِ بازپرداختِ ${amount.toLocaleString('en-US')} تومان به کارتِ مراجع ثبت شود؟`)) return; setSaving(true); await onDone(ref); setSaving(false) }}
    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-40">
    {saving ? 'در حال ثبت...' : '✓ ثبتِ واریزِ بازپرداخت'}
   </button>
  </div>
 )
}

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
 return (
  <div className="mb-5">
   <h3 className="text-xs font-semibold text-soot uppercase tracking-wide mb-2 bg-gray-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
    {icon && <span>{icon}</span>}
    {title}
   </h3>
   <div className="px-1">{children}</div>
  </div>
 )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PsychologyAdmin() {
 const router = useRouter()
 const { slug } = useParams<{ slug: string }>()
 const api = (path: string) => `/api/t/${slug}/panel/psy${path}`
 const panelApi = (path: string) => `/api/t/${slug}/panel${path}`
 const [mainTab, setMainTab] = useState<'dashboard' | 'patients' | 'bookings' | 'schedule' | 'settings_hub' | 'finance'>('dashboard')
 const [settingsSubTab, setSettingsSubTab] = useState<'profile' | 'payments' | 'pricing' | 'locations' | 'form' | 'patient_panel' | 'staff' | 'account' | 'tickets'>('profile')
 const [sidebarOpen, setSidebarOpen] = useState(false)

 // ── Patients state ─────────────────────────────────────────────
 const [patients, setPatients] = useState<Patient[]>([])
 const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
 const [patientView, setPatientView] = useState<'list' | 'detail' | 'edit'>('list')
 const [patientTab, setPatientTab] = useState<'info' | 'payment' | 'packages' | 'sessions'>('info')
 const [packages, setPackages] = useState<Package[]>([])
 const [sessions, setSessions] = useState<Session[]>([])
 const [stages, setStages] = useState<CaseStage[]>([])
 const [patientSearch, setPatientSearch] = useState('')
 const [showNewPackage, setShowNewPackage] = useState(false)
 const [showNewSession, setShowNewSession] = useState(false)
 const [showAddPatient, setShowAddPatient] = useState(false)
 const [addPatientSaving, setAddPatientSaving] = useState(false)
 const [newPatientForm, setNewPatientForm] = useState({
  client_name: '', birth_date: '', grade: '', reason: '',
  contact_name: '', contact_phone: '', contact2_name: '', contact2_phone: '',
 })
 const [editSession, setEditSession] = useState<Session | null>(null)
 const [editingPatient, setEditingPatient] = useState<Partial<Patient>>({})
 // فرمِ رزروِ فعلیِ همون دکترِ صاحبِ این پرونده — فقط برای نمایشِ برچسبِ درستِ
 // سوال‌ها (مستقل از تبِ تنظیمات، که فرمِ منبعِ در حالِ ویرایش را نگه می‌دارد)
 const [patientIntakeForm, setPatientIntakeForm] = useState<IntakeForm>(DEFAULT_INTAKE_FORM)
 const [infoOpenSection, setInfoOpenSection] = useState<string | null>(null)
 const [manualFieldLabel, setManualFieldLabel] = useState('')
 const [manualFieldValue, setManualFieldValue] = useState('')

 // ── Bookings state ─────────────────────────────────────────────
 const [bookings, setBookings] = useState<Booking[]>([])

 // ── Pending payments (تب تأیید پرداخت‌ها) ─────────────────────────
 const [pendingPkgs, setPendingPkgs] = useState<Package[]>([])
 const [pendingSess, setPendingSess] = useState<Session[]>([])
 const [pendingRefunds, setPendingRefunds] = useState<Session[]>([])
 const [pendingStages, setPendingStages] = useState<CaseStage[]>([])

 // ── Schedule state ─────────────────────────────────────────────
 const today = getCurrentJalali()
 const [schedMonth, setSchedMonth] = useState(today.month)
 const [schedYear, setSchedYear] = useState(today.year)
 const [selectedDay, setSelectedDay] = useState<number | null>(null)
 const [selectedTimes, setSelectedTimes] = useState<string[]>([])
 const [slotTypes, setSlotTypes] = useState<Record<string, 'online' | 'offline'>>({})
 const [slotLocs, setSlotLocs] = useState<Record<string, string>>({})
 const [customTime, setCustomTime] = useState('')
 const [removeTimeMode, setRemoveTimeMode] = useState(false)
 const [quickTimesSaving, setQuickTimesSaving] = useState(false)
 const [isOff, setIsOff] = useState(false)
 const [schedSaving, setSchedSaving] = useState(false)
 const [schedSaved, setSchedSaved] = useState(false)
 const [schedSubTab, setSchedSubTab] = useState<'edit' | 'agenda'>('edit')
 const [agendaMode, setAgendaMode] = useState<'month' | 'week'>('week')
 const [weekIdx, setWeekIdx] = useState(0)
 const [monthSchedules, setMonthSchedules] = useState<{ date: string; available_times: string[]; is_off: boolean; slot_types?: Record<string, string>; slot_locs?: Record<string, string> }[]>([])
 const [allSessions, setAllSessions] = useState<{ id: string; case_number: string; session_date: string; session_time: string; session_type: string; attendee: string; status: string; delay_minutes?: number | null }[]>([])
 const [allStages, setAllStages] = useState<CaseStage[]>([])

 // ── Loading ────────────────────────────────────────────────────
 const [loading, setLoading] = useState(true)
 const [needsLogin, setNeedsLogin] = useState(false)
 // ── تیکتِ پشتیبانی ────────────────────────────────────────────────────────────
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
  if (!ticketForm.subject.trim() || !ticketForm.message.trim()) { uiAlert('موضوع و متنِ پیام را بنویسید'); return }
  setTicketSubmitting(true)
  try {
   const res = await fetch(panelApi('/tickets'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ticketForm),
   })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { uiAlert(d.error || 'ثبتِ تیکت ناموفق بود'); setTicketSubmitting(false); return }
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

 // ── تغییرِ خودسرویسِ شماره‌ی ورود (owner یا خودِ درمانگر) با تاییدِ OTP ──────────
 async function sendChangePhoneCode() {
  if (!/^09\d{9}$/.test(newPhoneInput.trim())) { uiAlert('شماره‌ی موبایل معتبر نیست'); return }
  setChangePhoneBusy(true)
  try {
   const res = await fetch(panelApi('/change-phone'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_phone: newPhoneInput.trim() }),
   })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { uiAlert(d.error || 'ارسالِ کد ناموفق بود'); setChangePhoneBusy(false); return }
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
   if (!res.ok) { uiAlert(d.error || 'تاییدِ کد ناموفق بود'); setChangePhoneBusy(false); return }
   setChangePhoneOpen(false); setChangePhoneStep('phone'); setNewPhoneInput(''); setChangePhoneCode(''); setChangePhoneDevCode('')
   await loadMe()
   uiAlert('شماره‌ی ورود با موفقیت تغییر کرد.')
  } catch { uiAlert('خطا در ارتباط با سرور') }
  setChangePhoneBusy(false)
 }

 // ── Settings (تنظیماتِ کلینیک + ظاهر) ──────────────────────────
 const [settings, setSettings] = useState<ClinicSettings>(DEFAULT_SETTINGS)
 const [settingsLoaded, setSettingsLoaded] = useState(false)
 const [settingsSaving, setSettingsSaving] = useState(false)
 const [settingsSaved, setSettingsSaved] = useState(false)
 const [darkMode, setDarkMode] = useState(false)
 const [finance, setFinance] = useState<FinanceData | null>(null)
 const [dashboardFinance, setDashboardFinance] = useState<FinanceData | null>(null)
 const [dashboardLoaded, setDashboardLoaded] = useState(false)
 const [financeLoaded, setFinanceLoaded] = useState(false)
 const [financeRange, setFinanceRange] = useState<'all' | '1m' | '3m' | '6m' | '12m' | 'custom'>('6m')
 const [financeFromIso, setFinanceFromIso] = useState('')
 const [financeToIso, setFinanceToIso] = useState('')
 const [financeCustomOpen, setFinanceCustomOpen] = useState(false)
 const [fromJ, setFromJ] = useState(() => { const t = getCurrentJalali(); return { y: t.year, m: t.month + 1, d: 1 } })
 const [toJ, setToJ] = useState(() => { const t = getCurrentJalali(); return { y: t.year, m: t.month + 1, d: t.day } })

 // ── چندکارمندی: کی وارد شده (صاحبِ مجموعه یا یک کارمندِ مشخص)؟ ──
 const [me, setMe] = useState<{ isOwner: boolean; resourceId: string | null; resourceName: string | null; phone: string | null; slug: string | null } | null>(null)
 const [changePhoneOpen, setChangePhoneOpen] = useState(false)
 const [newPhoneInput, setNewPhoneInput] = useState('')
 const [changePhoneCode, setChangePhoneCode] = useState('')
 const [changePhoneStep, setChangePhoneStep] = useState<'phone' | 'code'>('phone')
 const [changePhoneBusy, setChangePhoneBusy] = useState(false)
 const [changePhoneDevCode, setChangePhoneDevCode] = useState('')
 const [staffList, setStaffList] = useState<ResourceRow[]>([])
 const [staffLoaded, setStaffLoaded] = useState(false)
 // owner: کدام کارمند را می‌بینیم؟ '' = همه (پرونده‌ها) — برنامه/پروفایل همیشه یک نفرِ مشخص لازم دارد
 const [viewingResourceId, setViewingResourceId] = useState<string>('')
 // پروفایلِ per-resource (نام/عنوان/آواتار/بج/نوعِ جلسه/کارت) — جایگزینِ فیلدهای قدیمیِ settings
 const [profile, setProfile] = useState<ResourceProfileView>(DEFAULT_PROFILE)
 const [profileLoaded, setProfileLoaded] = useState(false)
 const [profileSaving, setProfileSaving] = useState(false)
 const [profileSaved, setProfileSaved] = useState(false)
 const [tenantPlan, setTenantPlan] = useState<string>('free')
 // فرمِ رزروِ per-resource (بخش‌ها/سوال‌ها/نوع/اجباری‌بودن — کاملاً دیتایی)
 const [intakeForm, setIntakeForm] = useState<IntakeForm>(DEFAULT_INTAKE_FORM)
 const [intakeLoaded, setIntakeLoaded] = useState(false)
 const [intakeSaving, setIntakeSaving] = useState(false)
 const [intakeSaved, setIntakeSaved] = useState(false)
 // متنِ زیرسوالِ تازه‌ای که دکتر داره برای هر گزینه می‌نویسه (کلید: fieldId:option)
 const [newSubQuestion, setNewSubQuestion] = useState<Record<string, string>>({})
 // فرم‌بیلدرِ استادو-جزئیات: کدام سوال/بخش الان در پنلِ ویرایش انتخاب شده
 const [builderSel, setBuilderSel] = useState<{ sIdx: number; fIdx: number | null } | null>(null)
 // کدام بخش تو لیست بازه (آکاردئون — فقط یکی هم‌زمان)
 const [openSection, setOpenSection] = useState<string | null>(null)
 // درگ‌اند‌دراپِ جابه‌جاییِ سوال/بخش تو لیست
 const [dragField, setDragField] = useState<{ sIdx: number; fIdx: number } | null>(null)
 const [dragOverField, setDragOverField] = useState<{ sIdx: number; fIdx: number } | null>(null)
 const [dragSectionIdx, setDragSectionIdx] = useState<number | null>(null)
 const [dragOverSectionIdx, setDragOverSectionIdx] = useState<number | null>(null)

 // ── Package / Session forms ────────────────────────────────────
 const [newPkg, setNewPkg] = useState({
  month: '1', year: '1404',
  primary_sessions: 8, secondary_sessions: 2,
  primary_session_type: 'offline', secondary_session_type: 'offline', notes: ''
 })
 const [newSess, setNewSess] = useState({
  title: 'ارزیابی', customTitle: '', session_type: 'offline', attendee: 'primary', paid: true
 })
 const [sessForm, setSessForm] = useState({
  session_goals: '', session_summary: '',
  doctor_notes_private: '', doctor_note_for_patient: '', status: 'confirmed'
 })

 // ─── Data fetching ───────────────────────────────────────────────────────────

 // چه کسی وارد شده؟ (owner یا یک کارمندِ مشخص) — تعیین می‌کند تبِ «کارمندها» و
 // سوییچرِ منبع نمایش داده شوند یا نه
 const loadMe = useCallback(async () => {
  try {
   const r = await fetch(panelApi('/whoami'), { cache: 'no-store' })
   if (r.status === 401) { setNeedsLogin(true); return }
   const d = await r.json()
   setMe({ isOwner: !!d.isOwner, resourceId: d.resourceId || null, resourceName: d.resourceName || null, phone: d.phone || null, slug: d.slug || null })
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

 const [staffForm, setStaffForm] = useState<{ id: string; name: string; title: string; phone: string }>({ id: '', name: '', title: '', phone: '' })
 const [staffFormOpen, setStaffFormOpen] = useState(false)
 const [staffSaving, setStaffSaving] = useState(false)

 function openNewStaffForm() { setStaffForm({ id: '', name: '', title: '', phone: '' }); setStaffFormOpen(true) }
 function openEditStaffForm(r: ResourceRow) { setStaffForm({ id: r.id, name: r.name, title: r.title, phone: r.phone || '' }); setStaffFormOpen(true) }

 async function saveStaffMember() {
  if (!staffForm.name.trim()) { uiAlert('نام لازم است'); return }
  setStaffSaving(true)
  try {
   const method = staffForm.id ? 'PATCH' : 'POST'
   const res = await fetch(panelApi('/resources'), {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: staffForm.id || undefined, name: staffForm.name, title: staffForm.title, phone: staffForm.phone }),
   })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { uiAlert(d.error || 'ذخیره نشد'); setStaffSaving(false); return }
   setStaffFormOpen(false)
   await loadStaff()
  } catch (e: any) {
   uiAlert('خطای شبکه: ' + (e?.message || e))
  }
  setStaffSaving(false)
 }

 async function deactivateStaffMember(id: string) {
  const ok = await uiConfirm('این درمانگر غیرفعال شود؟ پرونده‌های قبلی‌اش دست‌نخورده می‌ماند.')
  if (!ok) return
  const res = await fetch(panelApi('/resources'), {
   method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) { uiAlert(d.error || 'حذف نشد'); return }
  await loadStaff()
 }

 const fetchAll = useCallback(async () => {
  setLoading(true)
  const casesUrl = viewingResourceId ? api(`/cases?resource_id=${viewingResourceId}`) : api('/cases')
  const [pRes, bRes] = await Promise.all([
   fetch(casesUrl, { cache: 'no-store' }),
   fetch(casesUrl, { cache: 'no-store' }),
  ])
  if (pRes.status === 401) { setNeedsLogin(true); return }
  const pData = await pRes.json()
  setPatients(pData.bookings || [])
  setBookings(pData.bookings || [])
  loadPendingPayments()
  loadMe()
  setLoading(false)
 }, [router, viewingResourceId])

 // پرداخت‌های منتظرِ تأیید (پروتکل‌های درمان و جلسه‌های جایگزین) در همه‌ی پرونده‌ها
 async function loadPendingPayments() {
  try {
   const [pkgRes, sessRes, refundRes, stageRes] = await Promise.all([
    fetch(api('/packages?pending=1'), { cache: 'no-store' }),
    fetch(api('/sessions?pending=1'), { cache: 'no-store' }),
    fetch(api('/sessions?refunds=1'), { cache: 'no-store' }),
    fetch(api('/stages?pending=1'), { cache: 'no-store' }),
   ])
   const pkg = await pkgRes.json().catch(() => ({}))
   const sess = await sessRes.json().catch(() => ({}))
   const refunds = await refundRes.json().catch(() => ({}))
   const stg = await stageRes.json().catch(() => ({}))
   setPendingPkgs(pkg.packages || [])
   setPendingSess(sess.sessions || [])
   setPendingRefunds(refunds.sessions || [])
   setPendingStages(stg.stages || [])
  } catch {}
 }

 useEffect(() => { fetchAll(); loadSettings(); loadProfile() }, [fetchAll])

 async function loadPatientData(case_number: string) {
  const [pkgRes, sessRes, stageRes] = await Promise.all([
   fetch(api(`/packages?case_number=${case_number}`), { cache: 'no-store' }),
   fetch(api(`/sessions?case_number=${case_number}`), { cache: 'no-store' }),
   fetch(api(`/stages?case_number=${case_number}`), { cache: 'no-store' }),
  ])
  const pkgData = await pkgRes.json()
  const sessData = await sessRes.json()
  const stageData = await stageRes.json()
  setPackages(pkgData.packages || [])
  setSessions(sessData.sessions || [])
  setStages(stageData.stages || [])
 }

 async function openPatient(p: Patient) {
  setSelectedPatient(p)
  setPatientView('detail')
  setPatientTab('info')
  setInfoOpenSection(null)
  await Promise.all([loadPatientData(p.case_number), loadPatientIntakeForm((p as any).resource_id)])
 }

 // فرمِ رزروِ صاحبِ این پرونده رو فقط برای نمایش/برچسب می‌خونه — چیزی رو تو
 // تبِ تنظیمات دست‌نخورده می‌ذاره
 async function loadPatientIntakeForm(resourceId?: string | null) {
  try {
   const url = resourceId ? api(`/intake-form?resource_id=${resourceId}`) : api('/intake-form')
   const res = await fetch(url, { cache: 'no-store' })
   const data = await res.json().catch(() => ({}))
   setPatientIntakeForm(res.ok && data.form ? data.form : DEFAULT_INTAKE_FORM)
  } catch { setPatientIntakeForm(DEFAULT_INTAKE_FORM) }
 }

 // مقدارِ فعلیِ یک فیلد برای این پرونده — یا از ستونِ واقعی یا از details
 function patientFieldValue(p: Partial<Patient>, fieldId: string): unknown {
  if ((INTAKE_KNOWN_COLUMNS as readonly string[]).includes(fieldId)) return (p as any)[fieldId]
  return (p.details || {})[fieldId]
 }

 // همه‌ی پاسخ‌های این پرونده (ستون‌های واقعی + details) — برای چکِ showIf
 function patientAnswers(p: Partial<Patient>): Record<string, unknown> {
  const known: Record<string, unknown> = {}
  for (const k of INTAKE_KNOWN_COLUMNS) known[k] = (p as any)[k]
  return { ...(p.details || {}), ...known }
 }

 // ─── Patient edit ────────────────────────────────────────────────────────────

 function startEdit(p: Patient) {
  setEditingPatient({ ...p })
  setPatientView('edit')
 }

 async function savePatient() {
  await fetch(api('/cases'), {
   method: 'PATCH',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify(editingPatient),
  })
  await fetchAll()
  const updated = { ...selectedPatient, ...editingPatient } as Patient
  setSelectedPatient(updated)
  setPatientView('detail')
 }

 // ─── Package & Session ───────────────────────────────────────────────────────

 async function createPackage() {
  if (!selectedPatient) return
  await fetch(api('/packages'), {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ ...newPkg, case_number: selectedPatient.case_number }),
  })
  setShowNewPackage(false)
  await loadPatientData(selectedPatient.case_number)
  fetchAll()
 }

 // حذفِ کاملِ یک پروتکلِ درمان (مثلاً اگر دکتر اشتباهی ثبتش کرده بود). جلسه‌های
 // این پروتکل حذف نمی‌شوند، فقط از این پروتکل جدا می‌شوند (جلسه‌ی تکیِ بی‌عنوان).
 async function deletePackage(pkg: Package) {
  if (!await uiConfirm(`پروتکل درمانِ «${PERSIAN_MONTHS[parseInt(pkg.month) - 1]} ${pkg.year}» برای همیشه حذف شود؟ جلسه‌های ثبت‌شده‌ی این پروتکل حذف نمی‌شوند، فقط از آن جدا می‌مانند.`)) return
  const res = await fetch(api('/packages'), {
   method: 'DELETE', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: pkg.id }),
  })
  if (!res.ok) { uiAlert('حذف ناموفق بود'); return }
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
 }

 // حذفِ کاملِ یک پرونده (با تأیید)
 async function deletePatient(p: Patient) {
  if (!await uiConfirm(`پرونده‌ی «${p.client_name}» (${p.case_number}) و همه‌ی پروتکل‌های درمان و جلسه‌هایش برای همیشه حذف شود؟`)) return
  const res = await fetch(api('/cases'), {
   method: 'DELETE', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: p.id }),
  })
  if (!res.ok) { uiAlert('حذف ناموفق بود'); return }
  if (selectedPatient?.id === p.id) { setSelectedPatient(null); setPatientView('list') }
  fetchAll()
 }

 // افزودنِ پرونده‌ی دستی
 async function createPatient() {
  if (!newPatientForm.client_name.trim()) { uiAlert('نامِ مراجع را وارد کنید'); return }
  if (!newPatientForm.contact_phone.trim() && !newPatientForm.contact2_phone.trim()) { uiAlert('حداقل یک شماره تماس وارد کنید'); return }
  setAddPatientSaving(true)
  try {
   const res = await fetch(api('/cases'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...newPatientForm, ...(me?.isOwner && viewingResourceId ? { resource_id: viewingResourceId } : {}) }),
   })
   const data = await res.json().catch(() => ({}))
   setAddPatientSaving(false)
   if (!res.ok) { uiAlert((data.error || 'ثبت پرونده ناموفق بود') + (data.detail ? `\n\n(جزئیاتِ فنی: ${data.detail})` : '')); return }
   setShowAddPatient(false)
   setNewPatientForm({ client_name: '', birth_date: '', grade: '', reason: '', contact_name: '', contact_phone: '', contact2_name: '', contact2_phone: '' })
   await fetchAll()
   if (data.booking) { setSelectedPatient(data.booking); await Promise.all([loadPatientData(data.booking.case_number), loadPatientIntakeForm(data.booking.resource_id)]); setPatientView('detail') }
  } catch (e: any) {
   setAddPatientSaving(false)
   uiAlert('خطای شبکه: ' + (e?.message || e))
  }
 }

 // تأیید پرداختِ کارت‌به‌کارتِ پروتکل درمان → مراجع می‌تواند روزهای جلسات را انتخاب کند
 async function confirmPackagePayment(pkgId: string) {
  if (!await uiConfirm('پرداختِ پروتکل درمان تأیید شود؟ پس از تأیید، مراجع می‌تواند روزهای جلسات را انتخاب کند.')) return
  const res = await fetch(api('/packages'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: pkgId, paid: true }),
  })
  if (!res.ok) { uiAlert('خطا در تأیید پرداخت'); return }
  loadPendingPayments()
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
 }

 async function createSession() {
  if (!selectedPatient) return
  const title = newSess.title === 'دلخواه' ? newSess.customTitle.trim() : newSess.title
  if (newSess.title === 'دلخواه' && !title) { uiAlert('عنوانِ دلخواه را بنویسید.'); return }
  const payload = {
   case_number: selectedPatient.case_number,
   title, session_date: '', session_time: '',
   session_type: newSess.session_type, attendee: newSess.attendee,
   package_id: null, paid: newSess.paid,
  }
  await fetch(api('/sessions'), {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify(payload),
  })
  setShowNewSession(false)
  setNewSess({ title: 'ارزیابی', customTitle: '', session_type: 'offline', attendee: 'primary', paid: true })
  await loadPatientData(selectedPatient.case_number)
  loadAllSessions()
 }

 // تأیید پرداختِ جلسه‌ی جایگزین
 async function confirmSessionPayment(sessionId: string) {
  if (!await uiConfirm('پرداختِ جلسه‌ی جایگزین تأیید شود؟')) return
  await fetch(api('/sessions'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: sessionId, paid: true }),
  })
  loadPendingPayments()
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
 }

 // ثبتِ بازپرداختِ کنسلی به‌همراهِ فیشِ واریز
 async function markRefunded(sessionId: string, refundRef: string) {
  await fetch(api('/sessions'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: sessionId, refund_status: 'done', refund_ref: refundRef.trim() }),
  })
  await loadPendingPayments()
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
 }

 async function saveSession() {
  if (!editSession) return
  await fetch(api('/sessions'), {
   method: 'PATCH',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: editSession.id, ...sessForm }),
  })
  setEditSession(null)
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
  loadAllSessions()
 }

 // حذفِ کاملِ یک جلسه (مثلاً اگر دکتر اشتباهی ثبتش کرده بود)
 async function deleteSession() {
  if (!editSession) return
  if (!await uiConfirm('این جلسه برای همیشه حذف شود؟ این کار بازگشت‌پذیر نیست.')) return
  await fetch(api('/sessions'), {
   method: 'DELETE', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: editSession.id }),
  })
  setEditSession(null)
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
  loadAllSessions()
 }

 // تأیید پرداختِ یک مرحله (مصاحبه/ارزیابی) → باز شدنِ گرفتنِ وقت
 async function confirmStagePayment(stageId: string, stageType: 'interview' | 'assessment') {
  const label = STAGE_TYPE_LABEL[stageType] || stageType
  if (!await uiConfirm(`پرداختِ ${label} تأیید شود؟ پس از تأیید، مراجع می‌تواند وقت بگیرد.`)) return
  const res = await fetch(api('/stages'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: stageId, confirm_payment: true }),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  fetchAll()
 }

 // ردِ پرداختِ یک مرحله → بازگشت به مرحله‌ی پرداخت تا مراجع دوباره واریز کند
 async function rejectStagePayment(stageId: string) {
  const r = await uiPrompt('دلیل ردِ پرداخت را بنویسید (برای مراجع نمایش داده می‌شود):', { required: true })
  if (r === null) return
  const reason = r.trim()
  if (!reason) { uiAlert('لطفاً دلیل را بنویسید.'); return }
  const res = await fetch(api('/stages'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: stageId, reject_payment: true, reject_reason: reason }),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  await loadPendingPayments(); fetchAll()
 }

 // ردِ پرداختِ پروتکل درمان → مراجع باید دوباره واریز کند
 async function rejectPackagePayment(pkgId: string) {
  const r = await uiPrompt('دلیلِ ردِ پرداختِ این پروتکل درمان را بنویسید (مراجع باید دوباره کارت‌به‌کارت کند):', { required: true })
  if (r === null) return
  const res = await fetch(api('/packages'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: pkgId, payment_submitted: false, paid: false, notes: `پرداخت رد شد: ${r.trim()}` }),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  await loadPendingPayments()
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
 }

 // ردِ پرداختِ جلسه‌ی جایگزین → مراجع باید دوباره واریز کند
 async function rejectSessionPayment(sessionId: string) {
  const r = await uiPrompt('دلیلِ ردِ پرداختِ این جلسه را بنویسید (مراجع باید دوباره کارت‌به‌کارت کند):', { required: true })
  if (r === null) return
  const res = await fetch(api('/sessions'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: sessionId, payment_submitted: false, paid: false, doctor_note_for_patient: `پرداخت تأیید نشد: ${r.trim()}` }),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  await loadPendingPayments()
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
 }

 // ذخیره‌ی یادداشت و/یا تأییدِ برگزاریِ یک مرحله — بعد از این، پرونده آزاد می‌شود
 // تا دکتر مرحله‌ی بعد را (اگر خواست) مشخص کند
 async function saveStageSession(stageId: string, notes: string, markHeld: boolean) {
  const patch: Record<string, any> = { id: stageId, notes }
  if (markHeld) patch.mark_held = true
  const res = await fetch(api('/stages'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  })
  if (!res.ok) { uiAlert('خطا در ثبت'); return }
  await fetchAll()
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
 }

 // ─── Schedule ────────────────────────────────────────────────────────────────

 const daysInMonth = getDaysInJalaliMonth(schedYear, schedMonth)

 // ── کمک‌توابعِ برنامه ───────────────────────────────────────────
 const childNameOf = (cn: string) => bookings.find(b => b.case_number === cn)?.client_name || cn
 const schedForDay = (d: number) => monthSchedules.find(s => s.date === `${schedYear}/${schedMonth + 1}/${d}`)

 // یک ردیفِ جلسه (هم برای «جلسات تکی» هم برای جلسه‌هایِ زیرِ هر پروتکلِ درمان)
 function renderSessionList(list: Session[]) {
  const sorted = [...list].sort((a, b) => (a.session_number || 0) - (b.session_number || 0))
  let n = 0
  return sorted.map((s) => {
   const active = s.status !== 'forfeited' && s.status !== 'replaced' && s.status !== 'cancelled'
   const num = active ? ++n : null
   return (
    <div key={s.id} onClick={() => { setEditSession(s); setSessForm({ session_goals: s.session_goals || '', session_summary: s.session_summary || '', doctor_notes_private: s.doctor_notes_private || '', doctor_note_for_patient: s.doctor_note_for_patient || '', status: s.status || 'confirmed' }) }}
     className="bg-white rounded-xl border border-sand p-3 cursor-pointer hover:border-sand transition-all">
     <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
       <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${num ? 'bg-sand text-ink' : 'bg-gray-100 text-soot'}`}>{num ? toFarsiNum(num) : '—'}</div>
       <div>
        {s.title && <div className="text-xs font-medium text-ink mb-0.5">{s.title}</div>}
        <div className="text-sm font-medium text-ink">
         {s.session_date ? `${enTime(s.session_date)} — ${enTime(s.session_time)}` : (
          <span className="text-amber-600 font-normal">{s.paid ? 'منتظرِ نوبت‌گیریِ مراجع' : 'منتظرِ پرداخت و نوبت‌گیریِ مراجع'}</span>
         )}
        </div>
        <div className="text-xs text-soot">
         {s.attendee === 'secondary' ? `👥 ${profile.companion_label || 'همراه'}` : '🧑 مراجع'} •
         {s.session_type === 'online' ? ' آنلاین' : ' حضوری'}
        </div>
       </div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[s.status] || 'bg-gray-100 text-soot'}`}>
       {STATUS_LABEL[s.status] || s.status}
      </span>
     </div>
     {s.session_summary && (
      <div className="mt-2 bg-gray-100 rounded-lg p-2 border border-sand">
       <p className="text-xs text-ink mb-0.5">شرح جلسه:</p>
       <p className="text-xs text-ink line-clamp-2">{s.session_summary}</p>
      </div>
     )}
     {!s.paid && s.payment_submitted && (
      <div className="mt-2 text-xs text-ink" onClick={e => e.stopPropagation()}>
       پرداختِ جایگزین اعلام شد{s.payment_ref ? ` — ${s.payment_ref}` : ''} — تأیید از تبِ «تأیید پرداخت‌ها»
      </div>
     )}
     {!s.paid && !s.payment_submitted && active && (
      <div className="mt-2 text-xs text-soot" onClick={e => e.stopPropagation()}>در انتظارِ پرداختِ مراجع</div>
     )}
     {s.refund_status === 'pending' && (
      <div className="mt-2 text-xs text-soot" onClick={e => e.stopPropagation()}>
       بازپرداختِ {toFarsiNum(s.refund_percent || 50)}٪ — در انتظارِ واریز (از تبِ «تأیید پرداخت‌ها» انجام می‌شود)
      </div>
     )}
     {s.refund_status === 'done' && (
      <div className="mt-2 text-xs text-ink" onClick={e => e.stopPropagation()}>بازپرداخت واریز شد{s.refund_ref ? ` — ${s.refund_ref}` : ''}</div>
     )}
    </div>
   )
  })
 }

 // همه‌ی نوبت‌های یک تاریخ (مصاحبه + ارزیابی + جلسه) مرتب‌شده بر اساس ساعت
 function apptsForDate(dateStr: string) {
  const out: { time: string; name: string; type: string; mode?: string; loc?: string; color: string; kind: 'interview' | 'assessment' | 'session'; id: string; caseNumber: string; delayMinutes?: number | null }[] = []
  const bookingByCase = new Map(bookings.map(b => [b.case_number, b]))
  for (const s of allStages) {
   if (s.session_date === dateStr && s.session_time && s.status === 'booked') {
    const b = bookingByCase.get(s.case_number)
    out.push({
     time: s.session_time, name: childNameOf(s.case_number),
     type: STAGE_TYPE_LABEL[s.stage_type] || s.stage_type,
     mode: b?.session_type, loc: b?.office_location,
     color: s.stage_type === 'assessment' ? 'bg-violet-500/10 text-violet-600 border-violet-500/20' : 'bg-sky-500/10 text-sky-600 border-sky-500/20',
     kind: s.stage_type, id: s.id, caseNumber: s.case_number, delayMinutes: s.delay_minutes,
    })
   }
  }
  for (const s of allSessions) {
   if (s.session_date === dateStr && s.session_time && s.status !== 'cancelled' && s.status !== 'forfeited' && s.status !== 'replaced')
    out.push({ time: s.session_time, name: childNameOf(s.case_number), type: s.attendee === 'secondary' ? `جلسه (${profile.companion_label || 'همراه'})` : 'جلسه (مراجع)', mode: s.session_type, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', kind: 'session', id: s.id, caseNumber: s.case_number, delayMinutes: s.delay_minutes })
  }
  return out.sort((a, b) => timeKey(a.time) - timeKey(b.time))
 }

 // اعلامِ تاخیر برای یک نوبتِ رزروشده — مراجع در پنلِ خودش می‌بیند
 async function announceDelay(appt: { kind: 'interview' | 'assessment' | 'session'; id: string; name: string; delayMinutes?: number | null }) {
  const r = await uiPrompt(`تاخیرِ نوبتِ «${appt.name}» به دقیقه (برای پاک‌کردنِ تاخیرِ قبلی، عدد 0 بزن):`,
   { defaultValue: appt.delayMinutes ? String(appt.delayMinutes) : '' })
  if (r === null) return
  const n = parseInt(String(r).trim(), 10)
  if (isNaN(n) || n < 0) { uiAlert('عددِ معتبر (0 یا بیشتر) وارد کن.'); return }
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

 // لغوِ یک نوبت توسط مطب → کاربر بدونِ پرداختِ اضافه دوباره وقت می‌گیرد
 async function cancelAppointment(appt: { kind: 'interview' | 'assessment' | 'session'; id: string; name: string }) {
  const notice = await uiPrompt(`لغوِ نوبتِ «${appt.name}». پیامی برای مراجع بنویسید (اختیاری):`,
   { defaultValue: 'نوبتِ شما توسط مطب لغو شد. لطفاً بدون پرداختِ اضافه، زمانِ جدیدی انتخاب کنید.' })
  if (notice === null) return
  const msg = notice.trim() || 'نوبتِ شما توسط مطب لغو شد. لطفاً زمانِ جدیدی انتخاب کنید.'
  if (appt.kind === 'session') {
   await fetch(api('/sessions'), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: appt.id, session_date: '', session_time: '', doctor_note_for_patient: msg }),
   })
  } else {
   await fetch(api('/stages'), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: appt.id, clear_booking: true, cancel_notice: msg }),
   })
  }
  await Promise.all([fetchAll(), loadAllSessions(), loadAllStages()])
 }

 // لغوِ همه‌ی نوبت‌های یک روز
 async function cancelDay(dateStr: string, appts: { kind: 'interview' | 'assessment' | 'session'; id: string; name: string }[]) {
  if (appts.length === 0) return
  if (!await uiConfirm(`همه‌ی ${appts.length} نوبتِ این روز لغو شود؟ به همه‌ی مراجعان اطلاع داده می‌شود تا دوباره وقت بگیرند.`)) return
  const msg = 'نوبتِ شما توسط مطب لغو شد. لطفاً بدون پرداختِ اضافه، زمانِ جدیدی انتخاب کنید.'
  for (const a of appts) {
   if (a.kind === 'session') {
    await fetch(api('/sessions'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: a.id, session_date: '', session_time: '', doctor_note_for_patient: msg }) })
   } else {
    await fetch(api('/stages'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: a.id, clear_booking: true, cancel_notice: msg }) })
   }
  }
  await Promise.all([fetchAll(), loadAllSessions(), loadAllStages()])
 }



 function changeMonth(dir: number) {
  let m = schedMonth + dir, y = schedYear
  if (m < 0) { m = 11; y-- }
  if (m > 11) { m = 0; y++ }
  setSchedMonth(m); setSchedYear(y)
  setSelectedDay(null); setSelectedTimes([]); setIsOff(false)
  setWeekIdx(0)
  loadMonthSchedules(m, y)
 }

 // owner با viewingResourceId مشخص می‌کند برنامه‌ی کدام دکتر را می‌بیند/ویرایش می‌کند
 const scheduleResourceQS = () => (me?.isOwner && viewingResourceId) ? `&resource_id=${viewingResourceId}` : ''

 // برنامه‌ی کلِ ماه را بخوان تا روزهای تقویم رنگی شوند
 async function loadMonthSchedules(month: number, year: number) {
  try {
   const res = await fetch(api(`/schedule?year=${year}&month=${month + 1}${scheduleResourceQS()}`), { cache: 'no-store' })
   const data = await res.json()
   setMonthSchedules(data.schedules || [])
  } catch {}
 }

 // همه‌ی جلسه‌های زمان‌بندی‌شده را بخوان (برای نمای برنامه)
 async function loadAllSessions() {
  try {
   const res = await fetch(api('/sessions?all=1'), { cache: 'no-store' })
   const data = await res.json()
   setAllSessions(data.sessions || [])
  } catch {}
 }

 // همه‌ی مراحلِ رزروشده (مصاحبه/ارزیابی) را بخوان (برای نمای برنامه)
 async function loadAllStages() {
  try {
   const res = await fetch(api('/stages?all=1'), { cache: 'no-store' })
   const data = await res.json()
   setAllStages(data.stages || [])
  } catch {}
 }

 // تازه‌سازیِ رزروها بدونِ لودینگِ کلی (برای به‌روزماندنِ تعدادِ نوبتِ تقویم)
 async function refreshBookings() {
  try {
   const res = await fetch(api('/cases'), { cache: 'no-store' })
   if (res.status === 401) { setNeedsLogin(true); return }
   const data = await res.json()
   setBookings(data.bookings || [])
  } catch {}
 }

 // ماژول‌های پنلِ مراجع (روشن/خاموش)
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
  if (mainTab === 'dashboard') { loadAllSessions(); loadAllStages(); if (!profileLoaded) loadProfile(); loadDashboardFinance() }
  if (mainTab === 'schedule') { loadMonthSchedules(schedMonth, schedYear); loadAllSessions(); loadAllStages(); refreshBookings(); if (!profileLoaded) loadProfile() }
  if (mainTab === 'settings_hub') {
   if (!settingsLoaded) loadSettings()
   loadProfile()
   loadIntakeForm()
   if (me?.isOwner !== false && !patientFeaturesLoaded) loadPatientFeatures()
   if (me?.isOwner && !staffLoaded) loadStaff()
   loadTickets()
  }
  if (mainTab === 'finance') loadFinance()
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [mainTab, viewingResourceId])

 // ── دارک‌مود: از localStorage بخوان و روی پنل اعمال کن ──────────
 useEffect(() => {
  const saved = typeof window !== 'undefined' && localStorage.getItem('pb_admin_dark') === '1'
  setDarkMode(saved)
 }, [])

 function toggleDark(on: boolean) {
  setDarkMode(on)
  try { localStorage.setItem('pb_admin_dark', on ? '1' : '0') } catch {}
 }

 // ── تنظیماتِ سطحِ tenant (فقط آدرس‌های مطب — مشترکِ همه‌ی دکترها) ─
 // ── ردِ تغییرات: تا دکمه‌ی ذخیره فقط وقتی نشان داده شود که واقعاً چیزی عوض شده ──
 const [settingsSnapshot, setSettingsSnapshot] = useState('')
 const [profileSnapshot, setProfileSnapshot] = useState('')
 const [intakeSnapshot, setIntakeSnapshot] = useState('')
 const isSettingsDirty = settingsLoaded && JSON.stringify(settings) !== settingsSnapshot
 const isProfileDirty = profileLoaded && JSON.stringify(profile) !== profileSnapshot
 const isIntakeDirty = intakeLoaded && JSON.stringify(intakeForm) !== intakeSnapshot
 const isSettingsTabDirty = isSettingsDirty || isProfileDirty || isIntakeDirty

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
   if (!res.ok) { uiAlert((data.error || 'ذخیره‌ی تنظیمات ناموفق بود') + (data.detail ? `\n\n(جزئیاتِ فنی: ${data.detail})` : '')); setSettingsSaving(false); return }
   const next = data.settings ? { ...DEFAULT_SETTINGS, ...data.settings } : settings
   if (data.settings) setSettings(next)
   setSettingsSnapshot(JSON.stringify(next))
   setSettingsSaved(true)
   setTimeout(() => setSettingsSaved(false), 2500)
  } catch {}
  setSettingsSaving(false)
 }

 // ── پروفایلِ per-resource (نام/عنوان/آواتار/بج/نوعِ جلسه/کارت) ────
 // owner با viewingResourceId انتخاب می‌کند پروفایلِ کدام دکتر را می‌بیند
 // (خالی = تنها/اولین دکتر، دقیقاً رفتارِ تک‌دکترهای فعلی)؛ کارمند همیشه پروفایلِ خودش.
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
   if (!res.ok) { const d = await res.json().catch(() => ({})); uiAlert((d.error || 'ذخیره نشد') + (d.detail ? `\n\n(جزئیاتِ فنی: ${d.detail})` : '')); setProfileSaving(false); return }
   setProfileSnapshot(JSON.stringify(profile))
   setProfileSaved(true)
   setTimeout(() => setProfileSaved(false), 2500)
  } catch {}
  setProfileSaving(false)
 }

 const patchProfile = (p: Partial<ResourceProfileView>) => setProfile(s => ({ ...s, ...p }))

 // ذخیره‌ی مستقلِ لیستِ «ساعت‌های سریع» — بلافاصله پس از افزودن/حذف در تبِ
 // «روزهای کاری» (نه منتظرِ دکمه‌ی «ذخیره‌ی تغییرات»ِ تبِ تنظیماتِ سایت که
 // برایِ بقیه‌ی فیلدهای پروفایل است). هر دکتر لیستِ خودش را مستقل ویرایش می‌کند.
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

 // ── فرمِ رزرو (per-resource) ───────────────────────────────────────────────
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

 // سوال‌هایی که می‌توانند «شرط» یک سوالِ بعدی باشند: فقط تک‌گزینه‌ای/چندگزینه‌ای، و فقط آن‌هایی که قبل از این سوال آمده‌اند
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
 // همه‌ی سوال‌هایی که بعدِ این سوال می‌آیند — برای وصل‌کردنِ «این گزینه، کدام سوال‌های بعدی رو نشون بده»
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
 const fieldTypeIcon = (t: FormFieldType) => t === 'text' ? 'Aa' : t === 'textarea' ? '¶' : t === 'select' ? '◉' : t === 'date' ? '' : t === 'phone' ? '☎' : '☑'
 const fieldTypeLabel = (t: FormFieldType) => t === 'text' ? 'متنِ کوتاه' : t === 'textarea' ? 'متنِ بلند' : t === 'select' ? 'تک‌گزینه‌ای' : t === 'date' ? 'تاریخ' : t === 'phone' ? 'شماره‌تماس' : 'چندگزینه‌ای'

 async function saveIntakeForm() {
  setIntakeSaving(true); setIntakeSaved(false)
  try {
   const body: Record<string, any> = { form: intakeForm }
   if (me?.isOwner && viewingResourceId) body.resource_id = viewingResourceId
   const res = await fetch(api('/intake-form'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
   })
   if (res.status === 401) { setNeedsLogin(true); return }
   if (!res.ok) { const d = await res.json().catch(() => ({})); uiAlert((d.error || 'ذخیره‌ی فرم ناموفق بود') + (d.detail ? `\n\n(جزئیاتِ فنی: ${d.detail})` : '')); setIntakeSaving(false); return }
   setIntakeSnapshot(JSON.stringify(intakeForm))
   setIntakeSaved(true)
   setTimeout(() => setIntakeSaved(false), 2500)
  } catch {}
  setIntakeSaving(false)
 }

 function addFormSection() {
  const id = genId('section')
  setIntakeForm(f => ({ sections: [...f.sections, { id, title: 'بخشِ جدید', fields: [] }] }))
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
 // جابه‌جاییِ آزاد (برای درگ‌اند‌دراپ) — از هر اندیس به هر اندیسِ دیگر
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
   fields: [...intakeForm.sections[sIdx].fields, { id: genId('field'), label: 'سوالِ جدید', type: 'text' as FormFieldType, required: false }],
  })
  setBuilderSel({ sIdx, fIdx: newIdx })
  setOpenSection(intakeForm.sections[sIdx].id)
 }
 // زیرسوالِ تازه که خودِ دکتر متنش رو می‌نویسه — درست بعدِ سوالِ محرک اضافه می‌شه و
 // به همون گزینه وصل می‌شه (showIf از قبل ست شده، دیگه نیازی به لینک‌کردنِ دستی نیست)
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
 // جابه‌جاییِ آزادِ سوال داخلِ همان بخش (برای درگ‌اند‌دراپ)
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


 // helperهای ویرایشِ آرایه‌ها
 // برچسبِ یک کلیدِ details: اول از فرمِ فعلیِ همین دکتر (اگر چنین فیلدی هنوز هست)، بعد از نقشه‌ی پرونده‌های قدیمی، وگرنه خودِ کلید
 function detailFieldLabel(key: string): string {
  for (const s of patientIntakeForm.sections) {
   const f = s.fields.find(fl => fl.id === key)
   if (f) return f.label
  }
  return LEGACY_DETAIL_LABELS[key] || key
 }
 function formatDetailValue(v: unknown): string {
  if (Array.isArray(v)) return v.join('، ')
  return String(v ?? '')
 }

 const patchSettings = (p: Partial<ClinicSettings>) => setSettings(s => ({ ...s, ...p }))
 const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`

 // ── گزارشاتِ مالی ──────────────────────────────────────────────
 async function loadFinance(range: 'all' | '1m' | '3m' | '6m' | '12m' | 'custom' = financeRange, iso?: { from?: string; to?: string }) {
  try {
   let qs = ''
   if (range === 'custom') {
    const p = new URLSearchParams()
    const from = iso?.from ?? financeFromIso
    const to = iso?.to ?? financeToIso
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    qs = p.toString() ? '?' + p.toString() : ''
   } else if (range !== 'all') {
    const days = { '1m': 30, '3m': 90, '6m': 180, '12m': 365 }[range]
    const fromIso = new Date(Date.now() - days * 86400000).toISOString()
    qs = `?from=${encodeURIComponent(fromIso)}`
   }
   const res = await fetch(api('/finance') + qs, { cache: 'no-store' })
   if (res.status === 401) { setNeedsLogin(true); return }
   const data = await res.json()
   setFinance(data)
  } catch {}
  setFinanceLoaded(true)
 }

 // گزارشِ مالیِ داشبورد — stateِ کاملاً جدا از تبِ «گزارشاتِ مالی» تا انتخابِ
 // بازه‌ی کاربر تویِ اون تب با فچِ داشبورد قاطی/بازنویسی نشود
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

 // اعمالِ بازه‌ی دقیقِ جلالی
 function applyCustomRange() {
  const fromTs = jalaliDateTimeToTimestamp(`${fromJ.y}/${fromJ.m}/${fromJ.d}`, '00:00')
  const toTs = jalaliDateTimeToTimestamp(`${toJ.y}/${toJ.m}/${toJ.d}`, '23:59')
  if (fromTs === null || toTs === null) { uiAlert('تاریخ نامعتبر است'); return }
  if (fromTs > toTs) { uiAlert('تاریخِ «از» نباید بعد از «تا» باشد.'); return }
  const from = new Date(fromTs).toISOString()
  const to = new Date(toTs).toISOString()
  setFinanceFromIso(from); setFinanceToIso(to); setFinanceRange('custom'); setFinanceLoaded(false)
  loadFinance('custom', { from, to })
 }

 async function saveSchedule() {
  if (!selectedDay) return
  setSchedSaving(true)
  const date = `${schedYear}/${schedMonth + 1}/${selectedDay}`
  // نوعِ هر اسلات: هر اسلات یک نوعِ مشخص دارد (آنلاین یا یکی از مطب‌ها) — «هردو» حذف شد
  const mode = profile.session_modes
  const offlineLocs = settings.office_locations
  const firstLoc = offlineLocs[0]?.title
  const outTypes: Record<string, string> = {}
  const outLocs: Record<string, string> = {}
  for (const t of selectedTimes) {
   if (mode === 'online') outTypes[t] = 'online'
   else if (mode === 'offline') {
    outTypes[t] = 'offline'
    const loc = slotLocs[t] || firstLoc
    if (loc) outLocs[t] = loc
   } else {
    // حالتِ «هردو» در تنظیمات: دکتر برای هر اسلات آنلاین یا یک مطب را انتخاب می‌کند
    if (slotTypes[t] === 'offline') {
     outTypes[t] = 'offline'
     const loc = slotLocs[t] || firstLoc
     if (loc) outLocs[t] = loc
    } else {
     // پیش‌فرض یا انتخابِ صریحِ آنلاین
     outTypes[t] = 'online'
    }
   }
  }
  try {
   const res = await fetch(api('/schedule'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     date, available_times: selectedTimes, is_off: isOff, slot_types: outTypes, slot_locs: outLocs,
     ...(me?.isOwner && viewingResourceId ? { resource_id: viewingResourceId } : {}),
    }),
   })
   setSchedSaving(false)
   if (res.status === 401) { uiAlert('نشستِ شما منقضی شده. دوباره وارد شوید.'); setNeedsLogin(true); return }
   if (!res.ok) {
    // متنِ واقعیِ پاسخ را بخوان (اگر JSON نبود، احتمالاً بلاکِ سطحِ سرور/فایروال است)
    const raw = await res.text().catch(() => '')
    let msg = ''
    try { msg = JSON.parse(raw).error || '' } catch {}
    if (res.status === 403 && !msg) {
     uiAlert('ذخیره نشد (403). این خطا از خودِ برنامه نیست؛ درخواست توسطِ فایروالِ Vercel بلاک شده. در پنلِ Vercel → Firewall، گزینه‌ی «Attack Challenge Mode» را خاموش کن (یا Deployment Protection را بررسی کن).')
    } else {
     uiAlert(`ذخیره نشد (کد ${res.status}): ${msg || raw.slice(0, 200) || 'خطای ناشناخته'}`)
    }
    return
   }
   setSchedSaved(true)
   setTimeout(() => setSchedSaved(false), 2000)
   // بعد از ذخیره، همان روز و کلِ ماه را دوباره بخوان + رزروها را تازه کن
   selectSchedDay(selectedDay)
   loadMonthSchedules(schedMonth, schedYear)
   loadAllSessions()
   refreshBookings()
  } catch (e: any) {
   setSchedSaving(false)
   uiAlert('خطای شبکه: ' + (e?.message || e))
  }
 }

 // با کلیک روی هر روز، ساعت‌های ذخیره‌شده‌اش را بارگذاری کن تا ویرایش درست باشد
 async function selectSchedDay(d: number) {
  setSelectedDay(d)
  setSelectedTimes([])
  setSlotTypes({})
  setSlotLocs({})
  setIsOff(false)
  setCustomTime('')
  const date = `${schedYear}/${schedMonth + 1}/${d}`
  try {
   const res = await fetch(api(`/schedule?date=${date}${scheduleResourceQS()}`), { cache: 'no-store' })
   const data = await res.json()
   if (data.schedule) {
    setSelectedTimes(data.schedule.available_times || [])
    setSlotTypes(data.schedule.slot_types || {})
    setSlotLocs(data.schedule.slot_locs || {})
    setIsOff(data.schedule.is_off || false)
   }
  } catch {}
 }

 // ─── Filtered lists ──────────────────────────────────────────────────────────

 const filteredPatients = patients.filter(p => {
  if (!patientSearch) return true
  const q = patientSearch.toLowerCase()
  return (
   p.client_name?.toLowerCase().includes(q) ||
   p.contact_name?.toLowerCase().includes(q) ||
   p.contact2_name?.toLowerCase().includes(q) ||
   p.case_number?.toLowerCase().includes(q) ||
   p.contact_phone?.includes(q) ||
   p.contact2_phone?.includes(q)
  )
 })

 const bookingCounts = {
  all: bookings.length,
  pending: bookings.filter(b => b.status === 'pending').length,
  confirmed: bookings.filter(b => b.status === 'confirmed').length,
  cancelled: bookings.filter(b => b.status === 'cancelled').length,
 }

 // ─── Render ──────────────────────────────────────────────────────────────────

 if (needsLogin) return <PanelLogin slug={slug} onSuccess={() => { setNeedsLogin(false); fetchAll() }} />

 const pendingActionCount = pendingStages.length + pendingPkgs.length + pendingSess.length + pendingRefunds.length

 // تبِ «تأیید پرداخت‌ها» فقط وقتی به‌دردبخور است که کارت‌به‌کارت واقعاً استفاده می‌شود
 // (وگرنه پرداخت‌ها آنلاین و خودکار تایید می‌شوند) — مگر این‌که از قبل چیزی منتظرِ
 // رسیدگی مانده باشد (مثلاً یک بازپرداختِ کنسلی که همیشه دستی می‌ماند).
 const showBookingsTab = profile.payment_methods.card_to_card || pendingActionCount > 0

 const navItems = [
  { key: 'dashboard' as const, icon: '🏠', label: 'داشبورد', badge: 0 },
  { key: 'patients' as const, icon: '📁', label: 'پرونده‌ها', badge: 0 },
  { key: 'schedule' as const, icon: '🗓', label: 'روزهای کاری', badge: 0 },
  ...(showBookingsTab ? [{ key: 'bookings' as const, icon: '💳', label: 'تأیید پرداخت‌ها', badge: pendingActionCount }] : []),
  { key: 'finance' as const, icon: '📊', label: 'گزارشاتِ مالی', badge: 0 },
 ]

 function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
   <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
    {navItems.map(item => (
     <button key={item.key} onClick={() => { setMainTab(item.key); onNavigate?.() }}
      className={`w-full text-right px-3 py-2.5 rounded-lg text-sm flex items-center justify-between gap-2 transition-colors ${
       mainTab === item.key ? 'bg-sand text-ink font-medium' : 'text-soot hover:bg-gray-50'}`}>
      <span className="flex items-center gap-2">{item.icon} {item.label}</span>
      {item.badge > 0 && (
       <span className="min-w-5 h-5 px-1.5 bg-amber-400 text-white text-[11px] rounded-full flex items-center justify-center font-medium">
        {toFarsiNum(item.badge)}
       </span>
      )}
     </button>
    ))}
   </nav>
  )
 }

 // ─── ناوبریِ حالتِ «تنظیمات» — به سبکِ Cal.com: گروه‌بندی‌شده، با بازگشتِ صریح به پنلِ اصلی ───
 type SettingsGroup = { title: string; items: { key: typeof settingsSubTab; icon: string; label: string }[] }
 const settingsGroups: SettingsGroup[] = [
  {
   title: 'صفحه‌ی عمومی', items: [
    { key: 'profile', icon: '👤', label: 'پروفایل' },
    { key: 'payments', icon: '💳', label: 'پرداخت‌ها' },
    { key: 'pricing', icon: '💰', label: 'قیمت‌گذاری' },
    { key: 'form', icon: '📝', label: 'فرمِ رزرو' },
    ...(me?.isOwner !== false ? [{ key: 'locations' as const, icon: '🏢', label: 'مکان‌های حضوری' }] : []),
   ],
  },
  ...(me?.isOwner !== false ? [{
   title: 'پنلِ مراجع', items: [
    { key: 'patient_panel' as const, icon: '⚙️', label: 'ماژول‌ها و سیاست‌ها' },
   ],
  }] : []),
  ...(me?.isOwner ? [{
   title: 'تیم', items: [
    { key: 'staff' as const, icon: '👥', label: 'درمانگرها' },
   ],
  }] : []),
  { title: 'حساب', items: [{ key: 'account', icon: '🪪', label: 'مشخصاتِ حساب' }] },
  { title: 'پشتیبانی', items: [{ key: 'tickets', icon: '🎫', label: 'تیکت' }] },
 ]

 // آکاردئون: فقط یک گروه هم‌زمان باز — پیش‌فرض همان گروهی که زیرتبِ فعلی داخلش است
 const [openGroup, setOpenGroup] = useState(() => settingsGroups.find(g => g.items.some(i => i.key === settingsSubTab))?.title || settingsGroups[0].title)

 function SettingsNavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
   <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
    {settingsGroups.map(group => {
     const isOpen = openGroup === group.title
     return (
      <div key={group.title}>
       <button onClick={() => setOpenGroup(isOpen ? '' : group.title)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-ink/70 hover:text-ink">
        <span>{group.title}</span>
        <span className={`transition-transform ${isOpen ? '-rotate-90' : ''}`}>◂</span>
       </button>
       {isOpen && (
        <div className="space-y-0.5 mb-1">
         {group.items.map(item => (
          <button key={item.key} onClick={() => { setSettingsSubTab(item.key); onNavigate?.() }}
           className={`w-full text-right px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
            settingsSubTab === item.key ? 'bg-sand text-ink font-medium' : 'text-soot hover:bg-gray-50'}`}>
           {item.icon} {item.label}
          </button>
         ))}
        </div>
       )}
      </div>
     )
    })}
   </nav>
  )
 }

 // هدرِ سایدبار (هردو حالت) — نامِ دکتر/کلینیک؛ در حالتِ تنظیمات یک ردیفِ «← بازگشت» هم دارد
 function SidebarHeader() {
  return (
   <div className="p-4 border-b border-sand">
    {mainTab === 'settings_hub' ? (
     <button onClick={() => setMainTab('patients')} className="text-xs text-soot hover:text-ink flex items-center gap-1 mb-2">
      ← بازگشت به پنل
     </button>
    ) : null}
    <div className="text-sm font-display font-semibold text-ink">{mainTab === 'settings_hub' ? 'تنظیمات' : 'پنل مدیریت'}</div>
    <div className="text-xs text-soot truncate mt-0.5">
     {profile.name || me?.resourceName || 'دکتر'}{profile.title ? ` — ${profile.title}` : ''}
     {me && !me.isOwner && <span className="text-soot"> (درمانگر)</span>}
    </div>
   </div>
  )
 }

 return (
  <div className={`min-h-screen bg-gray-50 sm:pr-56 ${darkMode ? 'pb-admin-dark' : ''}`} dir="rtl">
   <DialogHost />

   {/* ── سایدبار (دسکتاپ) ───────────────────────────────────────────── */}
   <aside className="hidden sm:flex sm:flex-col fixed top-0 right-0 h-full w-56 bg-white border-l border-sand z-20">
    <SidebarHeader />
    {mainTab === 'settings_hub' ? <SettingsNavList /> : <NavList />}
    <div className="p-2 border-t border-sand space-y-1">
     <a href={`/${slug}`} target="_blank" rel="noopener noreferrer"
      className="block text-right text-xs px-3 py-2 rounded-lg text-soot hover:bg-gray-50">
      سایتِ من
     </a>
     {mainTab !== 'settings_hub' && (
      <button onClick={() => setMainTab('settings_hub')} className="w-full text-right text-xs px-3 py-2 rounded-lg text-soot hover:bg-gray-50 flex items-center gap-2">
       ⚙️ تنظیمات
      </button>
     )}
    </div>
   </aside>

   {/* ── نوارِ بالا (موبایل) ────────────────────────────────────────── */}
   <div className="sm:hidden bg-white border-b border-sand sticky top-0 z-20 px-3 py-3 flex items-center justify-between">
    <button onClick={() => setSidebarOpen(true)} className="text-xl text-soot w-8 h-8 flex items-center justify-center">☰</button>
    <div className="text-sm font-display font-semibold text-ink">{mainTab === 'settings_hub' ? 'تنظیمات' : 'پنل مدیریت'}</div>
    <div className="w-8" />
   </div>

   {/* ── دراورِ کشویی (موبایل) ──────────────────────────────────────── */}
   {sidebarOpen && (
    <>
     <div className="fixed inset-0 bg-black/30 z-40 sm:hidden" onClick={() => setSidebarOpen(false)} />
     <aside className="fixed top-0 right-0 h-full w-64 bg-white z-50 sm:hidden flex flex-col">
      <div className="flex items-center justify-between border-b border-sand">
       <div className="flex-1"><SidebarHeader /></div>
       <button onClick={() => setSidebarOpen(false)} className="text-soot text-xl w-8 h-8 shrink-0 ml-2">✕</button>
      </div>
      {mainTab === 'settings_hub' ? <SettingsNavList onNavigate={() => setSidebarOpen(false)} /> : <NavList onNavigate={() => setSidebarOpen(false)} />}
      <div className="p-2 border-t border-sand space-y-1">
       <a href={`/${slug}`} target="_blank" rel="noopener noreferrer"
        className="block text-right text-xs px-3 py-2 rounded-lg text-soot hover:bg-gray-50">
        سایتِ من
       </a>
       {mainTab !== 'settings_hub' && (
        <button onClick={() => { setMainTab('settings_hub'); setSidebarOpen(false) }} className="w-full text-right text-xs px-3 py-2 rounded-lg text-soot hover:bg-gray-50 flex items-center gap-2">
         ⚙️ تنظیمات
        </button>
       )}
      </div>
     </aside>
    </>
   )}

   <div className="max-w-5xl mx-auto p-3 sm:p-4">

    {/* ════════════════════════════════════════════════════════════════
      TAB: DASHBOARD (نمایِ کلی)
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'dashboard' && (() => {
      const todayJ = getCurrentJalali()
      const todayStr = `${todayJ.year}/${todayJ.month + 1}/${todayJ.day}`
      const todayAppts = apptsForDate(todayStr).sort((a, b) => a.time.localeCompare(b.time))
      const thisMonthKey = `${todayJ.year}/${String(todayJ.month + 1).padStart(2, '0')}`
      const monthAmount = dashboardFinance?.monthly.find(m => m.month === thisMonthKey)?.amount || 0
      const money = (n: number) => n.toLocaleString('en-US')
      const activeCases = bookings.length
      const trend = dashboardFinance?.monthly.slice(-6) || []
      const maxTrend = Math.max(1, ...trend.map(m => m.amount))
      const needsSheba = tenantPlan !== 'pro' || profile.payment_methods.online
      const missingSheba = needsSheba && !profile.settlement_sheba

      return (
       <div className="space-y-4">
        {/* خوش‌آمد + تاریخِ امروز */}
        <div className="flex items-center justify-between flex-wrap gap-2">
         <div>
          <h1 className="text-lg font-display font-bold text-ink">
           سلام{profile.name ? `، ${profile.name}` : ''} 👋
          </h1>
          <p className="text-xs text-soot mt-0.5">
           {PERSIAN_MONTHS[todayJ.month]} {toFarsiNum(todayJ.day)}، {toFarsiNum(todayJ.year)}
          </p>
         </div>
        </div>

        {/* هشدارها — فقط وقتی واقعاً اقدامی لازم است */}
        {pendingActionCount > 0 && (
         <button onClick={() => setMainTab('bookings')}
          className="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-right hover:bg-amber-100 transition-colors">
          <span className="text-sm text-amber-800">
           <strong className="tnum">{toFarsiNum(pendingActionCount)}</strong> مورد منتظرِ تأییدِ پرداختِ شماست
          </span>
          <span className="text-amber-700 text-xs">بررسی ←</span>
         </button>
        )}
        {missingSheba && (
         <button onClick={() => { setMainTab('settings_hub'); setSettingsSubTab('payments'); setOpenGroup('صفحه‌ی عمومی') }}
          className="w-full flex items-center justify-between bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3 text-right hover:bg-sky-100 transition-colors">
          <span className="text-sm text-sky-800">برای دریافتِ خودکارِ سهمتان از پرداختِ آنلاین، شماره‌شبا ثبت نکرده‌اید</span>
          <span className="text-sky-700 text-xs">تنظیم ←</span>
         </button>
        )}

        {/* کارت‌هایِ KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
         <button onClick={() => setMainTab('patients')} className="bg-white rounded-2xl border border-sand p-4 text-right hover:border-ink transition-colors">
          <div className="text-2xl">📁</div>
          <div className="text-xl font-bold text-ink mt-1 tnum">{toFarsiNum(activeCases)}</div>
          <div className="text-[11px] text-soot">پرونده‌ی فعال</div>
         </button>
         <div className="bg-white rounded-2xl border border-sand p-4">
          <div className="text-2xl">🗓</div>
          <div className="text-xl font-bold text-ink mt-1 tnum">{toFarsiNum(todayAppts.length)}</div>
          <div className="text-[11px] text-soot">نوبتِ امروز</div>
         </div>
         <button onClick={() => setMainTab('bookings')} className="bg-white rounded-2xl border border-sand p-4 text-right hover:border-ink transition-colors">
          <div className="text-2xl">💳</div>
          <div className={`text-xl font-bold mt-1 tnum ${pendingActionCount > 0 ? 'text-amber-700' : 'text-ink'}`}>{toFarsiNum(pendingActionCount)}</div>
          <div className="text-[11px] text-soot">منتظرِ تأیید</div>
         </button>
         <button onClick={() => setMainTab('finance')} className="bg-white rounded-2xl border border-sand p-4 text-right hover:border-ink transition-colors">
          <div className="text-2xl">📊</div>
          <div className="text-xl font-bold text-ink mt-1 tnum">{money(monthAmount)}</div>
          <div className="text-[11px] text-soot">درآمدِ این ماه (تومان)</div>
         </button>
        </div>

        {/* نمودارِ روندِ ۶ماهه */}
        <div className="bg-white rounded-2xl border border-sand p-5">
         <h2 className="text-sm font-display font-semibold text-ink mb-4">روندِ درآمد (۶ ماهِ اخیر)</h2>
         {!dashboardLoaded ? (
          <p className="text-xs text-soot text-center py-8">در حالِ بارگذاری…</p>
         ) : trend.length === 0 ? (
          <p className="text-xs text-soot text-center py-8">هنوز درآمدی ثبت نشده.</p>
         ) : (
          <svg viewBox={`0 0 ${trend.length * 60} 160`} className="w-full h-40" preserveAspectRatio="xMidYMax meet">
           {trend.map((m, i) => {
            const h = Math.max(4, (m.amount / maxTrend) * 120)
            const x = i * 60 + 12
            const [y, mm] = m.month.split('/')
            const isCurrent = m.month === thisMonthKey
            return (
             <g key={m.month}>
              <rect x={x} y={140 - h} width={36} height={h} rx={6} className={isCurrent ? 'fill-ink' : 'fill-sand'} />
              <text x={x + 18} y={155} textAnchor="middle" className="fill-current text-soot" style={{ fontSize: 9 }}>
               {PERSIAN_MONTHS[parseInt(mm) - 1]?.slice(0, 3)}
              </text>
             </g>
            )
           })}
          </svg>
         )}
        </div>

        {/* برنامه‌ی امروز */}
        <div className="bg-white rounded-2xl border border-sand p-5">
         <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-display font-semibold text-ink">برنامه‌ی امروز</h2>
          <button onClick={() => setMainTab('schedule')} className="text-xs text-soot hover:text-ink">مشاهده‌ی همه ←</button>
         </div>
         {todayAppts.length === 0 ? (
          <p className="text-xs text-soot text-center py-6">امروز نوبتی ثبت نشده.</p>
         ) : (
          <div className="space-y-2">
           {todayAppts.map(a => (
            <div key={a.id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${a.color}`}>
             <span className="text-sm font-bold tnum shrink-0">{toFarsiNum(a.time)}</span>
             <span className="text-sm text-ink flex-1">{a.name}</span>
             <span className="text-[11px] text-soot shrink-0">{a.type}{a.mode === 'online' ? ' · آنلاین' : a.loc ? ` · ${a.loc}` : ''}</span>
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
     <>
      {/* ── Patient List ─────────────────────────────────────────── */}
      {patientView === 'list' && (
       <div>
        {/* سوییچرِ کارمند — فقط owner و فقط وقتی بیش از یک نفر پرسنل هست */}
        {me?.isOwner && staffList.filter(r => r.is_active).length > 1 && (
         <div className="mb-3">
          <select value={viewingResourceId} onChange={e => setViewingResourceId(e.target.value)}
           className="text-xs px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink">
           <option value="">همه‌ی پرسنل</option>
           {staffList.filter(r => r.is_active).map(r => (
            <option key={r.id} value={r.id}>{r.name}{r.title ? ` — ${r.title}` : ''}</option>
           ))}
          </select>
         </div>
        )}
        <div className="flex items-center gap-2 mb-4">
         <div className="relative flex-1">
          <input value={patientSearch} onChange={e => setPatientSearch(e.target.value)}
           placeholder="جستجو بر اساس نام، شماره پرونده یا تلفن..."
           className="w-full text-sm px-4 py-2.5 border border-sand rounded-xl bg-white pr-9 focus:outline-none focus:border-ink" />
          <span className="absolute right-3 top-2.5 text-soot"></span>
         </div>
         <button onClick={() => setShowAddPatient(true)}
          className="text-sm px-4 py-2.5 bg-ink text-white rounded-xl hover:bg-ink/90 whitespace-nowrap shrink-0">
          افزودن پرونده
         </button>
        </div>
        {loading ? (
         <div className="text-center py-16 text-soot">در حال بارگذاری...</div>
        ) : filteredPatients.length === 0 ? (
         <div className="text-center py-16 text-soot">پرونده‌ای یافت نشد</div>
        ) : (
         <div className="space-y-2">
          {filteredPatients.map(p => (
           <div key={p.id} onClick={() => openPatient(p)}
            className="bg-white rounded-xl border border-sand p-4 cursor-pointer hover:border-sand hover:shadow-sm transition-all">
            <div className="flex items-center justify-between">
             <div className="flex gap-3 items-center">
              <div className="w-10 h-10 rounded-full bg-sand flex items-center justify-center text-ink font-semibold text-sm shrink-0">
               {p.client_name?.charAt(0) || '?'}
              </div>
              <div>
               <div className="flex items-center gap-2">
                <span className="font-medium text-ink text-sm">{p.client_name}</span>
                {p.case_number && (
                 <span className="text-xs px-2 py-0.5 bg-gray-100 text-soot rounded-md font-mono">{p.case_number}</span>
                )}
               </div>
               <div className="text-xs text-soot mt-0.5">
                {p.grade && `پایه ${p.grade}`}
                {p.grade && p.birth_date && ' • '}
                {p.birth_date && `متولد ${p.birth_date}`}
               </div>
               <div className="text-xs text-soot mt-0.5">
                {p.contact_name && `تماس: ${p.contact_name}`}
                {p.contact_name && p.contact2_name && ' | '}
                {p.contact2_name && `${profile.companion_label || 'همراه'}: ${p.contact2_name}`}
               </div>
              </div>
             </div>
             <div className="flex flex-col items-end gap-2">
              <span className="text-xs text-soot">
               {p.contact_phone || p.contact2_phone}
              </span>
             </div>
            </div>
           </div>
          ))}
         </div>
        )}
       </div>
      )}

      {/* ── Patient Detail ───────────────────────────────────────── */}
      {patientView === 'detail' && selectedPatient && (
       <div>
        {/* Back + edit bar */}
        <div className="flex items-center justify-between mb-4">
         <button onClick={() => setPatientView('list')}
          className="flex items-center gap-1 text-sm text-soot hover:text-ink">
          ← بازگشت
         </button>
         <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => startEdit(selectedPatient)}
           className="text-xs sm:text-sm px-3 sm:px-4 py-2 bg-ink text-white rounded-xl hover:bg-ink/90 whitespace-nowrap">
           ویرایش
          </button>
          <button onClick={() => deletePatient(selectedPatient)}
           className="text-xs sm:text-sm px-3 py-2 border border-red-500/30 text-red-600 rounded-xl hover:bg-red-500/5 whitespace-nowrap">
           حذف
          </button>
         </div>
        </div>

        {/* Patient header */}
        <div className="bg-white rounded-2xl border border-sand p-4 mb-4">
         <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-sand flex items-center justify-center text-ink font-bold text-xl">
           {selectedPatient.client_name?.charAt(0)}
          </div>
          <div className="flex-1">
           <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-display font-semibold text-ink">{selectedPatient.client_name}</h2>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-soot rounded-md font-mono">{selectedPatient.case_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[selectedPatient.status] || ''}`}>
             {STATUS_LABEL[selectedPatient.status] || selectedPatient.status}
            </span>
            {selectedPatient.status !== 'cancelled' && (() => {
             const bk = bookings.find(b => b.case_number === selectedPatient.case_number)
             const st = bk?.current_stage
             const color = !st ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
               : st.status === 'booked' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
               : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
             return (
              <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>
               {st ? stageLabel(st) : 'منتظرِ تعیینِ مرحله‌ی بعد'}
              </span>
             )
            })()}
           </div>
           <div className="text-sm text-soot mt-0.5">{selectedPatient.reason}</div>
          </div>
         </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto">
         {([
          ['info', '👤', 'اطلاعات مراجع'],
          ['payment', '💳', 'اطلاعات پرداخت'],
          ['packages', '📦', 'پروتکل‌های درمان'],
          ['sessions', '🗓', 'جلسات تکی'],
         ] as const).map(([k, icon, label]) => (
          <button key={k} onClick={() => setPatientTab(k)}
           className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5 ${
            patientTab === k
             ? 'bg-ink text-white'
             : 'bg-white border border-sand text-soot hover:border-gray-300'
           }`}>
           <span>{icon}</span>{label}
          </button>
         ))}
        </div>

        {/* ── Tab: اطلاعات مراجع ─────────────────────────────── */}
        {patientTab === 'info' && (() => {
         const answers = patientAnswers(selectedPatient)
         const usedKeys = new Set<string>(['client_name', 'contact_phone'])
         return (
          <div className="space-y-2">
           {/* همیشه بالا و بازِ: مشخصاتِ ثابت (نام/شماره — این‌ها بیرونِ فرم و برایِ OTP لازم‌اند) */}
           <div className="bg-white rounded-xl border border-sand p-4">
            <Section title="مشخصاتِ ثابت و نوبت‌دهی" icon="🗓">
             <InfoRow label="نام" value={selectedPatient.client_name} />
             <InfoRow label="شماره‌ی تماسِ ثابت" value={enTime(selectedPatient.contact_phone)} />
             <InfoRow label="شماره‌ی پرونده" value={selectedPatient.case_number} />
             <InfoRow label="نوعِ جلسه" value={selectedPatient.session_type === 'online' ? 'آنلاین' : selectedPatient.session_type === 'offline' ? 'حضوری' : selectedPatient.session_type} />
             <InfoRow label="مطبِ انتخابی" value={(selectedPatient as any).office_location} />
            </Section>
           </div>

           {/* بخش‌هایِ فرمِ فعلیِ این دکتر — آکاردئونی، دقیقاً طبقِ سوال‌هایی که همین الان تعریف شده‌اند */}
           {patientIntakeForm.sections.map(sec => {
            const visibleFields = sec.fields.filter(f => !f.hidden && fieldVisible(f, answers))
            visibleFields.forEach(f => usedKeys.add(f.id))
            if (visibleFields.length === 0) return null
            const isOpen = infoOpenSection === sec.id
            return (
             <div key={sec.id} className="bg-white rounded-xl border border-sand overflow-hidden">
              <button onClick={() => setInfoOpenSection(isOpen ? null : sec.id)}
               className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink">
               <span>{sec.title}</span>
               <span className="text-soot text-xs">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
               <div className="px-4 pb-4">
                {visibleFields.map(f => (
                 <InfoRow key={f.id} label={f.label} value={formatDetailValue(patientFieldValue(selectedPatient, f.id))} />
                ))}
               </div>
              )}
             </div>
            )
           })}

           {/* هرچه در details هست ولی جزوِ فرمِ فعلی نیست — فرمِ عوض‌شده یا یادداشتِ دستیِ دکتر */}
           {(() => {
            const leftover = Object.entries((selectedPatient as any).details || {}).filter(([k]) => !usedKeys.has(k))
            if (leftover.length === 0) return null
            const isOpen = infoOpenSection === '__legacy'
            return (
             <div className="bg-white rounded-xl border border-sand overflow-hidden">
              <button onClick={() => setInfoOpenSection(isOpen ? null : '__legacy')}
               className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink">
               <span>سایر / یادداشت‌هایِ دستی</span>
               <span className="text-soot text-xs">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
               <div className="px-4 pb-4">
                {leftover.map(([key, value]) => (
                 <InfoRow key={key} label={detailFieldLabel(key)} value={formatDetailValue(value)} />
                ))}
               </div>
              )}
             </div>
            )
           })()}
          </div>
         )
        })()}

        {/* ── Tab: اطلاعات پرداخت ─────────────────────────────── */}
        {patientTab === 'payment' && (
         <div className="bg-white rounded-xl border border-sand p-4">
          {(() => {
           const fmt = (paid?: boolean, sub?: boolean, ref?: string) =>
            paid ? `پرداخت‌شده${ref ? ' — فیش: ' + ref : ''}` : sub ? 'منتظر تأیید' : '—'
           const typeCounts: Record<string, number> = {}
           return (
            <Section title="اطلاعات پرداخت" icon="💳">
             {stages.map(s => {
              typeCounts[s.stage_type] = (typeCounts[s.stage_type] || 0) + 1
              const n = typeCounts[s.stage_type]
              const label = (STAGE_TYPE_LABEL[s.stage_type] || s.stage_type) + (n > 1 ? ` #${n}` : '')
              return <InfoRow key={s.id} label={label} value={fmt(s.paid, s.payment_submitted, s.payment_ref)} />
             })}
             {packages.map(p => (
              <InfoRow key={p.id} label={`پروتکل درمان ${PERSIAN_MONTHS[parseInt(p.month) - 1]} ${p.year}`}
               value={fmt(p.paid, p.payment_submitted, p.payment_ref)} />
             ))}
            </Section>
           )
          })()}
         </div>
        )}

        {/* ── Tab: پروتکل‌های درمان ──────────────────────────────────── */}
        {patientTab === 'packages' && (
         <div>
          <button onClick={() => setShowNewPackage(true)}
           className="w-full py-3 border-2 border-dashed border-sand rounded-xl text-sm text-ink hover:bg-sand mb-4 transition-all">
           + تعریف پروتکل درمانی جدید
          </button>
          <div className="space-y-3">
           {packages.map(pkg => {
            const pkgSessions = sessions.filter(s => s.package_id === pkg.id)
            const primarySess = pkgSessions.filter(s => s.attendee === 'primary')
            const secondarySess = pkgSessions.filter(s => s.attendee === 'secondary')
            const total = pkg.price || ((pkg.primary_sessions * (pkg.primary_session_type === 'online' ? PRICING.online : PRICING.offline)) +
             (pkg.secondary_sessions * (pkg.secondary_session_type === 'online' ? PRICING.online : PRICING.offline)))
            return (
             <div key={pkg.id} className="bg-white rounded-xl border border-sand p-4">
              <div className="flex items-center justify-between mb-3">
               <h3 className="font-medium text-ink text-sm">
                {PERSIAN_MONTHS[parseInt(pkg.month) - 1]} {pkg.year}
               </h3>
               <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-ink">{total.toLocaleString('en-US')} ت</span>
                <button onClick={() => deletePackage(pkg)}
                 className="text-xs px-2 py-1 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5">🗑</button>
               </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-soot">
               <div>مراجع: {primarySess.length}/{pkg.primary_sessions} جلسه ({pkg.primary_session_type === 'online' ? 'آنلاین' : 'حضوری'})</div>
               {(pkg.secondary_sessions > 0 || profile.companion_label) && (
                <div>{profile.companion_label || 'همراه'}: {secondarySess.length}/{pkg.secondary_sessions} جلسه ({pkg.secondary_session_type === 'online' ? 'آنلاین' : 'حضوری'})</div>
               )}
              </div>
              {pkg.notes && <p className="text-xs text-soot mt-2 pt-2 border-t border-sand">{pkg.notes}</p>}
              <div className="mt-3 pt-3 border-t border-sand">
               {pkg.paid ? (
                <div className="text-center text-xs text-ink bg-gray-100 rounded-lg py-2 border border-sand">
                 پرداخت تأیید شد{pkg.payment_ref ? ` — فیش: ${pkg.payment_ref}` : ''}
                </div>
               ) : pkg.payment_submitted ? (
                <div className="text-xs text-amber-600 text-center bg-amber-500/10 rounded-lg py-2 border border-amber-500/20">
                 مراجع اعلام کرده پرداخت کرده{pkg.payment_ref ? ` — فیش: ${pkg.payment_ref}` : ''} — تأیید از تبِ «تأیید پرداخت‌ها»
                </div>
               ) : (
                <div className="text-center text-xs text-soot bg-gray-100 rounded-lg py-2 border border-sand">منتظر پرداختِ مراجع</div>
               )}
              </div>
              {pkgSessions.length > 0 && (
               <div className="mt-3 pt-3 border-t border-sand space-y-2">
                <div className="text-xs text-soot px-0.5">جلسات این پروتکل</div>
                {renderSessionList(pkgSessions)}
               </div>
              )}
             </div>
            )
           })}
          </div>
         </div>
        )}

        {/* ── Tab: جلسات تکی ────────────────────────────────────── */}
        {patientTab === 'sessions' && (
         <div>
          {/* مراحلِ پیش‌ازدرمان (مصاحبه/ارزیابی) — هر تعداد، به هر ترتیب */}
          {stages.length > 0 && (
           <div className="space-y-2 mb-4">
            {(() => {
             const typeCounts: Record<string, number> = {}
             return stages.map(s => {
              typeCounts[s.stage_type] = (typeCounts[s.stage_type] || 0) + 1
              return (
               <StageSessionCard key={s.id} stage={s} index={typeCounts[s.stage_type]}
                onSave={(stageId, notes, markHeld) => saveStageSession(stageId, notes, markHeld)} />
              )
             })
            })()}
           </div>
          )}

          <div className="text-xs text-soot mb-2 px-1">جلسه‌های تکی (مصاحبه، ارزیابی، یا دلخواهِ دکتر — جدا از پروتکل درمان)</div>
          <button onClick={() => setShowNewSession(true)}
           className="w-full py-3 border-2 border-dashed border-sand rounded-xl text-sm text-ink hover:bg-sand mb-4 transition-all">
           + ثبت جلسه‌ی تکیِ جدید
          </button>
          <div className="space-y-2">
           {renderSessionList(sessions.filter(s => !s.package_id))}
          </div>
         </div>
        )}
       </div>
      )}

      {/* ── Patient Edit Form ────────────────────────────────────── */}
      {patientView === 'edit' && selectedPatient && (() => {
       const editValue = (fieldId: string): string =>
        formatDetailValue((INTAKE_KNOWN_COLUMNS as readonly string[]).includes(fieldId) ? (editingPatient as any)[fieldId] : (editingPatient.details || {})[fieldId])
       const setEditValue = (fieldId: string, v: string) => {
        if ((INTAKE_KNOWN_COLUMNS as readonly string[]).includes(fieldId)) setEditingPatient(p => ({ ...p, [fieldId]: v } as any))
        else setEditingPatient(p => ({ ...p, details: { ...(p.details || {}), [fieldId]: v } }))
       }
       const answers = patientAnswers(editingPatient)
       const usedKeys = new Set<string>()
       return (
        <div>
         <div className="flex items-center justify-between mb-4">
          <button onClick={() => setPatientView('detail')}
           className="flex items-center gap-1 text-sm text-soot hover:text-ink">
           ← انصراف
          </button>
          <button onClick={savePatient}
           className="text-sm px-4 py-2 bg-ink text-white rounded-xl hover:bg-ink/90">
           ذخیره پرونده
          </button>
         </div>

         <div className="space-y-2">
          {/* مشخصاتِ ثابت — بیرونِ فرم، همیشه باز */}
          <div className="bg-white rounded-xl border border-sand p-4">
           <h3 className="text-sm font-semibold text-ink mb-3 pb-2 border-b border-sand">مشخصاتِ ثابت و نوبت‌دهی</h3>
           <div className="grid grid-cols-2 gap-3">
            <Field label="نام *" value={editingPatient.client_name} onChange={v => setEditingPatient(p => ({ ...p, client_name: v }))} />
            <Field label="شماره‌ی تماسِ ثابت *" value={editingPatient.contact_phone} onChange={v => setEditingPatient(p => ({ ...p, contact_phone: v }))} placeholder="09xxxxxxxxx" />
           </div>
           <div className="mt-3">
            <SelectField label="نوعِ جلسه" value={editingPatient.session_type} onChange={v => setEditingPatient(p => ({ ...p, session_type: v } as any))} options={['offline', 'online']} />
           </div>
          </div>

          {/* بخش‌هایِ فرمِ فعلی — آکاردئونی، همون سکشنی که تو نمای مشاهده باز بود */}
          {patientIntakeForm.sections.map(sec => {
           const visibleFields = sec.fields.filter(f => !f.hidden && fieldVisible(f, answers))
           visibleFields.forEach(f => usedKeys.add(f.id))
           if (visibleFields.length === 0) return null
           const isOpen = infoOpenSection === sec.id
           return (
            <div key={sec.id} className="bg-white rounded-xl border border-sand overflow-hidden">
             <button onClick={() => setInfoOpenSection(isOpen ? null : sec.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-ink">
              <span>{sec.title}</span>
              <span className="text-soot text-xs">{isOpen ? '▲' : '▼'}</span>
             </button>
             {isOpen && (
              <div className="px-4 pb-4 space-y-3">
               {visibleFields.map(f => {
                if (f.type === 'select') return <SelectField key={f.id} label={f.label} value={editValue(f.id)} onChange={v => setEditValue(f.id, v)} options={f.options || []} />
                if (f.type === 'textarea' || f.type === 'multiselect') return <TextareaField key={f.id} label={f.label} value={editValue(f.id)} onChange={v => setEditValue(f.id, v)} rows={2} />
                return <Field key={f.id} label={f.label} value={editValue(f.id)} onChange={v => setEditValue(f.id, v)} placeholder={f.placeholder} />
               })}
              </div>
             )}
            </div>
           )
          })}

          {/* سایر/دستی — شاملِ کلیدهایِ قدیمی + امکانِ افزودنِ یادداشتِ تازه */}
          <div className="bg-white rounded-xl border border-sand p-4">
           <h3 className="text-sm font-semibold text-ink mb-3 pb-2 border-b border-sand">سایر / یادداشت‌هایِ دستی</h3>
           <div className="space-y-3">
            {Object.entries(editingPatient.details || {}).filter(([k]) => !usedKeys.has(k)).map(([key, value]) => (
             <TextareaField key={key} label={detailFieldLabel(key)} value={formatDetailValue(value)} rows={2}
              onChange={v => setEditingPatient(p => ({ ...p, details: { ...(p.details || {}), [key]: v } }))} />
            ))}
            <div className="pt-2 border-t border-sand flex gap-2 items-end">
             <div className="flex-1">
              <Field label="عنوانِ یادداشتِ تازه" value={manualFieldLabel} onChange={setManualFieldLabel} placeholder="مثلاً: نگرانیِ ویژه" />
             </div>
             <div className="flex-1">
              <Field label="متن" value={manualFieldValue} onChange={setManualFieldValue} />
             </div>
             <button onClick={() => {
              const label = manualFieldLabel.trim()
              if (!label) { uiAlert('عنوان را وارد کنید'); return }
              setEditingPatient(p => ({ ...p, details: { ...(p.details || {}), [label]: manualFieldValue } }))
              setManualFieldLabel(''); setManualFieldValue('')
             }} className="px-4 py-2.5 bg-gray-100 text-ink rounded-xl text-sm whitespace-nowrap">+ افزودن</button>
            </div>
           </div>
          </div>
         </div>

         <div className="mt-4 flex gap-3">
          <button onClick={() => setPatientView('detail')}
           className="flex-1 py-3 border border-sand rounded-xl text-sm text-soot">انصراف</button>
          <button onClick={savePatient}
           className="flex-1 py-3 bg-ink text-white rounded-xl text-sm font-medium">ذخیره پرونده</button>
         </div>
        </div>
       )
      })()}
     </>
    )}

    {/* ════════════════════════════════════════════════════════════════
      TAB: BOOKINGS
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'bookings' && (
     <div>
      {/* صندوقِ تأیید پرداخت‌ها — سه بخش */}
      {(() => {
       const childOf = (cn: string) => bookings.find(b => b.case_number === cn)?.client_name || cn
       const interviewPending = pendingStages.filter(s => s.stage_type === 'interview')
       const assessmentPending = pendingStages.filter(s => s.stage_type === 'assessment')
       const pkgAmount = (p: Package) =>
        p.price || ((p.primary_sessions * (p.primary_session_type === 'online' ? PRICING.online : PRICING.offline)) +
        (p.secondary_sessions * (p.secondary_session_type === 'online' ? PRICING.online : PRICING.offline)))
       const totalPending = pendingStages.length + pendingPkgs.length + pendingSess.length + pendingRefunds.length
       const refundAmt = (s: Session) => {
        const full = s.price || (s.session_type === 'online' ? PRICING.online : PRICING.offline)
        return Math.round(full * (s.refund_percent || 50) / 100)
       }

       if (loading) return <div className="text-center py-16 text-soot">در حال بارگذاری...</div>

       return (
        <div className="space-y-6">
         <p className={`text-sm ${totalPending === 0 ? 'text-soot' : 'text-amber-600 font-medium'}`}>
          {totalPending === 0 ? 'موردِ منتظرِ اقدامی وجود ندارد.' : `${toFarsiNum(totalPending)} مورد منتظر اقدام است.`}
         </p>

         {/* بخش 1: مصاحبه */}
         <PendingSection title="مصاحبه‌ی اولیه" icon="🩺" count={interviewPending.length}>
          {interviewPending.map(s => (
           <PendingPayCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
            amount={s.price || (bookings.find(b => b.case_number === s.case_number)?.session_type === 'online' ? PRICING.online : PRICING.offline)} receipt={s.payment_ref}>
            <div className="flex gap-2">
             <button onClick={() => confirmStagePayment(s.id, 'interview')}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">تأیید پرداخت</button>
             <button onClick={() => rejectStagePayment(s.id)}
              className="flex-1 py-2 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">رد</button>
            </div>
           </PendingPayCard>
          ))}
         </PendingSection>

         {/* بخش 2: ارزیابی */}
         <PendingSection title="ارزیابی" icon="🧩" count={assessmentPending.length}>
          {assessmentPending.map(s => (
           <PendingPayCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
            amount={s.price || (bookings.find(b => b.case_number === s.case_number)?.session_type === 'online' ? PRICING.online : PRICING.offline)} receipt={s.payment_ref}>
            <div className="flex gap-2">
             <button onClick={() => confirmStagePayment(s.id, 'assessment')}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">تأیید پرداخت</button>
             <button onClick={() => rejectStagePayment(s.id)}
              className="flex-1 py-2 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">رد</button>
            </div>
           </PendingPayCard>
          ))}
         </PendingSection>

         {/* بخش 3: پروتکل‌های درمان (و جلسه‌های جایگزین) */}
         <PendingSection title="پروتکل درمان" icon="📦" count={pendingPkgs.length + pendingSess.length}>
          {pendingPkgs.map(p => (
           <PendingPayCard key={p.id} name={childOf(p.case_number)} caseNumber={p.case_number}
            amount={pkgAmount(p)} receipt={p.payment_ref}
            sub={`${PERSIAN_MONTHS[parseInt(p.month) - 1]} ${p.year} • ${p.primary_sessions + p.secondary_sessions} جلسه`}>
            <div className="flex gap-2">
             <button onClick={() => confirmPackagePayment(p.id)}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">تأیید پرداخت</button>
             <button onClick={() => rejectPackagePayment(p.id)}
              className="flex-1 py-2 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">رد</button>
            </div>
           </PendingPayCard>
          ))}
          {pendingSess.map(s => (
           <PendingPayCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
            amount={s.price || (s.session_type === 'online' ? PRICING.online : PRICING.offline)} receipt={s.payment_ref}
            sub="جلسه‌ی جایگزین">
            <div className="flex gap-2">
             <button onClick={() => confirmSessionPayment(s.id)}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">تأیید پرداخت</button>
             <button onClick={() => rejectSessionPayment(s.id)}
              className="flex-1 py-2 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">رد</button>
            </div>
           </PendingPayCard>
          ))}
         </PendingSection>

         {/* بخش 4: بازپرداختِ کنسلی‌ها */}
         <PendingSection title="بازپرداختِ کنسلی" icon="💸" count={pendingRefunds.length}>
          {pendingRefunds.map(s => (
           <RefundPendingCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
            card={s.refund_card || ''} amount={refundAmt(s)}
            onDone={(ref) => markRefunded(s.id, ref)} />
          ))}
         </PendingSection>
        </div>
       )
      })()}

     </div>
    )}

    {/* ════════════════════════════════════════════════════════════════
      TAB: SCHEDULE
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'schedule' && (
     <div className="max-w-2xl mx-auto">
      {/* زیرتب‌ها */}
      <div className="flex bg-white rounded-xl border border-sand p-1 mb-4">
       {([['edit', 'تنظیم روزها'], ['agenda', 'برنامه‌ی نوبت‌ها']] as const).map(([k, label]) => (
        <button key={k} onClick={() => setSchedSubTab(k)}
         className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${schedSubTab === k ? 'bg-ink text-white' : 'text-soot'}`}>
         {label}
        </button>
       ))}
      </div>

      {/* نوار ماه (مشترک) */}
      <div className="bg-white rounded-2xl border border-sand p-3 mb-4 flex items-center justify-between gap-2">
       <button onClick={() => changeMonth(-1)} className="px-3 py-1.5 border border-sand rounded-lg text-xs text-soot hover:bg-gray-50 shrink-0">قبلی</button>
       <h2 className="text-sm sm:text-base font-display font-medium text-ink text-center">{PERSIAN_MONTHS[schedMonth]} {toFarsiNum(schedYear)}</h2>
       <button onClick={() => changeMonth(1)} className="px-3 py-1.5 border border-sand rounded-lg text-xs text-soot hover:bg-gray-50 shrink-0">بعدی</button>
      </div>

      {/* ════ نمای تنظیم روزها ════ */}
      {schedSubTab === 'edit' && (
       <>
        {/* راهنمای رنگ‌ها */}
        <div className="flex items-center justify-center gap-4 text-xs text-soot mb-3">
         <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/15 border border-emerald-500/40" /> روز کاری</span>
         <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> نوبتِ رزروشده</span>
        </div>

        <div className="bg-white rounded-2xl border border-sand p-5 mb-4">
         <div className="grid grid-cols-7 gap-1 mb-2">
          {['ش','ی','د','س','چ','پ','ج'].map(d => (
           <div key={d} className="text-center text-xs text-soot py-1">{d}</div>
          ))}
         </div>
         <div className="grid grid-cols-7 gap-1">
          {Array(2).fill(null).map((_, i) => <div key={i} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
           const d = i + 1
           const isPast = schedYear === today.year && schedMonth === today.month && d < today.day
           const sched = schedForDay(d)
           const totalSlots = sched?.available_times?.length || 0
           const dateStr = `${schedYear}/${schedMonth + 1}/${d}`
           const booked = apptsForDate(dateStr).length
           const isSel = selectedDay === d
           return (
            <div key={d}
             onClick={() => { if (!isPast) selectSchedDay(d) }}
             className={`relative text-center py-2.5 rounded-lg text-sm transition-all
              ${isPast ? 'text-gray-300 cursor-default' : 'cursor-pointer'}
              ${isSel ? 'ring-2 ring-ink font-medium' : ''}
              ${!isPast && totalSlots > 0 ? 'bg-emerald-500/10 text-emerald-700' : ''}
              ${!isPast && totalSlots === 0 ? 'text-soot hover:bg-gray-50' : ''}`}>
             {toFarsiNum(d)}
             {!isPast && totalSlots > 0 && (
              <span className="block text-[10px] mt-0.5 text-emerald-600">{toFarsiNum(totalSlots)} ساعت</span>
             )}
             {booked > 0 && (
              <span className="absolute top-1 left-1 min-w-4 h-4 px-1 bg-amber-400 text-white text-[10px] rounded-full flex items-center justify-center font-medium">{toFarsiNum(booked)}</span>
             )}
            </div>
           )
          })}
         </div>
        </div>

        {selectedDay && (
         <div className="bg-white rounded-2xl border border-sand p-5">
          <h3 className="text-sm font-medium text-ink mb-1">
           ساعات کاری — {toFarsiNum(selectedDay)} {PERSIAN_MONTHS[schedMonth]}
          </h3>
          <p className="text-xs text-soot mb-4">ساعت‌هایی که نوبت می‌دهی را انتخاب کن. اگر هیچ ساعتی انتخاب نکنی، آن روز تعطیل محسوب می‌شود.</p>
          {profile.session_modes === 'both' && (
           <p className="text-[11px] text-soot mb-3">روی نوعِ هر ساعت بزن تا بینِ آنلاین و مطب‌های حضوری جابجا شود. هر ساعت یک نوعِ مشخص دارد.</p>
          )}
          {profile.session_modes === 'offline' && settings.office_locations.length > 1 && (
           <p className="text-[11px] text-soot mb-3">روی هر ساعت بزن تا بینِ مطب‌ها جابجا شود.</p>
          )}

          {/* افزودن/حذفِ ساعت از لیستِ سریعِ این دکتر — این لیست برایِ همه‌ی روزها مشترک است */}
          <div className="flex items-center gap-2 mb-1.5">
           <input value={customTime} onChange={e => setCustomTime(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') {
             const t = parseCustomTime(customTime)
             if (!t) { uiAlert('ساعت نامعتبر است — مثال: 9:30 یا 14:00'); return }
             if (!profile.quick_times.includes(t)) persistQuickTimes([...profile.quick_times, t])
             if (!selectedTimes.includes(t)) setSelectedTimes(prev => [...prev, t])
             setCustomTime('')
            }}}
            placeholder="ساعتِ دلخواه (مثلاً 9:30)"
            className="flex-1 text-sm px-3 py-2 border border-sand rounded-xl" dir="ltr" />
           <button onClick={() => {
             const t = parseCustomTime(customTime)
             if (!t) { uiAlert('ساعت نامعتبر است — مثال: 9:30 یا 14:00'); return }
             if (!profile.quick_times.includes(t)) persistQuickTimes([...profile.quick_times, t])
             if (!selectedTimes.includes(t)) setSelectedTimes(prev => [...prev, t])
             setCustomTime('')
            }}
            disabled={quickTimesSaving}
            className="px-4 py-2 border border-sand text-ink rounded-xl text-sm font-medium hover:bg-sand shrink-0 disabled:opacity-50">
            افزودن
           </button>
           <button onClick={() => setRemoveTimeMode(v => !v)}
            disabled={quickTimesSaving}
            className={`px-4 py-2 border rounded-xl text-sm font-medium shrink-0 disabled:opacity-50 ${removeTimeMode ? 'bg-ink border-ink text-white' : 'border-sand text-ink hover:bg-gray-100'}`}>
            حذف
           </button>
          </div>
          {removeTimeMode && (
           <p className="text-[11px] text-ink mb-3">هر ساعتی را که می‌خواهی از لیستِ گزینه‌ها کامل حذف کنی، لمس کن. برای خروج از این حالت، دوباره «حذف» را بزن.</p>
          )}

          <div className="grid grid-cols-3 gap-2 mb-4">
           {Array.from(new Set([...profile.quick_times, ...selectedTimes])).sort((a, b) => timeKey(a) - timeKey(b)).map(t => {
            const dateStr = `${schedYear}/${schedMonth + 1}/${selectedDay}`
            const takenBy = apptsForDate(dateStr).find(a => a.time === t)
            const slotTs = jalaliDateTimeToTimestamp(dateStr, t)
            const isPastTime = slotTs !== null && slotTs <= Date.now()
            const selected = selectedTimes.includes(t)
            const locked = !!takenBy || isPastTime
            const mode = profile.session_modes
            const offlineLocs = settings.office_locations
            // گزینه‌های ممکن برای این اسلات (بدونِ «هردو» — هر اسلات یک نوعِ مشخص دارد)
            type Opt = { kind: 'online' | 'offline'; loc?: string; label: string }
            const opts: Opt[] = []
            if (mode === 'both' || mode === 'online') opts.push({ kind: 'online', label: 'آنلاین' })
            if (mode === 'both' || mode === 'offline') {
             if (offlineLocs.length <= 1) opts.push({ kind: 'offline', loc: offlineLocs[0]?.title, label: `${offlineLocs[0]?.title || 'حضوری'}` })
             else offlineLocs.forEach(l => opts.push({ kind: 'offline', loc: l.title, label: `${l.title}` }))
            }
            const fixed = opts.length === 1
            const curKind = slotTypes[t] === 'offline' ? 'offline' : slotTypes[t] === 'online' ? 'online' : ''
            const curLoc = slotLocs[t]
            let curIdx = opts.findIndex(o => o.kind === curKind && (o.kind !== 'offline' || (o.loc || '') === (curLoc || '')))
            if (curIdx < 0) curIdx = 0 // پیش‌فرض: اولین گزینه
            const curLabel = opts[curIdx]?.label
            const setOpt = (o: Opt) => {
             setSlotTypes(prev => ({ ...prev, [t]: o.kind }))
             setSlotLocs(prev => { const n = { ...prev }; if (o.kind === 'offline' && o.loc) n[t] = o.loc; else delete n[t]; return n })
            }
            const cycle = (ev: { stopPropagation: () => void }) => {
             ev.stopPropagation()
             setOpt(opts[(curIdx + 1) % opts.length])
            }
            const removeThisTime = () => {
             if (profile.quick_times.includes(t)) persistQuickTimes(profile.quick_times.filter(x => x !== t))
             setSelectedTimes(prev => prev.filter(x => x !== t))
             setSlotTypes(st => { const n = { ...st }; delete n[t]; return n })
             setSlotLocs(sl => { const n = { ...sl }; delete n[t]; return n })
            }
            return (
             <div key={t}
              onClick={() => {
               if (removeTimeMode) { removeThisTime(); return }
               if (locked) return
               if (selected) {
                setSelectedTimes(prev => prev.filter(x => x !== t))
                setSlotTypes(st => { const n = { ...st }; delete n[t]; return n })
                setSlotLocs(sl => { const n = { ...sl }; delete n[t]; return n })
               } else {
                setSelectedTimes(prev => [...prev, t])
                setOpt(opts[0]) // پیش‌فرض: اولین گزینه (بدونِ «هردو»)
               }
              }}
              className={`relative text-center py-2 border rounded-xl text-sm transition-all
               ${removeTimeMode ? 'cursor-pointer border-sand bg-gray-100 text-ink hover:bg-gray-200' :
                isPastTime ? 'border-sand bg-gray-50 text-gray-300 cursor-not-allowed line-through' :
                takenBy ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 cursor-not-allowed' :
                'cursor-pointer ' + (selected ? 'border-ink bg-sand text-ink font-medium' : 'border-sand text-soot hover:border-gray-300')}`}>
              {enTime(t)}
              {!removeTimeMode && takenBy && !isPastTime && <span className="block text-[10px] mt-0.5">🔒 {takenBy.name}</span>}
              {!removeTimeMode && selected && !locked && (
               fixed
                ? <span className="block text-[10px] mt-1 text-ink">{opts[0]?.label}</span>
                : <button onClick={cycle}
                  className="block w-full text-[10px] mt-1 text-ink bg-white/70 border border-sand rounded py-0.5 hover:bg-white truncate">{curLabel}</button>
              )}
             </div>
            )
           })}
          </div>
          <button onClick={saveSchedule} disabled={schedSaving}
           className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-ink/90 transition-colors">
           {schedSaving ? 'در حال ذخیره...' : schedSaved ? 'ذخیره شد!' : 'ذخیره برنامه'}
          </button>
         </div>
        )}
       </>
      )}

      {/* ════ نمای برنامه‌ی نوبت‌ها ════ */}
      {schedSubTab === 'agenda' && (
       <div className="space-y-3">
        {/* تاگلِ هفتگی/ماهانه */}
        <div className="flex bg-white rounded-xl border border-sand p-1">
         {([['week', 'هفتگی'], ['month', 'ماهانه']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setAgendaMode(k)}
           className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-all ${agendaMode === k ? 'bg-ink text-white' : 'text-soot'}`}>
           {label}
          </button>
         ))}
        </div>

        {(() => {
         const WEEK = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']
         // مرزِ هفته‌ها (شنبه‌ها در روزهای 6، 13، 20، 27 شروع می‌شوند؛ هفته‌ی اول 1 تا 5)
         const weekStarts = [1, 6, 13, 20, 27].filter(s => s <= daysInMonth)
         const wIdx = Math.min(weekIdx, weekStarts.length - 1)
         let rangeStart = 1, rangeEnd = daysInMonth
         if (agendaMode === 'week') {
          rangeStart = weekStarts[wIdx]
          rangeEnd = (weekStarts[wIdx + 1] ? weekStarts[wIdx + 1] - 1 : daysInMonth)
         }

         const days = []
         for (let d = rangeStart; d <= rangeEnd; d++) {
          const dateStr = `${schedYear}/${schedMonth + 1}/${d}`
          const sched = schedForDay(d)
          const appts = apptsForDate(dateStr)
          const slotTimes = sched?.available_times || []
          const extra = appts.map(a => a.time).filter(t => !slotTimes.includes(t))
          const allTimes = Array.from(new Set([...slotTimes, ...extra])).sort((a, b) => timeKey(a) - timeKey(b))
          if (allTimes.length === 0) continue
          days.push({ d, dateStr, appts, allTimes, weekday: WEEK[(d + 1) % 7] })
         }

         return (
          <>
           {agendaMode === 'week' && (
            <div className="flex items-center justify-between bg-white rounded-xl border border-sand px-3 py-2 gap-2">
             <button onClick={() => setWeekIdx(i => Math.max(0, i - 1))} disabled={wIdx === 0}
              className="px-3 py-1.5 border border-sand rounded-lg text-xs text-soot disabled:opacity-30 shrink-0">قبلی</button>
             <span className="text-xs text-soot text-center">هفته‌ی {toFarsiNum(wIdx + 1)} — {toFarsiNum(rangeStart)} تا {toFarsiNum(rangeEnd)} {PERSIAN_MONTHS[schedMonth]}</span>
             <button onClick={() => setWeekIdx(i => Math.min(weekStarts.length - 1, i + 1))} disabled={wIdx >= weekStarts.length - 1}
              className="px-3 py-1.5 border border-sand rounded-lg text-xs text-soot disabled:opacity-30 shrink-0">بعدی</button>
            </div>
           )}

           {days.length === 0 ? (
            <div className="text-center py-16 text-soot bg-white rounded-2xl border border-sand">
             {agendaMode === 'week' ? 'برای این هفته روز کاری‌ای تنظیم نشده است.' : 'برای این ماه روز کاری‌ای تنظیم نشده است.'}
            </div>
           ) : days.map(({ d, appts, allTimes, weekday }) => (
            <div key={d} className="bg-white rounded-2xl border border-sand p-4">
             <div className="flex items-center justify-between mb-3 pb-2 border-b border-sand">
              <span className="text-sm font-semibold text-ink">{weekday} {toFarsiNum(d)} {PERSIAN_MONTHS[schedMonth]}</span>
              <div className="flex items-center gap-2">
               <span className="text-xs text-soot">{toFarsiNum(appts.length)} از {toFarsiNum(allTimes.length)} رزرو</span>
               {appts.length > 0 && (
                <button onClick={() => cancelDay(`${schedYear}/${schedMonth + 1}/${d}`, appts)}
                 className="text-xs px-2 py-0.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5">لغو روز</button>
               )}
              </div>
             </div>
             <div className="space-y-1.5">
              {allTimes.map(t => {
               const appt = appts.find(a => a.time === t)
               const slotType = schedForDay(d)?.slot_types?.[t]
               const slotLoc = schedForDay(d)?.slot_locs?.[t]
               const slotTypeLabel = slotType === 'online' ? 'آنلاین' : slotType === 'offline' ? `${slotLoc || 'حضوری'}` : 'خالی'
               return (
                <div key={t} className="flex items-center gap-3 text-sm">
                 <span className="font-mono text-xs text-soot w-12 shrink-0">{enTime(t)}</span>
                 {appt ? (
                  <span className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${appt.color}`}>
                   <span className="font-medium">{appt.mode === 'online' ? '🎥 ' : appt.mode === 'offline' ? '🏥 ' : ''}{appt.name}</span>
                   <span className="flex items-center gap-2">
                    <span className="opacity-75">{appt.type}{appt.loc ? ` — ${appt.loc}` : ''}</span>
                    {!!appt.delayMinutes && (
                     <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded font-medium">⏱ {toFarsiNum(appt.delayMinutes)} د تاخیر</span>
                    )}
                    <button onClick={() => announceDelay(appt)}
                     className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-amber-600 hover:bg-amber-500/20">⏱ تاخیر</button>
                    <button onClick={() => cancelAppointment(appt)}
                     className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-red-600 hover:bg-red-500/20">لغو</button>
                   </span>
                  </span>
                 ) : (
                  <span className="flex-1 px-3 py-1.5 rounded-lg border border-dashed border-sand text-xs text-gray-300">{slotTypeLabel}</span>
                 )}
                </div>
               )
              })}
             </div>
            </div>
           ))}
          </>
         )
        })()}
       </div>
      )}
     </div>
    )}

    {/* ════════════════════════════════════════════════════════════════
      TAB: FINANCE (گزارشات مالی)
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'finance' && (
     <div className="space-y-4">
      {!financeLoaded ? (
       <div className="text-center py-16 text-soot">در حال محاسبه‌ی گزارش...</div>
      ) : !finance ? (
       <div className="text-center py-16 text-soot">داده‌ای برای نمایش نیست</div>
      ) : (() => {
       const f = finance
       const money = (n: number) => n.toLocaleString('en-US') + ' تومان'
       const cats = [
        { key: 'interview', label: 'مصاحبه‌ی اولیه', icon: '🩺', amount: f.paid.interview, count: f.paidCount.interview },
        { key: 'assessment', label: 'ارزیابی', icon: '🧩', amount: f.paid.assessment, count: f.paidCount.assessment },
        { key: 'packages', label: 'پروتکل درمان', icon: '📦', amount: f.paid.packages, count: f.paidCount.packages },
        { key: 'sessions', label: 'جلسه‌ی جداگانه', icon: '📅', amount: f.paid.sessions, count: f.paidCount.sessions },
       ]
       const maxCat = Math.max(1, ...cats.map(c => c.amount))
       const maxMonth = Math.max(1, ...f.monthly.map(m => m.amount))
       const splitTotal = Math.max(1, f.split.online + f.split.offline)
       const pendCats = [
        { label: 'مصاحبه', amount: f.pending.interview, count: f.pendingCount.interview },
        { label: 'ارزیابی', amount: f.pending.assessment, count: f.pendingCount.assessment },
        { label: 'پروتکل درمان', amount: f.pending.packages, count: f.pendingCount.packages },
        { label: 'جلسه‌ی جداگانه', amount: f.pending.sessions, count: f.pendingCount.sessions },
       ].filter(c => c.amount > 0)

       return (
        <>
         {/* عنوان + بازه‌ی زمانی + بروزرسانی */}
         <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-soot">ارقام از پرداخت‌های تأییدشده در بازه‌ی انتخابی محاسبه شده‌اند.</p>
          <button onClick={() => { setFinanceLoaded(false); loadFinance() }}
           className="text-xs px-3 py-1.5 border border-sand rounded-lg text-soot hover:bg-gray-50">↻ بروزرسانی</button>
         </div>
         <div className="flex bg-white rounded-xl border border-sand p-1 gap-1">
          {([['1m', '1 ماه'], ['3m', '3 ماه'], ['6m', '6 ماه'], ['12m', '12 ماه'], ['all', 'همه']] as const).map(([k, lbl]) => (
           <button key={k} onClick={() => { setFinanceRange(k); setFinanceCustomOpen(false); setFinanceLoaded(false); loadFinance(k) }}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${financeRange === k ? 'bg-ink text-white' : 'text-soot hover:bg-gray-50'}`}>
            {lbl}
           </button>
          ))}
         </div>

         {/* بازه‌ی دقیقِ جلالی */}
         <div className="bg-white rounded-xl border border-sand p-3">
          <button onClick={() => setFinanceCustomOpen(o => !o)}
           className={`text-xs font-medium ${financeRange === 'custom' ? 'text-ink' : 'text-soot'}`}>
           بازه‌ی دقیق {financeRange === 'custom' && financeFromIso ? '(فعال)' : ''} {financeCustomOpen ? '▲' : '▼'}
          </button>
          {financeCustomOpen && (
           <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
             <span className="text-xs text-soot w-8 shrink-0">از</span>
             <JalaliDateSelect value={fromJ} onChange={setFromJ} />
            </div>
            <div className="flex items-center justify-between gap-2">
             <span className="text-xs text-soot w-8 shrink-0">تا</span>
             <JalaliDateSelect value={toJ} onChange={setToJ} />
            </div>
            <button onClick={applyCustomRange}
             className="w-full py-2 bg-ink text-white rounded-lg text-xs font-medium hover:bg-ink/90">اعمالِ بازه</button>
           </div>
          )}
         </div>

         {/* ناوبریِ سریع — برای پیداکردنِ فوریِ هر بخش بدونِ اسکرول‌کردنِ کور */}
         <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {[['#fin-summary', 'خلاصه'], ['#fin-settlement', 'تسویه‌ی آنلاین'], ['#fin-refunds', 'بازپرداخت‌ها'], ['#fin-cats', 'دسته‌ها'], ['#fin-trend', 'روند'], ['#fin-cases', 'پرونده‌ها']].map(([href, lbl]) => (
           <a key={href} href={href} className="shrink-0 text-[11px] px-3 py-1.5 rounded-full bg-white border border-sand text-soot hover:text-ink hover:border-ink transition-colors">
            {lbl}
           </a>
          ))}
         </div>

         {/* خلاصه */}
         <div id="fin-summary" className="grid grid-cols-1 sm:grid-cols-3 gap-3 scroll-mt-4">
          <div className="bg-white rounded-2xl border border-sand p-5">
           <div className="text-xs text-soot mb-1">درآمدِ خالص</div>
           <div className="text-2xl font-bold text-ink">{money(f.netPaid)}</div>
           {f.refundsTotal > 0 && (
            <div className="text-[11px] text-soot mt-1">ناخالص {money(f.totalPaid)} − بازپرداخت {money(f.refundsTotal)}</div>
           )}
          </div>
          <div className="bg-white rounded-2xl border border-sand p-5">
           <div className="text-xs text-soot mb-1">در انتظارِ تأیید</div>
           <div className="text-2xl font-bold text-soot">{money(f.totalPending)}</div>
          </div>
          <div className={`rounded-2xl border p-5 ${f.settlement.owed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-sand'}`}>
           <div className="text-xs text-soot mb-1">تسویه‌ی معوقِ آنلاین</div>
           <div className={`text-2xl font-bold ${f.settlement.owed > 0 ? 'text-amber-800' : 'text-ink'}`}>{money(f.settlement.owed)}</div>
           {f.settlement.owed > 0 && <div className="text-[11px] text-amber-700 mt-1">هنوز از {PLATFORM_NAME} به شما واریز نشده</div>}
          </div>
         </div>

         {/* تسویه‌ی پرداختِ آنلاین — چون همه‌ی تراکنش‌هایِ آنلاین اول به حسابِ پلتفرم می‌رود */}
         {f.settlement.count > 0 && (
          <div id="fin-settlement" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
           <h2 className="text-sm font-display font-semibold text-ink mb-1">تسویه‌ی پرداختِ آنلاین</h2>
           <p className="text-xs text-soot mb-4">
            پرداختِ آنلاین (زیبال) اول به حسابِ خودِ {PLATFORM_NAME} می‌نشیند، بعد سهمِ شما (منهایِ کارمزدِ توافق‌شده) تسویه می‌شود.
           </p>
           <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between p-3 rounded-xl border border-sand">
             <span className="text-soot">کلِ تراکنش‌هایِ آنلاین</span>
             <span className="font-medium text-ink tnum">{money(f.settlement.totalOnline)}</span>
            </div>
            <div className="flex justify-between p-3 rounded-xl border border-sand">
             <span className="text-soot">کارمزدِ پلتفرم</span>
             <span className="font-medium text-soot tnum">− {money(f.settlement.totalCommission)}</span>
            </div>
            {f.settlement.autoSettled > 0 && (
             <div className="flex justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50">
              <span className="text-emerald-800">خودکار واریزشده به شما</span>
              <span className="font-medium text-emerald-800 tnum">{money(f.settlement.autoSettled)}</span>
             </div>
            )}
            <div className="flex justify-between p-3 rounded-xl border border-amber-200 bg-amber-50">
             <span className="text-amber-800">معوق (هنوز واریز نشده)</span>
             <span className="font-medium text-amber-800 tnum">{money(f.settlement.owed)}</span>
            </div>
           </div>
           <p className="text-[11px] text-soot mt-3">تسویه‌ی معوق فعلاً دستی هماهنگ می‌شود — برایِ زمان‌بندیِ واریز با پشتیبانی در تماس باشید.</p>
          </div>
         )}

         {/* بازپرداختِ کنسلی‌ها — حالا با فهرستِ تک‌به‌تک، نه فقط جمعِ کل */}
         <div id="fin-refunds" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
          <div className="flex items-center justify-between mb-1">
           <h2 className="text-sm font-display font-semibold text-ink">بازپرداختِ کنسلی‌ها</h2>
           {f.refundsTotal > 0 && <span className="text-sm font-semibold text-ink">− {money(f.refundsTotal)}</span>}
          </div>
          {f.refundsList.length === 0 ? (
           <p className="text-xs text-soot mt-2">در این بازه بازپرداختی ثبت نشده.</p>
          ) : (
           <div className="space-y-2 mt-3">
            {f.refundsList.map((r, i) => (
             <div key={i} className="flex items-center justify-between text-sm p-2.5 rounded-xl border border-sand">
              <div>
               <span className="text-ink">{r.name}</span>
               <span className="text-[11px] text-soot block mt-0.5">
                {toFarsiNum(r.percent)}٪ بازگشت · {new Date(r.date).toLocaleDateString('fa-IR')}{r.card ? ` · کارت ${r.card}` : ''}
               </span>
              </div>
              <span className="font-medium text-ink tnum shrink-0">{money(r.amount)}</span>
             </div>
            ))}
           </div>
          )}
         </div>

         {/* درآمد به تفکیکِ دسته */}
         <div id="fin-cats" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
          <h2 className="text-sm font-display font-semibold text-ink mb-4">درآمد به تفکیکِ دسته</h2>
          <div className="space-y-3">
           {cats.map(c => (
            <div key={c.key}>
             <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-ink">{c.icon} {c.label}{' '}
               <span className="text-soot text-xs">({toFarsiNum(c.count)} مورد)</span></span>
              <span className="font-medium text-ink">{money(c.amount)}</span>
             </div>
             <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-ink rounded-full" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
             </div>
            </div>
           ))}
          </div>
         </div>

         {/* روندِ ماهانه */}
         <div id="fin-trend" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
          <h2 className="text-sm font-display font-semibold text-ink mb-4">روندِ درآمدِ ماهانه</h2>
          {f.monthly.length === 0 ? (
           <p className="text-xs text-soot">هنوز درآمدی ثبت نشده است.</p>
          ) : (
           <div className="space-y-2.5">
            {f.monthly.map(m => {
             const [y, mm] = m.month.split('/')
             const label = `${PERSIAN_MONTHS[parseInt(mm) - 1]} ${y}`
             return (
              <div key={m.month}>
               <div className="flex justify-between text-xs mb-1">
                <span className="text-soot">{label}</span>
                <span className="text-ink font-medium">{money(m.amount)}</span>
               </div>
               <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-ink rounded-full" style={{ width: `${(m.amount / maxMonth) * 100}%` }} />
               </div>
              </div>
             )
            })}
           </div>
          )}
         </div>

         {/* تفکیکِ آنلاین/حضوری */}
         <div className="bg-white rounded-2xl border border-sand p-5">
          <h2 className="text-sm font-display font-semibold text-ink mb-3">تفکیکِ آنلاین / حضوری (جلسات و پکیج‌ها)</h2>
          <div className="flex h-4 rounded-full overflow-hidden mb-2 bg-gray-100">
           <div className="bg-ink" style={{ width: `${(f.split.online / splitTotal) * 100}%` }} />
           <div className="bg-gray-300" style={{ width: `${(f.split.offline / splitTotal) * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs">
           <span className="text-soot">آنلاین: {money(f.split.online)}</span>
           <span className="text-soot">حضوری: {money(f.split.offline)}</span>
          </div>
         </div>

         {/* در انتظارِ تأیید به تفکیک */}
         {pendCats.length > 0 && (
          <div className="bg-white rounded-2xl border border-sand p-5">
           <h2 className="text-sm font-display font-semibold text-ink mb-3">در انتظارِ تأییدِ شما</h2>
           <div className="space-y-2">
            {pendCats.map(c => (
             <div key={c.label} className="flex items-center justify-between text-sm">
              <span className="text-ink">{c.label} <span className="text-xs text-soot">({toFarsiNum(c.count)} مورد)</span></span>
              <span className="font-medium text-soot">{money(c.amount)}</span>
             </div>
            ))}
           </div>
           <p className="text-[11px] text-soot mt-3">این مبالغ از طرفِ مراجع اعلام شده ولی هنوز تأیید نشده‌اند. برای تأیید به تبِ «تأیید پرداخت‌ها» بروید.</p>
          </div>
         )}

         {/* پرونده‌های برتر */}
         <div id="fin-cases" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
          <h2 className="text-sm font-display font-semibold text-ink mb-3">پرونده‌های با بیشترین پرداخت</h2>
          {f.topCases.length === 0 ? (
           <p className="text-xs text-soot">—</p>
          ) : (
           <div className="space-y-2">
            {f.topCases.map((c, i) => (
             <div key={c.case_number} className="flex items-center justify-between text-sm">
              <span className="text-ink">{toFarsiNum(i + 1)}. {c.name}{' '}
               <span className="text-xs text-soot">({c.case_number})</span></span>
              <span className="font-medium text-ink">{money(c.amount)}</span>
             </div>
            ))}
           </div>
          )}
         </div>
        </>
       )
      })()}
     </div>
    )}

    {/* ════════════════════════════════════════════════════════════════
      TAB: SETTINGS
    ════════════════════════════════════════════════════════════════ */}
    {mainTab === 'settings_hub' && (
     <div className="space-y-4 pb-24">
      {!settingsLoaded || !profileLoaded ? (
       <div className="text-center py-16 text-soot">در حال بارگذاری تنظیمات...</div>
      ) : (
      <>
       {/* سوییچرِ دکتر — فقط وقتی owner است و بیش از یک نفر پرسنل دارد */}
       {['profile', 'payments', 'pricing', 'form'].includes(settingsSubTab) && me?.isOwner && staffList.filter(r => r.is_active).length > 1 && (
        <section className="bg-white rounded-2xl border border-sand p-5">
         <h2 className="text-sm font-display font-semibold text-ink mb-1">پروفایلِ کدام دکتر؟</h2>
         <p className="text-xs text-soot mb-3">مجموعه‌ی شما چند نفر پرسنل دارد؛ اول انتخاب کنید پروفایل و برنامه‌ی کاریِ کدام‌شان را ویرایش می‌کنید.</p>
         <select value={viewingResourceId || staffList.find(r => r.is_active)?.id || ''} onChange={e => { setViewingResourceId(e.target.value); setProfileLoaded(false); setIntakeLoaded(false) }}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink">
          {staffList.filter(r => r.is_active).map(r => (
           <option key={r.id} value={r.id}>{r.name}{r.title ? ` — ${r.title}` : ''}</option>
          ))}
         </select>
        </section>
       )}

       {/* پروفایلِ عمومی — حالا per-resource؛ دقیقاً شبیه‌سازیِ سرِ صفحه‌ی مصاحبه، مستقیم روی خودش ویرایش می‌شود */}
       {settingsSubTab === 'profile' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">پروفایلِ عمومی</h2>
        <p className="text-xs text-soot mb-4">دقیقاً همین‌طور بالای صفحه‌ی مصاحبه به مراجع نمایش داده می‌شود — روی هرکدام بزنید تا ویرایش کنید.</p>

        <div className="bg-gray-50 rounded-2xl p-6 text-center">
         <div className="relative w-20 h-20 rounded-full bg-sand border border-sand flex items-center justify-center mx-auto mb-3 text-3xl overflow-hidden shrink-0 cursor-pointer group"
          onClick={async () => { const url = await uiPrompt('لینکِ عکسِ پروفایل (خالی برای حذف)', { defaultValue: profile.avatar_url }); if (url !== null) patchProfile({ avatar_url: url }) }}>
          {profile.avatar_url
           ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
           : ''}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition-opacity">تغییرِ عکس</div>
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
          <button onClick={() => patchProfile({ badges: [...profile.badges, 'نشانِ جدید'] })}
           className="text-xs px-3 py-1 border border-dashed border-gray-300 rounded-lg text-soot hover:border-gray-400 hover:text-soot">
           + نشان
          </button>
         </div>
        </div>
       </section>
       )}

       {/* نوعِ جلسات — per-resource (هر دکتر مدِ خودش را دارد) */}
       {settingsSubTab === 'profile' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">نوعِ جلساتِ قابلِ ارائه</h2>
        <p className="text-xs text-soot mb-4">تعیین می‌کند مراجع هنگامِ رزرو چه گزینه‌هایی ببیند.</p>
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
           <div className="text-xl mb-1">{icon}</div>
           <div className="text-xs font-medium text-ink">{label}</div>
          </button>
         ))}
        </div>
       </section>
       )}

       {/* روش‌های پرداخت — per-resource؛ حداقل یکی باید روشن بماند */}
       {settingsSubTab === 'payments' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">روش‌های پرداخت</h2>
        <p className="text-xs text-soot mb-4">
         آنلاین یعنی مراجع بلافاصله بعدِ پرداخت می‌تواند ادامه دهد (بدونِ نیاز به تاییدِ شما).
         کارت‌به‌کارت مثلِ قبل: مراجع فیشش را می‌فرستد و شما تایید می‌کنید.
        </p>
        <div className="space-y-2">
         <label className={'flex items-center justify-between p-3 rounded-xl border border-sand ' + (tenantPlan === 'pro' ? 'cursor-pointer' : 'opacity-60')}>
          <div>
           <span className="text-sm text-ink block">کارت‌به‌کارت</span>
           <span className="text-[11px] text-soot">
            {tenantPlan === 'pro' ? 'نیاز به تاییدِ دستیِ شما دارد' : 'در پلنِ رایگان در دسترس نیست — نیازِ پلنِ حرفه‌ای دارد'}
           </span>
          </div>
          <input type="checkbox" checked={profile.payment_methods.card_to_card}
           disabled={tenantPlan !== 'pro'}
           onChange={e => patchProfile({ payment_methods: { ...profile.payment_methods, card_to_card: e.target.checked } })}
           className="w-5 h-5 accent-ink disabled:opacity-50" />
         </label>
         <label className={'flex items-center justify-between p-3 rounded-xl border border-sand ' + (tenantPlan === 'pro' ? 'cursor-pointer' : 'opacity-60')}>
          <div>
           <span className="text-sm text-ink block">پرداختِ آنلاین (زیبال)</span>
           <span className="text-[11px] text-soot">
            {tenantPlan === 'pro' ? 'تاییدِ خودکار — مراجع بلافاصله می‌تواند نوبت بگیرد' : 'در پلنِ رایگان همیشه روشن است'}
           </span>
          </div>
          <input type="checkbox" checked={profile.payment_methods.online}
           disabled={tenantPlan !== 'pro'}
           onChange={e => patchProfile({ payment_methods: { ...profile.payment_methods, online: e.target.checked } })}
           className="w-5 h-5 accent-ink disabled:opacity-50" />
         </label>
         {!profile.payment_methods.card_to_card && !profile.payment_methods.online && (
          <p className="text-[11px] text-ink px-1">حداقل یک روش باید فعال بماند.</p>
         )}
        </div>
       </section>
       )}

       {/* شبایِ تسویه — برایِ واریزِ خودکارِ سهمِ خودتان از پرداختِ آنلاین */}
       {settingsSubTab === 'payments' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">شبایِ دریافتِ سهم از پرداختِ آنلاین</h2>
        <p className="text-xs text-soot mb-4">
         چون پرداختِ آنلاین از حسابِ پلتفرم رد می‌شود، سهمِ شما برایِ واریزِ خودکار به این شبا نیاز دارد. تا وقتی این را ثبت نکنید، تسویه به‌صورتِ دستی هماهنگ می‌شود.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
         <input
          dir="ltr"
          placeholder="IR00 0000 0000 0000 0000 0000 00"
          value={profile.settlement_sheba}
          onChange={e => patchProfile({ settlement_sheba: e.target.value })}
          className="border border-sand rounded-xl px-3 py-2 text-sm tnum"
         />
         <input
          placeholder="نامِ صاحبِ حساب"
          value={profile.settlement_sheba_holder_name}
          onChange={e => patchProfile({ settlement_sheba_holder_name: e.target.value })}
          className="border border-sand rounded-xl px-3 py-2 text-sm"
         />
        </div>
       </section>
       )}

       {/* مکان‌های حضوری — سطحِ tenant، مشترکِ همه‌ی دکترها؛ فقط owner ویرایش می‌کند */}
       {settingsSubTab === 'locations' && me?.isOwner !== false && (
        <section className="bg-white rounded-2xl border border-sand p-5">
         <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-display font-semibold text-ink">مکان‌های جلسه‌ی حضوری</h2>
         </div>
         <p className="text-xs text-soot mb-4">می‌توانید چند مطب/آدرس تعریف کنید؛ بینِ همه‌ی دکترهای این مجموعه مشترک است.</p>
         <div className="space-y-3">
          {settings.office_locations.map((loc, i) => (
           <div key={loc.id} className="border border-sand rounded-xl p-3 bg-gray-50">
            <div className="flex items-center gap-2 mb-2">
             <input value={loc.title}
              onChange={e => {
               const next = [...settings.office_locations]; next[i] = { ...loc, title: e.target.value }
               patchSettings({ office_locations: next })
              }}
              placeholder="نامِ مطب (مثلاً مطب ولنجک)"
              className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
             <button onClick={() => patchSettings({ office_locations: settings.office_locations.filter((_, j) => j !== i) })}
              className="text-xs px-2.5 py-2 border border-red-500/30 text-red-600 rounded-lg shrink-0 hover:bg-red-500/5">حذف</button>
            </div>
            <input value={loc.address}
             onChange={e => {
              const next = [...settings.office_locations]; next[i] = { ...loc, address: e.target.value }
              patchSettings({ office_locations: next })
             }}
             placeholder="آدرسِ کامل"
             className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
           </div>
          ))}
         </div>
         <button onClick={() => patchSettings({ office_locations: [...settings.office_locations, { id: genId('loc'), title: '', address: '' }] })}
          className="mt-3 text-xs px-3 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand">+ افزودنِ مکان</button>
        </section>
       )}

       {/* شماره کارت‌ها — per-resource (کارتِ دریافتِ وجه/بازپرداختِ خودِ هر دکتر) */}
       {settingsSubTab === 'payments' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">شماره کارت‌های واریزی</h2>
        <p className="text-xs text-soot mb-4">این کارت‌ها در صفحه‌ی پرداختِ کارت‌به‌کارت به مراجع نمایش داده می‌شوند.</p>
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
             placeholder="نامِ صاحبِ کارت"
             className="text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
            <input value={c.bank || ''}
             onChange={e => {
              const next = [...profile.cards]; next[i] = { ...c, bank: e.target.value }
              patchProfile({ cards: next })
             }}
             placeholder="نامِ بانک (اختیاری)"
             className="text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
           </div>
          </div>
         ))}
        </div>
        <button onClick={() => patchProfile({ cards: [...profile.cards, { id: genId('card'), number: '', holder: '' }] })}
         className="mt-3 text-xs px-3 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand">+ افزودنِ کارت</button>
       </section>
       )}

       {/* قیمت‌گذاری — per-resource؛ فقط دو قیمت: آنلاین/حضوری. نوعِ کار (مصاحبه/
           ارزیابی/جلسه/پروتکل) فرقی نمی‌کند، فقط نوعِ حضور قیمت را تعیین می‌کند. */}
       {settingsSubTab === 'pricing' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">قیمت‌گذاری</h2>
        <p className="text-xs text-soot mb-4">فقط نوعِ حضور قیمت را تعیین می‌کند — مصاحبه، ارزیابی، و جلسه هرکدام با همین دو قیمت حساب می‌شوند. روی رزروهای تازه اعمال می‌شود (رزروهای قبلی با همان قیمتِ زمانِ ثبت‌شان می‌مانند).</p>
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
       </section>
       )}

       {/* کدهای تخفیف — per-resource؛ اختیاری برایِ بعضی مراجعان */}
       {settingsSubTab === 'pricing' && (
        <DiscountCodesSection slug={slug} isOwner={!!me?.isOwner} viewingResourceId={viewingResourceId} />
       )}

       {/* همراه/تماسِ دوم — کاملاً اختیاری، برچسبش را خودِ متخصص تعیین می‌کند.
           اینجاست چون مستقیم به فرمِ رزرو مربوط می‌شود (بخشِ «همراه» تویِ فرم و
           انتخابِ حضورِ جلسات)، نه به هویتِ خودِ متخصص. */}
       {settingsSubTab === 'form' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">همراه / تماسِ دوم</h2>
        <p className="text-xs text-soot mb-4">
         اگر معمولاً یک نفرِ دیگر هم تویِ کارتان دخیل است (والدینِ کودک، همسر، همراهِ سالمند...)، اسمش را اینجا بگذارید تا تویِ فرمِ رزرو و جلسات با همین اسم نمایش داده شود. اگر کارتان مستقیم با خودِ مراجع است، خالی بگذارید.
        </p>
        <input value={profile.companion_label} onChange={e => patchProfile({ companion_label: e.target.value })}
         placeholder="مثلاً: والدین، همسر، همراه (خالی = استفاده نمی‌کنم)"
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
       </section>
       )}

       {/* فرمِ رزرو — استادو-جزئیات: لیستِ سوال‌ها + پنلِ ویرایشِ متمرکز */}
       {settingsSubTab === 'form' && (
       <section className="bg-white rounded-2xl border border-sand p-5">
        <h2 className="text-sm font-display font-semibold text-ink mb-1">فرمِ رزرو</h2>
        <p className="text-xs text-soot mb-4">
         از لیست یه سوال رو انتخاب کن تا تو پنلِ کنارش ویرایشش کنی. نام و شماره‌تماس همیشه ثابت‌اند و این‌جا نیستند.
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
              {/* ── ردیفِ بخش: پس‌زمینه‌ی پررنگ‌تر + بولد + آیکونِ پوشه، تا کاملاً از سوال‌ها جدا دیده شود ── */}
              <div
               className={`w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg transition-colors bg-gray-200/70 ${
                isOpen ? 'ring-1 ring-inset ring-gray-300' : 'hover:bg-gray-200'}`}>
               <span draggable title="جابه‌جایی"
                onDragStart={e => { e.stopPropagation(); setDragSectionIdx(sIdx) }}
                onDragEnd={() => { setDragSectionIdx(null); setDragOverSectionIdx(null) }}
                className="text-soot text-xs shrink-0 cursor-grab active:cursor-grabbing px-0.5">⠿</span>
               <button onClick={() => { setOpenSection(x => x === section.id ? null : section.id); setBuilderSel({ sIdx, fIdx: null }) }}
                className="flex-1 min-w-0 flex items-center gap-2 text-right">
                <span className={`text-[9px] text-soot shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}>◂</span>
                <span className="text-xs shrink-0"></span>
                <span className="flex-1 min-w-0 truncate text-sm font-bold text-ink">{section.title || 'بخشِ بی‌نام'}</span>
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
                     <span className={`flex-1 min-w-0 truncate text-xs ${isConditional ? 'text-ink' : 'text-ink'}`}>{field.label || 'بدونِ عنوان'}</span>
                     {field.hidden && <span title="مخفی" className="text-[10px] text-soot shrink-0">🚫</span>}
                     {field.required && <span title="اجباری" className="w-1.5 h-1.5 rounded-full bg-ink shrink-0" />}
                    </button>
                   </div>
                  </div>
                 )
                })}
                <button onClick={() => addFormField(sIdx)}
                 className="w-full text-[11px] pr-4 pl-2.5 py-1.5 text-soot hover:text-ink text-right">+ سوالِ جدید</button>
               </div>
              )}
             </div>
            )
           })}
           <button onClick={addFormSection}
            className="w-full mt-1 text-xs py-2 border border-dashed border-gray-300 text-soot rounded-lg hover:border-gray-400 hover:text-ink">+ بخشِ جدید</button>
          </div>

          {/* ── پنلِ ویرایشِ متمرکز ── */}
          <div>
           {!builderSel ? (
            <div className="h-full min-h-[240px] flex items-center justify-center text-center text-sm text-soot bg-gray-50 rounded-xl p-8">
             یه سوال یا بخش رو از لیست انتخاب کن تا اینجا ویرایشش کنی
            </div>
           ) : builderSel.fIdx === null ? (
            // ── ویرایشِ بخش ──
            (() => {
             const sIdx = builderSel.sIdx
             const section = intakeForm.sections[sIdx]
             if (!section) return null
             return (
              <div className="bg-gray-50 rounded-xl p-5">
               <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-soot">ویرایشِ بخش — برای جابه‌جایی، از لیستِ کنار درگ کن</span>
                <button onClick={async () => { if (await uiConfirm(`بخشِ «${section.title}» با همه‌ی سوال‌هایش حذف شود؟`)) removeFormSection(sIdx) }}
                 className="text-xs px-2.5 py-1.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5 shrink-0">حذفِ بخش</button>
               </div>
               <label className="text-xs text-soot mb-1 block">عنوانِ بخش</label>
               <input value={section.title} onChange={e => updateFormSection(sIdx, { title: e.target.value })}
                className="w-full text-base font-medium px-3 py-2.5 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
              </div>
             )
            })()
           ) : (
            // ── ویرایشِ سوال ──
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
                <span className="text-xs text-soot">ویرایشِ سوال — برای جابه‌جایی، از لیستِ کنار درگ کن</span>
                <div className="flex items-center gap-1.5 shrink-0">
                 <button onClick={() => updateFormField(sIdx, fIdx, { hidden: !field.hidden })}
                  title={field.hidden ? 'نمایشِ دوباره' : 'مخفی‌کردنِ موقت (بدونِ حذف)'}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg border ${field.hidden ? 'border-sand bg-gray-100 text-soot' : 'border-sand bg-white text-soot hover:text-soot'}`}>
                  {field.hidden ? '🚫' : ''}
                 </button>
                 <button onClick={() => removeFormField(sIdx, fIdx)}
                  className="text-xs px-2.5 py-1.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5">حذفِ سوال</button>
                </div>
               </div>

               {field.hidden && (
                <div className="text-xs text-ink bg-gray-100 border border-sand rounded-lg p-2.5">
                 این سوال الان مخفی است — مراجع اصلاً نمی‌بیندش، ولی حذف نشده و هروقت خواستی می‌تونی برش‌گردونی.
                </div>
               )}

               {/* پیش‌نمایشِ زنده */}
               <div className="bg-white rounded-xl border border-sand p-4">
                <p className="text-[10px] text-soot mb-2">این‌طوری مراجع می‌بیند:</p>
                <div className="flex items-center gap-1 mb-1.5">
                 <span className="text-xs text-soot">{field.label || 'بدونِ عنوان'}</span>
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
                  <span>انتخابِ تاریخ</span>
                  <span></span>
                 </div>
                )}
                {field.type === 'phone' && (
                 <input disabled dir="ltr" placeholder="09xxxxxxxxx" className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-gray-50 text-soot" />
                )}
               </div>

               {/* اگر این سوال خودش وابسته به یه سوالِ قبلیه — فقط نمایشی، ساخته نمی‌شه اینجا */}
               {field.showIf && (
                <div className="flex items-center justify-between gap-2 text-xs bg-gray-100 border border-sand rounded-lg p-3">
                 <span className="text-ink">
                  ⑂ این سوال فقط وقتی نشون داده می‌شه که پاسخِ «{triggerField?.label || '؟'}» برابرِ «{field.showIf.value}» باشد
                 </span>
                 <button onClick={() => updateFormField(sIdx, fIdx, { showIf: undefined })}
                  className="text-red-500 hover:text-red-700 shrink-0">حذفِ شرط</button>
                </div>
               )}

               <div>
                <label className="text-xs text-soot mb-1 block">متنِ سوال</label>
                <input value={field.label} onChange={e => updateFormField(sIdx, fIdx, { label: e.target.value })}
                 className="w-full text-base px-3 py-2.5 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
               </div>

               <div>
                <label className="text-xs text-soot mb-2 block">نوعِ پاسخ</label>
                <div className="grid grid-cols-6 gap-1.5">
                 {(['text', 'textarea', 'select', 'multiselect', 'date', 'phone'] as FormFieldType[]).map(t => (
                  <button key={t} onClick={() => updateFormField(sIdx, fIdx, { type: t })}
                   className={`py-2 rounded-xl border text-center transition-all ${field.type === t ? 'border-ink border-2 bg-sand text-ink' : 'border-sand bg-white text-soot hover:border-gray-300'}`}>
                   <div className="text-sm mb-0.5">{fieldTypeIcon(t)}</div>
                   <div className="text-[9px]">{fieldTypeLabel(t)}</div>
                  </button>
                 ))}
                </div>
                <p className="text-[11px] text-soot mt-1.5 px-0.5">
                 {field.type === 'text' && 'مراجع یک خط متن کوتاه می‌نویسد — مثلِ اسم یا سن.'}
                 {field.type === 'textarea' && 'مراجع چند خط توضیح می‌نویسد — مثلِ دلیلِ مراجعه.'}
                 {field.type === 'select' && 'مراجع فقط یکی از گزینه‌ها را انتخاب می‌کند — مثلِ بله/خیر.'}
                 {field.type === 'multiselect' && 'مراجع می‌تواند چند گزینه را همزمان انتخاب کند — مثلِ چند علامتِ رفتاری.'}
                 {field.type === 'date' && 'مراجع با یک تقویمِ واقعیِ شمسی (کلیک‌پذیر) تاریخ را انتخاب می‌کند — نه تایپِ دستی.'}
                 {field.type === 'phone' && 'فقط شماره‌ی موبایلِ معتبر (11 رقم، با 09) قبول می‌شود — نه هر متنی.'}
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
                  className="mt-2 text-xs px-3 py-1.5 border border-dashed border-gray-300 text-soot rounded-lg hover:border-gray-400 hover:text-soot">+ افزودنِ گزینه</button>
                </div>
               )}

               <label className="flex items-center justify-between p-3 rounded-xl border border-sand bg-white cursor-pointer">
                <span className="text-sm text-ink">پاسخ به این سوال اجباری باشد</span>
                <input type="checkbox" checked={field.required}
                 onChange={e => updateFormField(sIdx, fIdx, { required: e.target.checked })}
                 className="w-5 h-5 accent-ink" />
               </label>

               {/* منطقِ شرطی — از اینجا (سوالِ گزینه‌ای) تعیین می‌کنی هر جواب چه سوال‌هایی رو بعدش باز کنه */}
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
                         {d.field.label || 'بدونِ عنوان'}
                         <button onClick={() => updateFormField(d.sIdx, d.fIdx, { showIf: undefined })}
                          title="قطعِ این زیرسوال از این گزینه" className="text-soot hover:text-ink leading-none">×</button>
                        </span>
                       ))}
                      </div>
                     )}

                     <div className="flex items-center gap-2">
                      <input value={newSubQuestion[key] || ''}
                       onChange={e => setNewSubQuestion(s => ({ ...s, [key]: e.target.value }))}
                       onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubQuestion(sIdx, fIdx, opt) } }}
                       placeholder="زیرسوالِ تازه بنویس..."
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

       {/* نوارِ ذخیره (چسبیده به پایین) — فقط وقتی چیزی واقعاً عوض شده باشد، و فقط رویِ زیرتب‌هایی که این دکمه ذخیره‌شان می‌کند */}
       {['profile', 'payments', 'pricing', 'locations', 'form'].includes(settingsSubTab) && (isSettingsTabDirty || settingsSaved || profileSaved || intakeSaved) && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 border-t border-sand backdrop-blur">
         <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-end gap-3">
          {(settingsSaved || profileSaved || intakeSaved) && <span className="text-xs text-emerald-600 font-medium">✓ تنظیمات ذخیره شد</span>}
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
   {showNewPackage && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
     <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" dir="rtl">
      <h2 className="font-display font-semibold text-ink mb-4">تعریف پروتکل درمانی جدید</h2>
      <div className="space-y-3">
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">ماه</label>
         <select value={newPkg.month} onChange={e => setNewPkg({...newPkg, month: e.target.value})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white">
          {PERSIAN_MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
         </select>
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">سال</label>
         <input value={newPkg.year} onChange={e => setNewPkg({...newPkg, year: e.target.value})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg" placeholder="1404" />
        </div>
       </div>
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">تعداد جلسه‌یِ مراجع</label>
         <input type="number" value={newPkg.primary_sessions} onChange={e => setNewPkg({...newPkg, primary_sessions: parseInt(e.target.value)})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">نوع جلسه‌یِ مراجع</label>
         <select value={newPkg.primary_session_type} onChange={e => setNewPkg({...newPkg, primary_session_type: e.target.value})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white">
          <option value="offline">حضوری — {profile.pricing.offline.toLocaleString('en-US')}</option>
          <option value="online">آنلاین — {profile.pricing.online.toLocaleString('en-US')}</option>
         </select>
        </div>
       </div>
       {(newPkg.secondary_sessions > 0 || profile.companion_label) && (
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">تعداد جلسه‌یِ {profile.companion_label || 'همراه'}</label>
         <input type="number" value={newPkg.secondary_sessions} onChange={e => setNewPkg({...newPkg, secondary_sessions: parseInt(e.target.value)})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">نوع جلسه‌یِ {profile.companion_label || 'همراه'}</label>
         <select value={newPkg.secondary_session_type} onChange={e => setNewPkg({...newPkg, secondary_session_type: e.target.value})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white">
          <option value="offline">حضوری — {profile.pricing.offline.toLocaleString('en-US')}</option>
          <option value="online">آنلاین — {profile.pricing.online.toLocaleString('en-US')}</option>
         </select>
        </div>
       </div>
       )}
       <div>
        <label className="text-xs text-soot mb-1 block">توضیحات پروتکل درمان</label>
        <textarea value={newPkg.notes} onChange={e => setNewPkg({...newPkg, notes: e.target.value})}
         rows={3} placeholder="پروتکل درمانی، اهداف کلی..."
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none" />
       </div>
       <div className="bg-sand rounded-lg p-3 border border-sand">
        <div className="flex justify-between text-sm">
         <span className="text-soot">مجموع مبلغ پروتکل درمان:</span>
         <span className="font-semibold text-ink">
          {((newPkg.primary_sessions * (newPkg.primary_session_type === 'online' ? profile.pricing.online : profile.pricing.offline)) +
           (newPkg.secondary_sessions * (newPkg.secondary_session_type === 'online' ? profile.pricing.online : profile.pricing.offline))).toLocaleString('en-US')} تومان
         </span>
        </div>
       </div>
      </div>
      <div className="flex gap-2 mt-4">
       <button onClick={() => setShowNewPackage(false)}
        className="flex-1 py-2.5 border border-sand rounded-xl text-sm text-soot">انصراف</button>
       <button onClick={createPackage}
        className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium">ثبت پروتکل درمان</button>
      </div>
     </div>
    </div>
   )}

   {/* ── New Session Modal ──────────────────────────────────────────── */}
   {showAddPatient && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => { if (e.target === e.currentTarget) setShowAddPatient(false) }}>
     <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-xl" dir="rtl">
      <h2 className="font-display font-semibold text-ink mb-1">افزودنِ پرونده‌ی دستی</h2>
      <p className="text-xs text-soot mb-4">شماره‌ی پرونده خودکار ساخته می‌شود. این پرونده مستقیم در مرحله‌ی درمان قرار می‌گیرد.</p>
      <div className="space-y-3">
       <div>
        <label className="text-xs text-soot mb-1 block">نامِ مراجع <span className="text-ink">*</span></label>
        <input value={newPatientForm.client_name} onChange={e => setNewPatientForm({ ...newPatientForm, client_name: e.target.value })}
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
       </div>
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">تاریخ تولد</label>
         <input value={newPatientForm.birth_date} onChange={e => setNewPatientForm({ ...newPatientForm, birth_date: e.target.value })}
          placeholder="1395/03/12" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">پایه‌ی تحصیلی (اختیاری)</label>
         <input value={newPatientForm.grade} onChange={e => setNewPatientForm({ ...newPatientForm, grade: e.target.value })}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
       </div>
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">نامِ تماس</label>
         <input value={newPatientForm.contact_name} onChange={e => setNewPatientForm({ ...newPatientForm, contact_name: e.target.value })}
          placeholder="اگر با خودِ مراجع فرق دارد" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">موبایلِ تماس</label>
         <input value={newPatientForm.contact_phone} onChange={e => setNewPatientForm({ ...newPatientForm, contact_phone: e.target.value })}
          dir="ltr" placeholder="0912..." className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
       </div>
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">نامِ {profile.companion_label || 'همراه'} (اختیاری)</label>
         <input value={newPatientForm.contact2_name} onChange={e => setNewPatientForm({ ...newPatientForm, contact2_name: e.target.value })}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">موبایلِ {profile.companion_label || 'همراه'}</label>
         <input value={newPatientForm.contact2_phone} onChange={e => setNewPatientForm({ ...newPatientForm, contact2_phone: e.target.value })}
          dir="ltr" placeholder="0912..." className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
       </div>
       <div>
        <label className="text-xs text-soot mb-1 block">شکایت / علتِ مراجعه</label>
        <textarea value={newPatientForm.reason} onChange={e => setNewPatientForm({ ...newPatientForm, reason: e.target.value })}
         rows={2} className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none" />
       </div>
       <p className="text-[11px] text-soot">حداقل یکی از شماره‌های تماس لازم است تا مراجع بتواند وارد پنل شود.</p>
      </div>
      <div className="flex gap-2 mt-4">
       <button onClick={() => setShowAddPatient(false)}
        className="flex-1 py-2.5 border border-sand rounded-xl text-sm text-soot">انصراف</button>
       <button onClick={createPatient} disabled={addPatientSaving}
        className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
        {addPatientSaving ? 'در حال ثبت...' : 'ثبت پرونده'}
       </button>
      </div>
     </div>
    </div>
   )}

   {showNewSession && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
     <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" dir="rtl">
      <h2 className="font-display font-semibold text-ink mb-4">ثبتِ جلسه‌ی تکیِ جدید</h2>
      <div className="space-y-3">
       {/* عنوانِ جلسه — این جلسه همیشه مستقل از پروتکلِ درمان است */}
       <div>
        <label className="text-xs text-soot mb-1 block">عنوانِ جلسه</label>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
         {(['ارزیابی', 'مصاحبه', 'دلخواه'] as const).map(t => (
          <button key={t} onClick={() => setNewSess({ ...newSess, title: t })}
           className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${newSess.title === t ? 'bg-white text-ink shadow-sm' : 'text-soot'}`}>
           {t}
          </button>
         ))}
        </div>
       </div>
       {newSess.title === 'دلخواه' && (
        <Field label="عنوانِ دلخواه" value={newSess.customTitle} onChange={v => setNewSess({ ...newSess, customTitle: v })} placeholder="مثلاً: جلسه‌ی مشاوره‌ی خانواده" />
       )}

       <p className="text-xs text-soot bg-sand border border-sand rounded-lg p-2.5">
        فقط این جلسه را مجاز می‌کنید — تاریخ و ساعتش را خودِ مراجع از پنلِ خودش انتخاب می‌کند.
       </p>

       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">نوع جلسه</label>
         <select value={newSess.session_type} onChange={e => setNewSess({...newSess, session_type: e.target.value})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white">
          <option value="offline">حضوری</option>
          <option value="online">آنلاین</option>
         </select>
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">حضور</label>
         <select value={newSess.attendee} onChange={e => setNewSess({...newSess, attendee: e.target.value})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white">
          <option value="primary">🧑 مراجع</option>
          {profile.companion_label && <option value="secondary">👥 {profile.companion_label}</option>}
         </select>
        </div>
       </div>
       <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
        <input type="checkbox" checked={newSess.paid} onChange={e => setNewSess({ ...newSess, paid: e.target.checked })}
         className="w-4 h-4 accent-ink" />
        این جلسه پرداخت‌شده است (اگر تیک نزنی، مراجع باید در پنل پرداخت کند)
       </label>
      </div>
      <div className="flex gap-2 mt-4">
       <button onClick={() => setShowNewSession(false)}
        className="flex-1 py-2.5 border border-sand rounded-xl text-sm text-soot">انصراف</button>
       <button onClick={createSession}
        className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium">ثبت جلسه</button>
      </div>
     </div>
    </div>
   )}

   {/* ── Edit Session Modal ─────────────────────────────────────────── */}
   {editSession && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
     <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-xl" dir="rtl">
      <h2 className="font-display font-semibold text-ink mb-4">ویرایش جلسه — {editSession.title || editSession.session_date || 'بدونِ عنوان'}</h2>
      <div className="space-y-3">
       <div>
        <label className="text-xs text-soot mb-1 block">اهداف جلسه</label>
        <textarea value={sessForm.session_goals} onChange={e => setSessForm({...sessForm, session_goals: e.target.value})}
         rows={3} placeholder="اهداف این جلسه را بنویسید..."
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none" />
       </div>
       <div>
        <label className="text-xs text-soot mb-1 block">شرح جلسه</label>
        <textarea value={sessForm.session_summary} onChange={e => setSessForm({...sessForm, session_summary: e.target.value})}
         rows={4} placeholder="خلاصه و شرح جلسه..."
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none" />
       </div>
       <div>
        <label className="text-xs text-soot mb-1 block">یادداشت خصوصی دکتر</label>
        <textarea value={sessForm.doctor_notes_private} onChange={e => setSessForm({...sessForm, doctor_notes_private: e.target.value})}
         rows={3} placeholder="یادداشت خصوصی..."
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none bg-gray-100 border-sand" />
       </div>
       <div>
        <label className="text-xs text-soot mb-1 block">یادداشت برای مراجع</label>
        <textarea value={sessForm.doctor_note_for_patient} onChange={e => setSessForm({...sessForm, doctor_note_for_patient: e.target.value})}
         rows={3} placeholder="پیام یا تکلیف برای مراجع..."
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none bg-gray-100 border-sand" />
       </div>
       <div>
        <label className="text-xs text-soot mb-1 block">وضعیت جلسه</label>
        <select value={sessForm.status} onChange={e => setSessForm({...sessForm, status: e.target.value})}
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white">
         <option value="confirmed">تایید شده</option>
         <option value="completed">برگزار شده</option>
         <option value="cancelled">کنسل شده</option>
        </select>
       </div>
      </div>
      <div className="flex gap-2 mt-4">
       <button onClick={deleteSession}
        className="py-2.5 px-4 border border-red-500/30 text-red-600 rounded-xl text-sm hover:bg-red-500/5">حذف</button>
       <button onClick={() => setEditSession(null)}
        className="flex-1 py-2.5 border border-sand rounded-xl text-sm text-soot">انصراف</button>
       <button onClick={saveSession}
        className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium">ذخیره</button>
      </div>
     </div>
    </div>
   )}

   {/* ════════════════════════════════════════════════════════════════
     TAB: STAFF (کارمندها) — فقط owner می‌بیند
   ════════════════════════════════════════════════════════════════ */}
   {mainTab === 'settings_hub' && settingsSubTab === 'staff' && me?.isOwner && (
    <div className="max-w-lg mx-auto pb-24">
     <div className="bg-white rounded-2xl border border-sand p-5 mb-4">
      <h2 className="text-sm font-display font-bold text-ink mb-1">درمانگرها</h2>
      <p className="text-xs text-soot leading-relaxed">
       هر نفر یک «منبع» است: پرونده‌ها/برنامه‌ی کاری/پروفایلِ خودش را دارد.
       اگر شماره‌ی موبایل بدهید، آن نفر می‌تواند مستقل با شماره‌ی خودش وارد این پنل شود
       (بدونِ نیاز به شماره‌ی صاحبِ مجموعه).
      </p>
     </div>

     {!staffLoaded ? (
      <div className="text-center py-16 text-soot">در حال بارگذاری...</div>
     ) : (
      <div className="space-y-2 mb-4">
       {staffList.map(r => (
        <div key={r.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-3 ${r.is_active ? 'border-sand' : 'border-sand opacity-50'}`}>
         <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-sand flex items-center justify-center text-ink font-semibold text-sm shrink-0 overflow-hidden">
           {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" /> : (r.name?.charAt(0) || '?')}
          </div>
          <div className="min-w-0">
           <div className="text-sm font-medium text-ink truncate">{r.name}{r.title ? ` — ${r.title}` : ''}</div>
           <div className="text-xs text-soot mt-0.5" dir="ltr">
            {r.phone ? toFarsiNum(r.phone) : 'بدونِ ورودِ مستقل'}
            {!r.is_active && <span className="text-red-500"> · غیرفعال</span>}
           </div>
          </div>
         </div>
         <div className="flex gap-2 shrink-0">
          <button onClick={() => openEditStaffForm(r)}
           className="text-xs px-2.5 py-1.5 border border-sand rounded-lg text-soot hover:bg-gray-50">ویرایش</button>
          {r.is_active && (
           <button onClick={() => deactivateStaffMember(r.id)}
            className="text-xs px-2.5 py-1.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5">غیرفعال</button>
          )}
         </div>
        </div>
       ))}
      </div>
     )}

     <button onClick={openNewStaffForm}
      className="w-full py-2.5 border border-sand text-ink rounded-xl text-sm hover:bg-sand">
      افزودنِ درمانگرِ تازه
     </button>

     {staffFormOpen && (
      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setStaffFormOpen(false)}>
       <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-display font-bold text-ink mb-4">{staffForm.id ? 'ویرایشِ درمانگر' : 'افزودنِ درمانگر'}</h3>
        <div className="space-y-3">
         <div>
          <label className="text-xs text-soot mb-1 block">نام</label>
          <input value={staffForm.name} onChange={e => setStaffForm(s => ({ ...s, name: e.target.value }))}
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
         </div>
         <div>
          <label className="text-xs text-soot mb-1 block">عنوان / تخصص</label>
          <input value={staffForm.title} onChange={e => setStaffForm(s => ({ ...s, title: e.target.value }))}
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
         </div>
         <div>
          <label className="text-xs text-soot mb-1 block">شماره‌ی موبایل (اختیاری — برای ورودِ مستقل)</label>
          <input value={staffForm.phone} onChange={e => setStaffForm(s => ({ ...s, phone: e.target.value }))}
           dir="ltr" placeholder="09xxxxxxxxx"
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
         </div>
        </div>
        <div className="flex gap-2 mt-5">
         <button onClick={() => setStaffFormOpen(false)}
          className="flex-1 py-2.5 border border-sand rounded-xl text-sm text-soot">انصراف</button>
         <button onClick={saveStaffMember} disabled={staffSaving}
          className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {staffSaving ? 'در حال ذخیره...' : 'ذخیره'}
         </button>
        </div>
       </div>
      </div>
     )}
    </div>
   )}

   {/* ════════════════════════════════════════════════════════════════
     TAB: PATIENT PANEL SETTINGS (ماژول‌هایی که مراجع می‌بیند)
   ════════════════════════════════════════════════════════════════ */}
   {mainTab === 'settings_hub' && settingsSubTab === 'patient_panel' && (
    <div className="max-w-3xl mx-auto">
     <div className="grid sm:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-sand p-5">
       <h2 className="text-sm font-display font-bold text-ink mb-1">تنظیماتِ پنلِ مراجع</h2>
       <p className="text-xs text-soot mb-5 leading-relaxed">
        این‌ها قابلیت‌هایی هستند که مراجع پس از ورود به پنلِ خودش (/{slug}/my) می‌بیند — پیش‌نمایشِ زنده کنارش است.
       </p>
       {!patientFeaturesLoaded ? (
        <div className="text-center py-10 text-soot text-sm">در حال بارگذاری...</div>
       ) : (
        <div className="space-y-4">
         <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-sand cursor-pointer">
          <div>
           <div className="text-sm font-medium text-ink">خریدِ جلسه‌ی جایگزین</div>
           <div className="text-[11px] text-soot mt-0.5">مراجع بتواند پس از سوختنِ یک جلسه، خودش جلسه‌ی جدید بخرد</div>
          </div>
          <input type="checkbox" checked={!!patientFeatures.patient_buy_extra_session}
           onChange={e => togglePatientFeature('patient_buy_extra_session', e.target.checked)}
           className="w-5 h-5 accent-ink shrink-0" />
         </label>
         <p className="text-[11px] text-soot px-1">
          اجازه‌ی کنسل‌کردنِ خودکار پایینِ همین صفحه، کنارِ سیاستِ کنسلی، تنظیم می‌شود.
         </p>
        </div>
       )}
      </div>

      {/* پیش‌نمایشِ زنده — دقیقاً همان کارتی که مراجع در پنلِ خودش می‌بیند */}
      <div>
       <p className="text-xs text-soot mb-2 px-1">پیش‌نمایشِ زنده</p>
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
          <button disabled className="w-full mt-2 py-2 border border-gray-300 text-soot rounded-xl text-xs">خریدِ جلسه‌ی جایگزین</button>
         )}
        </div>
        {!profile.cancellation_policy.enabled && !patientFeatures.patient_buy_extra_session && (
         <p className="text-[11px] text-soot text-center py-2">هر دو قابلیت خاموش‌اند — مراجع فقط وضعیت را می‌بیند.</p>
        )}
       </div>
      </div>
     </div>

     {/* سیاستِ کنسلی — per-resource؛ وقتی مراجع خودش کنسل می‌کند این محاسبه می‌شود */}
     <div className="bg-white rounded-2xl border border-sand p-5 mt-4">
      <h2 className="text-sm font-display font-bold text-ink mb-1">سیاستِ کنسلیِ جلسه</h2>
      <p className="text-xs text-soot mb-4">وقتی مراجع خودش یک جلسه را کنسل می‌کند، طبقِ همین قانون بازپرداخت محاسبه می‌شود.</p>

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
        <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer mb-3">
         <span className="text-sm text-ink">مراجع اجازه‌ی کنسل‌کردنِ خودکار داشته باشد</span>
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
           <span className="text-xs text-soot shrink-0">چند درصدِ پول برگردد؟</span>
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
        <div className="flex items-center justify-end gap-3 mt-4">
         {profileSaved && <span className="text-xs text-emerald-600 font-medium">✓ ذخیره شد</span>}
         <button onClick={saveProfile} disabled={profileSaving}
          className="px-5 py-2 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-ink/90">
          {profileSaving ? 'در حال ذخیره...' : 'ذخیره‌ی سیاستِ کنسلی'}
         </button>
        </div>
       </>
      )}
     </div>
    </div>
   )}

   {/* ════════════════════════════════════════════════════════════════
     TAB: ACCOUNT (پلن + ظاهر) — زیرِ تنظیمات، برایِ همه (owner و درمانگر)
   ════════════════════════════════════════════════════════════════ */}
   {mainTab === 'settings_hub' && settingsSubTab === 'account' && (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-1">مشخصاتِ حساب</h2>
      <p className="text-xs text-soot mb-4">
       ورود به این پنل با پسورد یا یوزرنیم نیست — فقط با کدِ پیامکی به همین شماره. یوزرنیم/پسوردی برایِ نگه‌داشتن وجود ندارد.
      </p>
      <div className="space-y-2">
       <div className="flex items-center justify-between p-3 rounded-xl border border-sand">
        <span className="text-sm text-ink">نشانیِ کارگاه</span>
        <a href={`/${slug}`} target="_blank" dir="ltr" className="text-xs text-soot underline">/{me?.slug || slug}</a>
       </div>
       <div className="flex items-center justify-between p-3 rounded-xl border border-sand">
        <span className="text-sm text-ink">شماره‌ی ورود{me && !me.isOwner ? ' (شما، به‌عنوانِ درمانگر)' : ''}</span>
        <span dir="ltr" className="text-xs text-soot tnum">{me?.phone || '—'}</span>
       </div>
      </div>

      {!changePhoneOpen ? (
       <button onClick={() => setChangePhoneOpen(true)} className="mt-3 text-xs text-ink underline">تغییرِ شماره‌ی ورود</button>
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
            {changePhoneBusy ? 'در حالِ ارسال…' : 'ارسالِ کدِ تایید'}
           </button>
           <button onClick={() => setChangePhoneOpen(false)} className="px-4 py-2 border border-sand rounded-lg text-sm text-soot">انصراف</button>
          </div>
         </>
        ) : (
         <>
          {changePhoneDevCode && (
           <p className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-center">
            کدِ تست (تا اتصالِ پیامک): <strong className="text-base">{changePhoneDevCode}</strong>
           </p>
          )}
          <label className="text-xs text-soot block">کدِ ارسال‌شده به {newPhoneInput}</label>
          <input dir="ltr" inputMode="numeric" placeholder="کدِ ۵ رقمی" value={changePhoneCode}
           onChange={e => setChangePhoneCode(e.target.value)}
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum tracking-widest text-center focus:outline-none focus:border-ink" />
          <div className="flex gap-2">
           <button onClick={verifyChangePhoneCode} disabled={changePhoneBusy}
            className="flex-1 py-2 bg-ink text-white rounded-lg text-sm disabled:opacity-50">
            {changePhoneBusy ? 'در حالِ تایید…' : 'تاییدِ کد'}
           </button>
           <button onClick={() => { setChangePhoneStep('phone'); setChangePhoneCode('') }} className="px-4 py-2 border border-sand rounded-lg text-sm text-soot">بازگشت</button>
          </div>
         </>
        )}
       </div>
      )}
     </section>

     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-1">پلنِ مجموعه</h2>
      <p className="text-xs text-soot mb-4">
       تغییرِ پلن فقط از سمتِ پشتیبانیِ {PLATFORM_NAME} انجام می‌شود؛ برای ارتقا با پشتیبانی تماس بگیرید.
      </p>
      <div className="flex items-center justify-between p-3.5 rounded-xl border border-sand">
       <span className="text-sm text-ink">پلنِ فعلی</span>
       <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${tenantPlan === 'pro' ? 'bg-emerald-100 text-emerald-800' : 'bg-sand text-soot'}`}>
        {tenantPlan === 'pro' ? 'حرفه‌ای' : 'رایگان'}
       </span>
      </div>
      {tenantPlan !== 'pro' && (
       <p className="text-[11px] text-soot mt-3">در پلنِ رایگان، پرداخت فقط به‌صورتِ آنلاین (زیبال) ممکن است.</p>
      )}
     </section>

     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-3">ظاهرِ پنل</h2>
      <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer">
       <span className="text-sm text-ink">حالتِ تیره</span>
       <input type="checkbox" checked={darkMode} onChange={e => toggleDark(e.target.checked)} className="w-5 h-5 accent-ink" />
      </label>
     </section>

     <button onClick={doLogout}
      className="w-full text-sm px-4 py-3 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 transition-colors">
      خروج از پنل
     </button>
    </div>
   )}

   {/* ════════════════════════════════════════════════════════════════
     TAB: SUPPORT TICKETS (تیکتِ پشتیبانی)
   ════════════════════════════════════════════════════════════════ */}
   {mainTab === 'settings_hub' && settingsSubTab === 'tickets' && (
    <div className="max-w-lg mx-auto space-y-4 pb-24">
     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-1">ثبتِ تیکتِ تازه</h2>
      <p className="text-xs text-soot mb-4">اگه مشکلی داشتی یا قابلیتی می‌خواستی اضافه بشه، همین‌جا بنویس — مستقیم به تیمِ {PLATFORM_NAME} می‌رسد.</p>
      <div className="space-y-3">
       <div className="grid grid-cols-4 gap-1.5">
        {([
         ['bug', '🐞 مشکل/باگ'], ['feature', '💡 قابلیتِ تازه'], ['billing', '💳 مالی/پلن'], ['other', '❓ سایر'],
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
        rows={5} placeholder="توضیحِ کامل..."
        className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none focus:outline-none focus:border-ink" />
       <button onClick={submitTicket} disabled={ticketSubmitting}
        className="w-full py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-50">
        {ticketSubmitting ? 'در حالِ ارسال…' : 'ارسالِ تیکت'}
       </button>
      </div>
     </section>

     <section className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-bold text-ink mb-3">تیکت‌هایِ من</h2>
      {!ticketsLoaded ? (
       <p className="text-sm text-soot text-center py-6">در حالِ بارگذاری…</p>
      ) : tickets.length === 0 ? (
       <p className="text-sm text-soot text-center py-6">هنوز تیکتی ثبت نکرده‌اید.</p>
      ) : (
       <div className="space-y-2">
        {tickets.map(tk => (
         <div key={tk.id} className="border border-sand rounded-xl p-3">
          <div className="flex items-center justify-between gap-2">
           <span className="text-sm font-medium text-ink">{tk.subject}</span>
           <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${
            tk.status === 'resolved' || tk.status === 'closed' ? 'bg-emerald-100 text-emerald-800'
             : tk.status === 'in_progress' ? 'bg-amber-100 text-amber-800' : 'bg-sand text-soot'}`}>
            {tk.status === 'open' ? 'ثبت‌شده' : tk.status === 'in_progress' ? 'در حالِ بررسی' : tk.status === 'resolved' ? 'حل‌شده' : 'بسته‌شده'}
           </span>
          </div>
          <p className="text-xs text-soot mt-1 leading-relaxed">{tk.message}</p>
          {tk.admin_reply && (
           <div className="mt-2 pt-2 border-t border-sand">
            <p className="text-[11px] text-soot mb-0.5">پاسخِ پشتیبانی:</p>
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

// ─── کدهایِ تخفیف — کامپوننتِ مستقل (نه nested) تا با ری‌رندرهایِ پنلِ اصلی
// state‌ش (لیستِ کد/فرم) پاک نشود ──────────────────────────────────────────────
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
    if (!form.code.trim() || !form.discount_value) { await uiAlert('کد و مقدارِ تخفیف را وارد کن'); return }
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
    if (!res.ok) { await uiAlert(d.error || 'ثبتِ کد ناموفق بود'); return }
    setForm({ code: '', discount_type: 'percent', discount_value: '', max_uses: '' })
    setShowForm(false)
    load()
  }

  async function toggle(c: DiscountCode) {
    await fetch(url(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, is_active: !c.is_active }) })
    load()
  }

  async function remove(c: DiscountCode) {
    if (!await uiConfirm(`کدِ «${c.code}» حذف شود؟`)) return
    await fetch(url(), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
    load()
  }

  return (
    <section className="bg-white rounded-2xl border border-sand p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-display font-semibold text-ink">کدهایِ تخفیف</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="text-xs text-ink underline">+ کدِ تازه</button>}
      </div>
      <p className="text-xs text-soot mb-4">اختیاری — اگر خواستی به بعضی مراجعان تخفیف بدهی، یک کد بساز و به آن‌ها بگو موقعِ پرداخت وارد کنند.</p>

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
                <option value="fixed">مبلغِ ثابت</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-soot mb-1 block">{form.discount_type === 'percent' ? 'درصد' : 'مبلغ (تومان)'}</label>
              <input type="number" value={form.discount_value} onChange={e => setForm(s => ({ ...s, discount_value: e.target.value }))}
                placeholder={form.discount_type === 'percent' ? '۲۰' : '۱۰۰۰۰۰'}
                className="w-24 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
            </div>
            <div>
              <label className="text-xs text-soot mb-1 block">سقفِ استفاده</label>
              <input type="number" value={form.max_uses} onChange={e => setForm(s => ({ ...s, max_uses: e.target.value }))}
                placeholder="نامحدود" className="w-24 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="px-5 py-2 bg-ink text-white rounded-lg text-xs font-medium disabled:opacity-50">
              {saving ? '...' : 'ساختِ کد'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-sand rounded-lg text-xs text-soot">انصراف</button>
          </div>
        </div>
      )}

      {!loaded ? (
        <p className="text-xs text-soot text-center py-3">در حالِ بارگذاری…</p>
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

// ─── Helper field components ──────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, fullWidth }: {
 label: string; value?: string; onChange: (v: string) => void; placeholder?: string; fullWidth?: boolean
}) {
 return (
  <div className={fullWidth ? 'col-span-2' : ''}>
   <label className="text-xs text-soot mb-1 block">{label}</label>
   <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
  </div>
 )
}

function SelectField({ label, value, onChange, options }: {
 label: string; value?: string; onChange: (v: string) => void; options: string[]
}) {
 return (
  <div>
   <label className="text-xs text-soot mb-1 block">{label}</label>
   <select value={value || ''} onChange={e => onChange(e.target.value)}
    className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink">
    <option value="">انتخاب کنید...</option>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
   </select>
  </div>
 )
}

function TextareaField({ label, value, onChange, rows, placeholder }: {
 label: string; value?: string; onChange: (v: string) => void; rows?: number; placeholder?: string
}) {
 return (
  <div>
   <label className="text-xs text-soot mb-1 block">{label}</label>
   <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={rows || 3} placeholder={placeholder}
    className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none focus:outline-none focus:border-ink" />
  </div>
 )
}
// ─── ورودِ دکتر با OTP (جایگزینِ ADMIN_SECRET؛ کدِ پیامکی به موبایلِ صاحبِ پنل) ───
function PanelLogin({ slug, onSuccess }: { slug: string; onSuccess: () => void }) {
 const [mode, setMode] = useState<'owner' | 'staff'>('owner')
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
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6" dir="rtl">
   <div className="w-full max-w-sm">
    <div className="text-center mb-6">
     <div className="text-4xl mb-3">🔐</div>
     <h1 className="text-lg font-display font-bold text-ink">ورود به پنلِ مدیریت</h1>
     <p className="text-xs text-soot mt-1.5 leading-relaxed">
      {mode === 'owner'
       ? 'کدِ ورود به شماره‌ی موبایلِ ثبت‌شده‌ی صاحبِ این مجموعه فرستاده می‌شود.'
       : 'اگر درمانگرِ این مجموعه‌اید، شماره‌ی موبایلِ خودتان را وارد کنید.'}
     </p>
    </div>

    {/* سوییچِ صاحبِ مجموعه / کارمند */}
    <div className="grid grid-cols-2 gap-2 mb-5 p-1 bg-gray-100 rounded-xl">
     <button onClick={() => switchMode('owner')}
      className={`py-2 rounded-lg text-xs font-medium transition-colors ${mode === 'owner' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
      صاحبِ مجموعه‌ام
     </button>
     <button onClick={() => switchMode('staff')}
      className={`py-2 rounded-lg text-xs font-medium transition-colors ${mode === 'staff' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
      درمانگرم
     </button>
    </div>

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
       {busy ? 'در حال ارسال…' : 'ارسالِ کدِ ورود'}
      </button>
     </div>
    ) : (
     <div className="space-y-3">
      {devCode && (
       <div className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-center">
        کدِ تست (تا اتصالِ پیامک): <strong className="text-base">{devCode}</strong>
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
         ارسالِ دوباره‌ی کد
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
