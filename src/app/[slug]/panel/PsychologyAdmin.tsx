'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { PERSIAN_MONTHS, toLatinNum, getCurrentJalali, getDaysInJalaliMonth, jalaliDateTimeToTimestamp } from '@/lib/calendar'
import { FLOW, FLOW_LABEL as FLOW_LABEL_SHARED } from '@/lib/flow'
import { PRICING } from '@/lib/config'
import { ClinicSettings, DEFAULT_SETTINGS, SessionMode, OfficeLocation, PaymentCardInfo } from '@/lib/settings'
import { IntakeForm, FormField, FormFieldType, DEFAULT_INTAKE_FORM, LEGACY_DETAIL_LABELS } from '@/lib/psy'
import { DialogHost, uiAlert, uiConfirm, uiPrompt } from '@/components/ui/Dialog'

// در پنلِ ادمین همه‌ی ارقام لاتین نمایش داده می‌شوند (فقط نمایش؛ فرمتِ ذخیره دست‌نخورده)
const toFarsiNum = (n: number | string) => toLatinNum(String(n))
const enTime = (t?: string) => toLatinNum(String(t || ''))

// ─── Types ───────────────────────────────────────────────────────────────────

type Patient = {
  id: string
  case_number: string
  // اطلاعات کودک
  child_name: string
  child_name_en?: string
  birth_date: string
  birth_place?: string
  nationality?: string
  religion?: string
  grade?: string
  school_name?: string
  school_type?: string        // دولتی / خصوصی / غیرانتفاعی
  // شکایت اصلی
  reason: string
  complaint_duration?: string  // مدت شکایت
  referred_by?: string         // معرف
  prev_visit?: string          // مراجعه قبلی
  prev_diagnosis?: string      // تشخیص قبلی
  prev_treatment?: string      // درمان قبلی
  // اطلاعات خانواده
  father_name: string
  father_birth_year?: string
  father_education?: string
  father_job?: string
  father_phone: string
  father_health?: string       // وضعیت سلامت پدر
  mother_name: string
  mother_birth_year?: string
  mother_education?: string
  mother_job?: string
  mother_phone: string
  mother_health?: string       // وضعیت سلامت مادر
  family_status?: string       // وضعیت زندگی والدین
  siblings_count?: string      // تعداد خواهر و برادر
  child_order?: string         // ترتیب تولد
  family_income?: string       // وضعیت اقتصادی
  home_address?: string
  siblings_info?: string        // سن و تحصیلاتِ خواهر/برادر
  family_members_info?: string  // اعضای دیگرِ ساکن
  // سابقه بارداری و تولد
  pregnancy_info?: string      // شرایط بارداری
  birth_type?: string          // نوع زایمان
  birth_weight?: string        // وزن هنگام تولد
  birth_complications?: string // عوارض هنگام تولد
  // رشد و تکامل
  walking_age?: string         // سن راه رفتن
  talking_age?: string         // سن صحبت کردن
  toilet_training?: string     // سن کنترل ادرار
  growth_info?: string         // مشکلات رشدی
  // سابقه پزشکی
  medical_info?: string        // بیماری‌های خاص
  medications?: string         // داروهای مصرفی
  allergies?: string           // آلرژی‌ها
  surgery_history?: string     // سابقه جراحی
  head_trauma?: string         // ضربه به سر
  // اطلاعات تکمیلی
  sleep_info?: string          // مشکلات خواب
  appetite_info?: string       // مشکلات اشتها
  sports_info?: string         // فعالیت ورزشی
  social_info?: string         // روابط اجتماعی
  academic_info?: string       // وضعیت تحصیلی
  parent_behavior?: string     // نحوه برخورد والدین
  family_stress?: string       // استرس‌های خانوادگی
  extra_notes?: string         // توضیحات اضافی
  // ستون‌هایی که فرمِ مصاحبه ذخیره می‌کند (رشته‌ای/ترکیبی)
  school_info?: string         // نام مدرسه | مؤسسه | پایه | تلفن
  child_conditions?: string    // ویژگی‌های کودک
  session_type?: string        // online | offline
  parent_name?: string
  phone?: string
  // پاسخ‌های فرمِ رزرو که ستونِ اختصاصی ندارند (کاملاً دیتایی، از فرم‌بیلدر)
  details?: Record<string, any>
  // وضعیت
  status: string
  booking_date?: string
  created_at: string
}

type Booking = {
  id: string
  case_number: string
  child_name: string
  father_name?: string
  mother_name?: string
  father_phone?: string
  mother_phone?: string
  session_type: 'online' | 'offline'
  office_location?: string
  booking_date: string
  booking_time: string
  price: number
  status: 'pending' | 'confirmed' | 'cancelled'
  doctor_notes?: string
  flow_status?: string
  reject_reason?: string
  interview_date?: string
  interview_time?: string
  interview_paid?: boolean
  interview_payment_ref?: string
  interview_price?: number
  assessment_date?: string
  assessment_time?: string
  assessment_paid?: boolean
  assessment_payment_ref?: string
  assessment_price?: number
  interview_notes?: string
  assessment_notes?: string
  interview_held?: boolean
  assessment_held?: boolean
  cancel_notice?: string
  created_at: string
}

type Package = {
  id: string
  case_number: string
  month: string
  year: string
  child_sessions: number
  parent_sessions: number
  child_session_type: string
  parent_session_type: string
  notes: string
  status: string
  paid: boolean
  payment_submitted?: boolean
  payment_ref?: string
}

type Session = {
  id: string
  package_id: string
  case_number: string
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
}

const DEFAULT_PROFILE: ResourceProfileView = {
  resource_id: '', name: '', title: '', avatar_url: '', badges: [], session_modes: 'both', cards: [],
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_TIMES = ['۸:۰۰','۹:۰۰','۱۰:۰۰','۱۱:۰۰','۱۲:۰۰','۱۳:۰۰','۱۴:۰۰','۱۵:۰۰','۱۶:۰۰','۱۷:۰۰','۱۸:۰۰']

// کلیدِ مرتب‌سازیِ عددیِ ساعت (رقمِ فارسی «۱۱:۰۰» → دقیقه) تا ترتیب درست باشد نه الفبایی
function timeKey(t: string): number {
  const [h, m] = toLatinNum(t || '').split(':').map(x => parseInt(x, 10))
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
}

const FLOW_LABEL = FLOW_LABEL_SHARED

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
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  confirmed: 'bg-green-50 text-green-700 border border-green-200',
  cancelled: 'bg-red-50 text-red-700 border border-red-200',
  forfeited: 'bg-red-50 text-red-700 border border-red-200',
  replaced: 'bg-gray-100 text-gray-500 border border-gray-200',
  completed: 'bg-blue-50 text-blue-700 border border-blue-200',
  active: 'bg-blue-50 text-blue-700 border border-blue-200',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// کارتِ جلسه‌ی مصاحبه/ارزیابی در پرونده — یادداشت + تأیید برگزاری
function StageSessionCard({ stage, date, time, notes, held, canHold, onSave }: {
  stage: 'interview' | 'assessment'; date?: string; time?: string
  notes: string; held: boolean; canHold: boolean
  onSave: (notes: string, markHeld: boolean) => Promise<void> | void
}) {
  const [val, setVal] = useState(notes)
  const [saving, setSaving] = useState(false)
  const label = stage === 'interview' ? 'جلسه‌ی مصاحبه‌ی اولیه' : 'جلسه‌ی ارزیابیِ کودک'
  const icon = stage === 'interview' ? '🩺' : '🧩'
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <div className="text-sm font-medium text-gray-900">{label}</div>
            <div className="text-xs text-gray-400">{date ? `${enTime(date)} — ${enTime(time)}` : 'زمان ثبت نشده'}</div>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${held ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {held ? '✅ برگزار شد' : 'برگزار نشده'}
        </span>
      </div>
      <textarea value={val} onChange={e => setVal(e.target.value)} rows={2} placeholder="مطالب و یادداشتِ این جلسه..."
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-brand-400 mb-2" />
      <div className="flex gap-2">
        <button onClick={async () => { setSaving(true); await onSave(val, false); setSaving(false) }} disabled={saving}
          className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm disabled:opacity-40">💾 ذخیره یادداشت</button>
        {!held && canHold && (
          <button onClick={async () => { if (!await uiConfirm('تأیید برگزاریِ این جلسه؟ مرحله‌ی بعد برای مراجع باز می‌شود.')) return; setSaving(true); await onSave(val, true); setSaving(false) }} disabled={saving}
            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-40">✅ تایید برگزاری</button>
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
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>{toFarsiNum(count)}</span>
      </div>
      {count === 0 ? (
        <div className="text-center py-6 text-xs text-gray-300 bg-white rounded-xl border border-dashed border-gray-100">موردی نیست</div>
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
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 text-sm">{name}</span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md font-mono">{caseNumber}</span>
          </div>
          {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </div>
        <span className="text-sm font-semibold text-brand-600 shrink-0">{amount.toLocaleString('en-US')} ت</span>
      </div>
      {receipt && (
        <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 mb-3">
          <p className="text-xs text-gray-400 mb-0.5">فیش واریزی:</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{receipt}</p>
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
  const cls = 'text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400'
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
    <div className="flex gap-2 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-40 shrink-0">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
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
    <div className="bg-white rounded-xl border border-amber-100 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">{name}</span>
          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md font-mono">{caseNumber}</span>
        </div>
        <span className="text-sm font-semibold text-amber-600 shrink-0">{amount.toLocaleString('en-US')} ت</span>
      </div>
      <div className="bg-amber-50 rounded-lg p-2.5 border border-amber-100 mb-3">
        <p className="text-xs text-gray-400 mb-0.5">شماره کارتِ مراجع برای واریز:</p>
        <p dir="ltr" className="font-mono text-sm text-gray-800 tracking-wider text-right">{card || '—'}</p>
      </div>
      <input value={ref} onChange={e => setRef(e.target.value)} placeholder="متنِ فیشِ واریز (کد پیگیری/تاریخ)"
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg mb-2 focus:outline-none focus:border-brand-400" />
      <button disabled={saving || !ref.trim()}
        onClick={async () => { if (!await uiConfirm(`واریزِ بازپرداختِ ${amount.toLocaleString('en-US')} تومان به کارتِ مراجع ثبت شود؟`)) return; setSaving(true); await onDone(ref); setSaving(false) }}
        className="w-full py-2 bg-amber-500 text-white rounded-lg text-sm disabled:opacity-40">
        {saving ? 'در حال ثبت...' : '✓ ثبتِ واریزِ بازپرداخت'}
      </button>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 bg-gray-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
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
  const [mainTab, setMainTab] = useState<'patients' | 'bookings' | 'schedule' | 'settings' | 'finance' | 'patient_settings' | 'staff'>('patients')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Patients state ─────────────────────────────────────────────
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [patientView, setPatientView] = useState<'list' | 'detail' | 'edit'>('list')
  const [patientTab, setPatientTab] = useState<'info' | 'payment' | 'packages' | 'sessions'>('info')
  const [infoSubTab, setInfoSubTab] = useState<'child' | 'family' | 'other'>('child')
  const [packages, setPackages] = useState<Package[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [patientSearch, setPatientSearch] = useState('')
  const [showNewPackage, setShowNewPackage] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [showAddPatient, setShowAddPatient] = useState(false)
  const [addPatientSaving, setAddPatientSaving] = useState(false)
  const [newPatientForm, setNewPatientForm] = useState({
    child_name: '', birth_date: '', grade: '', reason: '',
    father_name: '', father_phone: '', mother_name: '', mother_phone: '',
  })
  const [editSession, setEditSession] = useState<Session | null>(null)
  const [editingPatient, setEditingPatient] = useState<Partial<Patient>>({})

  // ── Bookings state ─────────────────────────────────────────────
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [bookingFilter, setBookingFilter] = useState<'all' | 'pending' | 'confirmed' | 'cancelled'>('all')
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')

  // ── Pending payments (تب تأیید پرداخت‌ها) ─────────────────────────
  const [pendingPkgs, setPendingPkgs] = useState<Package[]>([])
  const [pendingSess, setPendingSess] = useState<Session[]>([])
  const [pendingRefunds, setPendingRefunds] = useState<Session[]>([])

  // ── Schedule state ─────────────────────────────────────────────
  const today = getCurrentJalali()
  const [schedMonth, setSchedMonth] = useState(today.month)
  const [schedYear, setSchedYear] = useState(today.year)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [selectedTimes, setSelectedTimes] = useState<string[]>([])
  const [slotTypes, setSlotTypes] = useState<Record<string, 'online' | 'offline'>>({})
  const [slotLocs, setSlotLocs] = useState<Record<string, string>>({})
  const [isOff, setIsOff] = useState(false)
  const [schedSaving, setSchedSaving] = useState(false)
  const [schedSaved, setSchedSaved] = useState(false)
  const [schedSubTab, setSchedSubTab] = useState<'edit' | 'agenda'>('edit')
  const [agendaMode, setAgendaMode] = useState<'month' | 'week'>('week')
  const [weekIdx, setWeekIdx] = useState(0)
  const [monthSchedules, setMonthSchedules] = useState<{ date: string; available_times: string[]; is_off: boolean; slot_types?: Record<string, string>; slot_locs?: Record<string, string> }[]>([])
  const [allSessions, setAllSessions] = useState<{ id: string; case_number: string; session_date: string; session_time: string; session_type: string; attendee: string; status: string }[]>([])

  // ── Loading ────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)
  async function doLogout() {
    const ok = await uiConfirm('از پنل خارج شوید؟')
    if (!ok) return
    await fetch(panelApi('/logout'), { method: 'POST' })
    setMe(null)
    setNeedsLogin(true)
  }

  // ── Settings (تنظیماتِ کلینیک + ظاهر) ──────────────────────────
  const [settings, setSettings] = useState<ClinicSettings>(DEFAULT_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [finance, setFinance] = useState<FinanceData | null>(null)
  const [financeLoaded, setFinanceLoaded] = useState(false)
  const [financeRange, setFinanceRange] = useState<'all' | '1m' | '3m' | '6m' | '12m' | 'custom'>('6m')
  const [financeFromIso, setFinanceFromIso] = useState('')
  const [financeToIso, setFinanceToIso] = useState('')
  const [financeCustomOpen, setFinanceCustomOpen] = useState(false)
  const [fromJ, setFromJ] = useState(() => { const t = getCurrentJalali(); return { y: t.year, m: t.month + 1, d: 1 } })
  const [toJ, setToJ] = useState(() => { const t = getCurrentJalali(); return { y: t.year, m: t.month + 1, d: t.day } })

  // ── چندکارمندی: کی وارد شده (صاحبِ مجموعه یا یک کارمندِ مشخص)؟ ──
  const [me, setMe] = useState<{ isOwner: boolean; resourceId: string | null; resourceName: string | null } | null>(null)
  const [staffList, setStaffList] = useState<ResourceRow[]>([])
  const [staffLoaded, setStaffLoaded] = useState(false)
  // owner: کدام کارمند را می‌بینیم؟ '' = همه (پرونده‌ها) — برنامه/پروفایل همیشه یک نفرِ مشخص لازم دارد
  const [viewingResourceId, setViewingResourceId] = useState<string>('')
  // پروفایلِ per-resource (نام/عنوان/آواتار/بج/نوعِ جلسه/کارت) — جایگزینِ فیلدهای قدیمیِ settings
  const [profile, setProfile] = useState<ResourceProfileView>(DEFAULT_PROFILE)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  // فرمِ رزروِ per-resource (بخش‌ها/سوال‌ها/نوع/اجباری‌بودن — کاملاً دیتایی)
  const [intakeForm, setIntakeForm] = useState<IntakeForm>(DEFAULT_INTAKE_FORM)
  const [intakeLoaded, setIntakeLoaded] = useState(false)
  const [intakeSaving, setIntakeSaving] = useState(false)
  const [intakeSaved, setIntakeSaved] = useState(false)

  // ── Package / Session forms ────────────────────────────────────
  const [newPkg, setNewPkg] = useState({
    month: '1', year: '1404',
    child_sessions: 8, parent_sessions: 2,
    child_session_type: 'offline', parent_session_type: 'offline', notes: ''
  })
  const [newSess, setNewSess] = useState({
    session_date: '', session_time: '', session_type: 'offline', attendee: 'child', package_id: '', standalone: false, paid: true
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
      setMe({ isOwner: !!d.isOwner, resourceId: d.resourceId || null, resourceName: d.resourceName || null })
      if (d.isOwner) loadStaff()
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
    const ok = await uiConfirm('این کارمند غیرفعال شود؟ پرونده‌های قبلی‌اش دست‌نخورده می‌ماند.')
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
      const [pkgRes, sessRes, refundRes] = await Promise.all([
        fetch(api('/packages?pending=1'), { cache: 'no-store' }),
        fetch(api('/sessions?pending=1'), { cache: 'no-store' }),
        fetch(api('/sessions?refunds=1'), { cache: 'no-store' }),
      ])
      const pkg = await pkgRes.json().catch(() => ({}))
      const sess = await sessRes.json().catch(() => ({}))
      const refunds = await refundRes.json().catch(() => ({}))
      setPendingPkgs(pkg.packages || [])
      setPendingSess(sess.sessions || [])
      setPendingRefunds(refunds.sessions || [])
    } catch {}
  }

  useEffect(() => { fetchAll(); loadSettings() }, [fetchAll])

  async function loadPatientData(case_number: string) {
    const [pkgRes, sessRes] = await Promise.all([
      fetch(api(`/packages?case_number=${case_number}`), { cache: 'no-store' }),
      fetch(api(`/sessions?case_number=${case_number}`), { cache: 'no-store' }),
    ])
    const pkgData = await pkgRes.json()
    const sessData = await sessRes.json()
    setPackages(pkgData.packages || [])
    setSessions(sessData.sessions || [])
  }

  async function openPatient(p: Patient) {
    setSelectedPatient(p)
    setPatientView('detail')
    setPatientTab('info')
    await loadPatientData(p.case_number)
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
    // پرونده وارد مرحله‌ی درمان شد
    const bk = bookings.find(b => b.case_number === selectedPatient.case_number)
    if (bk) {
      await fetch(api('/cases'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bk.id, flow_status: 'package_assigned' }),
      })
    }
    setShowNewPackage(false)
    await loadPatientData(selectedPatient.case_number)
    fetchAll()
  }

  // حذفِ کاملِ یک پرونده (با تأیید)
  async function deletePatient(p: Patient) {
    if (!await uiConfirm(`پرونده‌ی «${p.child_name}» (${p.case_number}) و همه‌ی پروتکل‌های درمان و جلسه‌هایش برای همیشه حذف شود؟`)) return
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
    if (!newPatientForm.child_name.trim()) { uiAlert('نام کودک را وارد کنید'); return }
    if (!newPatientForm.father_phone.trim() && !newPatientForm.mother_phone.trim()) { uiAlert('حداقل یک شماره تماس وارد کنید'); return }
    setAddPatientSaving(true)
    try {
      const res = await fetch(api('/cases'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newPatientForm, ...(me?.isOwner && viewingResourceId ? { resource_id: viewingResourceId } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      setAddPatientSaving(false)
      if (!res.ok) { uiAlert(data.error || 'ثبت پرونده ناموفق بود'); return }
      setShowAddPatient(false)
      setNewPatientForm({ child_name: '', birth_date: '', grade: '', reason: '', father_name: '', father_phone: '', mother_name: '', mother_phone: '' })
      await fetchAll()
      if (data.booking) { setSelectedPatient(data.booking); await loadPatientData(data.booking.case_number); setPatientView('detail') }
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
    if (!newSess.standalone && !newSess.package_id) { uiAlert('یک پروتکل درمان انتخاب کنید یا «جلسه‌ی جداگانه» را بزنید.'); return }
    const payload = newSess.standalone
      ? {
          case_number: selectedPatient.case_number,
          session_date: newSess.session_date, session_time: newSess.session_time,
          session_type: newSess.session_type, attendee: newSess.attendee,
          package_id: null, paid: newSess.paid,
        }
      : {
          case_number: selectedPatient.case_number,
          session_date: newSess.session_date, session_time: newSess.session_time,
          session_type: newSess.session_type, attendee: newSess.attendee,
          package_id: newSess.package_id, paid: false,
        }
    await fetch(api('/sessions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setShowNewSession(false)
    setNewSess({ session_date: '', session_time: '', session_type: 'offline', attendee: 'child', package_id: '', standalone: false, paid: true })
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

  // ─── Booking actions ─────────────────────────────────────────────────────────

  async function updateBookingStatus(id: string, status: string) {
    await fetch(api('/cases'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, doctor_notes: bookingNotes }),
    })
    setSelectedBooking(null)
    fetchAll()
  }

  // تأیید پرداختِ یک مرحله (مصاحبه/ارزیابی) → باز شدنِ گرفتنِ وقت
  async function confirmStagePayment(id: string, stage: 'interview' | 'assessment') {
    const label = stage === 'interview' ? 'مصاحبه' : 'ارزیابی'
    if (!await uiConfirm(`پرداختِ ${label} تأیید شود؟ پس از تأیید، مراجع می‌تواند وقت بگیرد.`)) return
    const patch = stage === 'interview'
      ? { id, flow_status: FLOW.INTERVIEW_AWAITING_BOOKING, interview_paid: true, status: 'confirmed' }
      : { id, flow_status: FLOW.ASSESSMENT_AWAITING_BOOKING, assessment_paid: true }
    const res = await fetch(api('/cases'), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (!res.ok) { uiAlert('خطا در ثبت'); return }
    setSelectedBooking(null); fetchAll()
  }

  // ردِ مرحله‌ی مصاحبه
  async function rejectInterview(id: string) {
    const r = await uiPrompt('دلیل رد را بنویسید (برای مراجع نمایش داده می‌شود):', { required: true })
    if (r === null) return
    const reject_reason = r.trim()
    if (!reject_reason) { uiAlert('لطفاً دلیل را بنویسید.'); return }
    const res = await fetch(api('/cases'), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, flow_status: FLOW.INTERVIEW_REJECTED, reject_reason, status: 'cancelled' }),
    })
    if (!res.ok) { uiAlert('خطا در ثبت'); return }
    setSelectedBooking(null); fetchAll()
  }

  // ردِ پرداختِ ارزیابی → بازگشت به مرحله‌ی پرداخت تا مراجع دوباره واریز کند
  async function rejectAssessmentPayment(id: string) {
    const r = await uiPrompt('دلیل ردِ پرداخت را بنویسید (برای مراجع نمایش داده می‌شود):', { required: true })
    if (r === null) return
    const reason = r.trim()
    if (!reason) { uiAlert('لطفاً دلیل را بنویسید.'); return }
    const res = await fetch(api('/cases'), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, flow_status: FLOW.ASSESSMENT_AWAITING_PAYMENT, assessment_paid: false, cancel_notice: `پرداختِ ارزیابی تأیید نشد: ${reason}` }),
    })
    if (!res.ok) { uiAlert('خطا در ثبت'); return }
    await loadPendingPayments(); setSelectedBooking(null); fetchAll()
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

  // باز کردنِ مرحله‌ی ارزیابی پس از برگزاریِ مصاحبه (مراجع باید پرداخت کند)
  async function openAssessmentStage(id: string) {
    const res = await fetch(api('/cases'), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, flow_status: FLOW.ASSESSMENT_AWAITING_PAYMENT }),
    })
    if (!res.ok) { uiAlert('خطا در ثبت'); return }
    setSelectedBooking(null); fetchAll()
  }

  // ذخیره‌ی یادداشت و/یا تأییدِ برگزاریِ جلسه‌ی مصاحبه/ارزیابی
  async function saveStageSession(bookingId: string, stage: 'interview' | 'assessment', notes: string, markHeld: boolean) {
    const patch: Record<string, any> = { id: bookingId }
    if (stage === 'interview') {
      patch.interview_notes = notes
      if (markHeld) { patch.interview_held = true; patch.flow_status = FLOW.ASSESSMENT_AWAITING_PAYMENT }
    } else {
      patch.assessment_notes = notes
      if (markHeld) patch.assessment_held = true
    }
    const res = await fetch(api('/cases'), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    if (!res.ok) { uiAlert('خطا در ثبت'); return }
    await fetchAll()
    if (selectedPatient) await loadPatientData(selectedPatient.case_number)
  }

  // ─── Schedule ────────────────────────────────────────────────────────────────

  const daysInMonth = getDaysInJalaliMonth(schedYear, schedMonth)

  // ── کمک‌توابعِ برنامه ───────────────────────────────────────────
  const childNameOf = (cn: string) => bookings.find(b => b.case_number === cn)?.child_name || cn
  const schedForDay = (d: number) => monthSchedules.find(s => s.date === `${schedYear}/${schedMonth + 1}/${d}`)

  // همه‌ی نوبت‌های یک تاریخ (مصاحبه + ارزیابی + جلسه) مرتب‌شده بر اساس ساعت
  function apptsForDate(dateStr: string) {
    const out: { time: string; name: string; type: string; mode?: string; loc?: string; color: string; kind: 'interview' | 'assessment' | 'session'; id: string; caseNumber: string }[] = []
    for (const b of bookings) {
      if (b.interview_date === dateStr && b.interview_time)
        out.push({ time: b.interview_time, name: b.child_name, type: 'مصاحبه', mode: b.session_type, loc: b.office_location, color: 'bg-blue-50 text-blue-700 border-blue-100', kind: 'interview', id: b.id, caseNumber: b.case_number })
      if (b.assessment_date === dateStr && b.assessment_time)
        out.push({ time: b.assessment_time, name: b.child_name, type: 'ارزیابی', mode: b.session_type, loc: b.office_location, color: 'bg-purple-50 text-purple-700 border-purple-100', kind: 'assessment', id: b.id, caseNumber: b.case_number })
    }
    for (const s of allSessions) {
      if (s.session_date === dateStr && s.session_time && s.status !== 'cancelled' && s.status !== 'forfeited' && s.status !== 'replaced')
        out.push({ time: s.session_time, name: childNameOf(s.case_number), type: s.attendee === 'parent' ? 'جلسه (والدین)' : 'جلسه (کودک)', mode: s.session_type, color: 'bg-green-50 text-green-700 border-green-100', kind: 'session', id: s.id, caseNumber: s.case_number })
    }
    return out.sort((a, b) => timeKey(a.time) - timeKey(b.time))
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
      const patch = appt.kind === 'interview'
        ? { id: appt.id, flow_status: FLOW.INTERVIEW_AWAITING_BOOKING, interview_date: '', interview_time: '', cancel_notice: msg }
        : { id: appt.id, flow_status: FLOW.ASSESSMENT_AWAITING_BOOKING, assessment_date: '', assessment_time: '', cancel_notice: msg }
      await fetch(api('/cases'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
    }
    await Promise.all([fetchAll(), loadAllSessions()])
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
        const patch = a.kind === 'interview'
          ? { id: a.id, flow_status: FLOW.INTERVIEW_AWAITING_BOOKING, interview_date: '', interview_time: '', cancel_notice: msg }
          : { id: a.id, flow_status: FLOW.ASSESSMENT_AWAITING_BOOKING, assessment_date: '', assessment_time: '', cancel_notice: msg }
        await fetch(api('/cases'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      }
    }
    await Promise.all([fetchAll(), loadAllSessions()])
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
    if (mainTab === 'schedule') { loadMonthSchedules(schedMonth, schedYear); loadAllSessions(); refreshBookings(); if (!profileLoaded) loadProfile() }
    if (mainTab === 'settings') { if (!settingsLoaded) loadSettings(); loadProfile(); loadIntakeForm() }
    if (mainTab === 'patient_settings' && !patientFeaturesLoaded) loadPatientFeatures()
    if (mainTab === 'finance') loadFinance()
    if (mainTab === 'staff' && !staffLoaded) loadStaff()
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
  async function loadSettings() {
    try {
      const res = await fetch(api('/settings'), { cache: 'no-store' })
      if (res.status === 401) { setNeedsLogin(true); return }
      const data = await res.json()
      if (data.settings) setSettings({ ...DEFAULT_SETTINGS, office_locations: data.settings.office_locations ?? DEFAULT_SETTINGS.office_locations })
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
      const data = await res.json()
      if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings })
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
      if (data.profile) setProfile({ ...DEFAULT_PROFILE, ...data.profile })
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
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2500)
    } catch {}
    setProfileSaving(false)
  }

  const patchProfile = (p: Partial<ResourceProfileView>) => setProfile(s => ({ ...s, ...p }))

  // ── فرمِ رزرو (per-resource) ───────────────────────────────────────────────
  async function loadIntakeForm() {
    try {
      const url = me?.isOwner && viewingResourceId ? api(`/intake-form?resource_id=${viewingResourceId}`) : api('/intake-form')
      const res = await fetch(url, { cache: 'no-store' })
      if (res.status === 401) { setNeedsLogin(true); return }
      const data = await res.json()
      if (data.form) setIntakeForm(data.form)
    } catch {}
    setIntakeLoaded(true)
  }

  async function saveIntakeForm() {
    setIntakeSaving(true); setIntakeSaved(false)
    try {
      const body: Record<string, any> = { form: intakeForm }
      if (me?.isOwner && viewingResourceId) body.resource_id = viewingResourceId
      const res = await fetch(api('/intake-form'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.status === 401) { setNeedsLogin(true); return }
      setIntakeSaved(true)
      setTimeout(() => setIntakeSaved(false), 2500)
    } catch {}
    setIntakeSaving(false)
  }

  function addFormSection() {
    const id = genId('section')
    setIntakeForm(f => ({ sections: [...f.sections, { id, title: 'بخشِ جدید', fields: [] }] }))
  }
  function updateFormSection(idx: number, patch: Partial<IntakeForm['sections'][number]>) {
    setIntakeForm(f => ({ sections: f.sections.map((s, i) => i === idx ? { ...s, ...patch } : s) }))
  }
  function removeFormSection(idx: number) {
    setIntakeForm(f => ({ sections: f.sections.filter((_, i) => i !== idx) }))
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
  function addFormField(sIdx: number) {
    updateFormSection(sIdx, {
      fields: [...intakeForm.sections[sIdx].fields, { id: genId('field'), label: 'سوالِ جدید', type: 'text' as FormFieldType, required: false }],
    })
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


  // helperهای ویرایشِ آرایه‌ها
  // برچسبِ یک کلیدِ details: اول از فرمِ فعلیِ همین دکتر (اگر چنین فیلدی هنوز هست)، بعد از نقشه‌ی پرونده‌های قدیمی، وگرنه خودِ کلید
  function detailFieldLabel(key: string): string {
    for (const s of intakeForm.sections) {
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
          uiAlert('ذخیره نشد (۴۰۳). این خطا از خودِ برنامه نیست؛ درخواست توسطِ فایروالِ Vercel بلاک شده. در پنلِ Vercel → Firewall، گزینه‌ی «Attack Challenge Mode» را خاموش کن (یا Deployment Protection را بررسی کن).')
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
      p.child_name?.toLowerCase().includes(q) ||
      p.father_name?.toLowerCase().includes(q) ||
      p.mother_name?.toLowerCase().includes(q) ||
      p.case_number?.toLowerCase().includes(q) ||
      p.father_phone?.includes(q) ||
      p.mother_phone?.includes(q)
    )
  })

  const filteredBookings = bookings
    .filter(b => bookingFilter === 'all' || b.status === bookingFilter)
    .filter(b => {
      if (!bookingSearch) return true
      const q = bookingSearch.toLowerCase()
      return (
        b.child_name?.toLowerCase().includes(q) ||
        b.father_name?.toLowerCase().includes(q) ||
        b.case_number?.toLowerCase().includes(q) ||
        b.father_phone?.includes(q)
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

  const pendingActionCount =
    bookings.filter(b => b.flow_status === FLOW.INTERVIEW_PAYMENT_SUBMITTED).length +
    bookings.filter(b => b.flow_status === FLOW.ASSESSMENT_PAYMENT_SUBMITTED).length +
    pendingPkgs.length + pendingSess.length + pendingRefunds.length

  const navItems = [
    { key: 'patients' as const, icon: '📁', label: 'پرونده‌ها', badge: 0 },
    { key: 'bookings' as const, icon: '💳', label: 'تأیید پرداخت‌ها', badge: pendingActionCount },
    { key: 'schedule' as const, icon: '🗓', label: 'روزهای کاری', badge: 0 },
    { key: 'finance' as const, icon: '📊', label: 'گزارشاتِ مالی', badge: 0 },
    { key: 'settings' as const, icon: '🌐', label: 'تنظیماتِ سایت', badge: 0 },
    ...(me?.isOwner ? [{ key: 'staff' as const, icon: '👥', label: 'کارمندها', badge: 0 }] : []),
    ...(me?.isOwner !== false ? [{ key: 'patient_settings' as const, icon: '👤', label: 'تنظیماتِ پنلِ مراجع', badge: 0 }] : []),
  ]

  function NavList({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map(item => (
          <button key={item.key} onClick={() => { setMainTab(item.key); onNavigate?.() }}
            className={`w-full text-right px-3 py-2.5 rounded-lg text-sm flex items-center justify-between gap-2 transition-colors ${
              mainTab === item.key ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <span className="flex items-center gap-2">{item.icon} {item.label}</span>
            {item.badge > 0 && (
              <span className="min-w-5 h-5 px-1.5 bg-red-500 text-white text-[11px] rounded-full flex items-center justify-center font-medium">
                {toFarsiNum(item.badge)}
              </span>
            )}
          </button>
        ))}
      </nav>
    )
  }

  return (
    <div className={`min-h-screen bg-gray-50 sm:pr-56 ${darkMode ? 'pb-admin-dark' : ''}`} dir="rtl">
      <DialogHost />

      {/* ── سایدبار (دسکتاپ) ───────────────────────────────────────────── */}
      <aside className="hidden sm:flex sm:flex-col fixed top-0 right-0 h-full w-56 bg-white border-l border-gray-100 z-20">
        <div className="p-4 border-b border-gray-100">
          <div className="text-sm font-semibold text-gray-900">پنل مدیریت</div>
          <div className="text-xs text-gray-400 truncate mt-0.5">
            {profile.name || me?.resourceName || 'دکتر'}{profile.title ? ` — ${profile.title}` : ''}
            {me && !me.isOwner && <span className="text-brand-500"> (کارمند)</span>}
          </div>
        </div>
        <NavList />
        <div className="p-2 border-t border-gray-100 space-y-1">
          <a href={`/${slug}`} target="_blank" rel="noopener noreferrer"
            className="block text-right text-xs px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-50">
            🔗 سایتِ من
          </a>
          <button onClick={() => toggleDark(!darkMode)} className="w-full text-right text-xs px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-50">
            {darkMode ? '☀️ حالتِ روشن' : '🌙 حالتِ تیره'}
          </button>
          <button onClick={doLogout} className="w-full text-right text-xs px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-50">
            🚪 خروج
          </button>
        </div>
      </aside>

      {/* ── نوارِ بالا (موبایل) ────────────────────────────────────────── */}
      <div className="sm:hidden bg-white border-b border-gray-100 sticky top-0 z-20 px-3 py-3 flex items-center justify-between">
        <button onClick={() => setSidebarOpen(true)} className="text-xl text-gray-600 w-8 h-8 flex items-center justify-center">☰</button>
        <div className="text-sm font-semibold text-gray-900">پنل مدیریت</div>
        <div className="w-8" />
      </div>

      {/* ── دراورِ کشویی (موبایل) ──────────────────────────────────────── */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 sm:hidden" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed top-0 right-0 h-full w-64 bg-white z-50 sm:hidden flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">پنل مدیریت</div>
                <div className="text-xs text-gray-400 truncate mt-0.5">
                  {profile.name || me?.resourceName || 'دکتر'}{profile.title ? ` — ${profile.title}` : ''}
                  {me && !me.isOwner && <span className="text-brand-500"> (کارمند)</span>}
                </div>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400 text-xl w-8 h-8 shrink-0">✕</button>
            </div>
            <NavList onNavigate={() => setSidebarOpen(false)} />
            <div className="p-2 border-t border-gray-100 space-y-1">
              <a href={`/${slug}`} target="_blank" rel="noopener noreferrer"
                className="block text-right text-xs px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-50">
                🔗 سایتِ من
              </a>
              <button onClick={() => toggleDark(!darkMode)} className="w-full text-right text-xs px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-50">
                {darkMode ? '☀️ حالتِ روشن' : '🌙 حالتِ تیره'}
              </button>
              <button onClick={doLogout} className="w-full text-right text-xs px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-50">
                🚪 خروج
              </button>
            </div>
          </aside>
        </>
      )}

      <div className="max-w-5xl mx-auto p-3 sm:p-4">

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
                      className="text-xs px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400">
                      <option value="">👥 همه‌ی پرسنل</option>
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
                      className="w-full text-sm px-4 py-2.5 border border-gray-200 rounded-xl bg-white pr-9 focus:outline-none focus:border-brand-400" />
                    <span className="absolute right-3 top-2.5 text-gray-400">🔍</span>
                  </div>
                  <button onClick={() => setShowAddPatient(true)}
                    className="text-sm px-4 py-2.5 bg-brand-600 text-white rounded-xl hover:bg-brand-800 whitespace-nowrap shrink-0">
                    ➕ افزودن پرونده
                  </button>
                </div>
                {loading ? (
                  <div className="text-center py-16 text-gray-400">در حال بارگذاری...</div>
                ) : filteredPatients.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">پرونده‌ای یافت نشد</div>
                ) : (
                  <div className="space-y-2">
                    {filteredPatients.map(p => (
                      <div key={p.id} onClick={() => openPatient(p)}
                        className="bg-white rounded-xl border border-gray-100 p-4 cursor-pointer hover:border-brand-200 hover:shadow-sm transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex gap-3 items-center">
                            <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 font-semibold text-sm shrink-0">
                              {p.child_name?.charAt(0) || '?'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900 text-sm">{p.child_name}</span>
                                {p.case_number && (
                                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md font-mono">{p.case_number}</span>
                                )}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {p.grade && `پایه ${p.grade}`}
                                {p.grade && p.birth_date && ' • '}
                                {p.birth_date && `متولد ${p.birth_date}`}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {p.father_name && `پدر: ${p.father_name}`}
                                {p.father_name && p.mother_name && ' | '}
                                {p.mother_name && `مادر: ${p.mother_name}`}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-xs text-gray-400">
                              {p.father_phone || p.mother_phone}
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
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
                    ← بازگشت
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => startEdit(selectedPatient)}
                      className="text-xs sm:text-sm px-3 sm:px-4 py-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700 whitespace-nowrap">
                      ✏️ ویرایش
                    </button>
                    <button onClick={() => deletePatient(selectedPatient)}
                      className="text-xs sm:text-sm px-3 py-2 border border-red-200 text-red-500 rounded-xl hover:bg-red-50 whitespace-nowrap">
                      🗑 حذف
                    </button>
                  </div>
                </div>

                {/* Patient header */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 font-bold text-xl">
                      {selectedPatient.child_name?.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-semibold text-gray-900">{selectedPatient.child_name}</h2>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md font-mono">{selectedPatient.case_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[selectedPatient.status] || ''}`}>
                          {STATUS_LABEL[selectedPatient.status] || selectedPatient.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 mt-0.5">{selectedPatient.reason}</div>
                    </div>
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-1 mb-4 overflow-x-auto">
                  {([
                    ['info', '👤 اطلاعات مراجع'],
                    ['payment', '💳 اطلاعات پرداخت'],
                    ['packages', '📦 پروتکل‌های درمان'],
                    ['sessions', '🗓 جلسات'],
                  ] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setPatientTab(k)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                        patientTab === k
                          ? 'bg-brand-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── Tab: اطلاعات مراجع ─────────────────────────────── */}
                {patientTab === 'info' && (
                  <div>
                    <div className="flex gap-1 mb-3 overflow-x-auto no-scrollbar">
                      {([['child', '👤 کودک'], ['family', '👨‍👩‍👧 خانواده'], ['other', '📝 سایرِ اطلاعاتِ فرم']] as const).map(([k, label]) => (
                        <button key={k} onClick={() => setInfoSubTab(k)}
                          className={`px-3 py-1 text-xs rounded-lg whitespace-nowrap transition-all shrink-0 ${infoSubTab === k ? 'bg-brand-100 text-brand-700 font-medium' : 'bg-white border border-gray-200 text-gray-500'}`}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {infoSubTab === 'child' && (
                      <div className="bg-white rounded-xl border border-gray-100 p-4">
                        <Section title="مشخصات کودک" icon="👤">
                          <InfoRow label="نام کودک" value={selectedPatient.child_name} />
                          <InfoRow label="تاریخ تولد" value={enTime(selectedPatient.birth_date)} />
                          <InfoRow label="پایه‌ی تحصیلی" value={selectedPatient.grade} />
                        </Section>
                        <Section title="شکایت اصلی" icon="💬">
                          <InfoRow label="دلیلِ مراجعه" value={selectedPatient.reason} />
                        </Section>
                      </div>
                    )}

                    {infoSubTab === 'family' && (
                      <div className="bg-white rounded-xl border border-gray-100 p-4">
                        <Section title="اطلاعات پدر" icon="👨">
                          <InfoRow label="نام" value={selectedPatient.father_name} />
                          <InfoRow label="تلفن" value={enTime(selectedPatient.father_phone)} />
                        </Section>
                        <Section title="اطلاعات مادر" icon="👩">
                          <InfoRow label="نام" value={selectedPatient.mother_name} />
                          <InfoRow label="تلفن" value={enTime(selectedPatient.mother_phone)} />
                        </Section>
                      </div>
                    )}

                    {infoSubTab === 'other' && (
                      <div className="bg-white rounded-xl border border-gray-100 p-4">
                        {/* هرچه در details است — چه فیلدهای دیتاییِ فرمِ رزرو، چه پرونده‌های قدیمی‌تر */}
                        <Section title="پاسخ‌هایِ فرمِ رزرو" icon="📝">
                          {Object.keys((selectedPatient as any).details || {}).length === 0 ? (
                            <p className="text-xs text-gray-400">چیزی ثبت نشده.</p>
                          ) : (
                            Object.entries((selectedPatient as any).details || {}).map(([key, value]) => (
                              <InfoRow key={key} label={detailFieldLabel(key)} value={formatDetailValue(value)} />
                            ))
                          )}
                        </Section>
                        <Section title="مشخصاتِ نوبت‌دهی" icon="🗓">
                          <InfoRow label="نوعِ جلسه" value={selectedPatient.session_type === 'online' ? '🎥 آنلاین' : selectedPatient.session_type === 'offline' ? '🏥 حضوری' : selectedPatient.session_type} />
                          <InfoRow label="مطبِ انتخابی" value={(selectedPatient as any).office_location} />
                          <InfoRow label="نامِ سرپرست" value={(selectedPatient as any).parent_name} />
                          <InfoRow label="تلفنِ تماس" value={enTime((selectedPatient as any).phone)} />
                          <InfoRow label="شماره‌ی پرونده" value={selectedPatient.case_number} />
                        </Section>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Tab: اطلاعات پرداخت ─────────────────────────────── */}
                {patientTab === 'payment' && (
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    {(() => {
                      const bk = bookings.find(b => b.case_number === selectedPatient.case_number)
                      const fmt = (paid?: boolean, sub?: boolean, ref?: string) =>
                        paid ? `✅ پرداخت‌شده${ref ? ' — فیش: ' + ref : ''}` : sub ? '⏳ منتظر تأیید' : '—'
                      return (
                        <Section title="اطلاعات پرداخت" icon="💳">
                          <InfoRow label="مصاحبه‌ی اولیه" value={fmt(bk?.interview_paid, false, bk?.interview_payment_ref)} />
                          <InfoRow label="ارزیابیِ کودک" value={fmt(bk?.assessment_paid, false, bk?.assessment_payment_ref)} />
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
                      className="w-full py-3 border-2 border-dashed border-brand-200 rounded-xl text-sm text-brand-600 hover:bg-brand-50 mb-4 transition-all">
                      + تعریف پروتکل درمانی جدید
                    </button>
                    <div className="space-y-3">
                      {packages.map(pkg => {
                        const pkgSessions = sessions.filter(s => s.package_id === pkg.id)
                        const childSess = pkgSessions.filter(s => s.attendee === 'child')
                        const parentSess = pkgSessions.filter(s => s.attendee === 'parent')
                        const total = (pkg.child_sessions * (pkg.child_session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline)) +
                          (pkg.parent_sessions * (pkg.parent_session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline))
                        return (
                          <div key={pkg.id} className="bg-white rounded-xl border border-gray-100 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="font-medium text-gray-900 text-sm">
                                {PERSIAN_MONTHS[parseInt(pkg.month) - 1]} {pkg.year}
                              </h3>
                              <span className="text-sm font-semibold text-brand-600">{total.toLocaleString('en-US')} ت</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                              <div>کودک: {childSess.length}/{pkg.child_sessions} جلسه ({pkg.child_session_type === 'online' ? 'آنلاین' : 'حضوری'})</div>
                              <div>والدین: {parentSess.length}/{pkg.parent_sessions} جلسه ({pkg.parent_session_type === 'online' ? 'آنلاین' : 'حضوری'})</div>
                            </div>
                            {pkg.notes && <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">{pkg.notes}</p>}
                            <div className="mt-3 pt-3 border-t border-gray-50">
                              {pkg.paid ? (
                                <div className="text-center text-xs text-green-600 bg-green-50 rounded-lg py-2 border border-green-100">
                                  ✅ پرداخت تأیید شد{pkg.payment_ref ? ` — فیش: ${pkg.payment_ref}` : ''}
                                </div>
                              ) : pkg.payment_submitted ? (
                                <div className="text-xs text-blue-600 text-center bg-blue-50 rounded-lg py-2 border border-blue-100">
                                  💳 مراجع اعلام کرده پرداخت کرده{pkg.payment_ref ? ` — فیش: ${pkg.payment_ref}` : ''} — تأیید از تبِ «تأیید پرداخت‌ها»
                                </div>
                              ) : (
                                <div className="text-center text-xs text-amber-600 bg-amber-50 rounded-lg py-2 border border-amber-100">💳 منتظر پرداختِ مراجع</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── Tab: جلسات ────────────────────────────────────── */}
                {patientTab === 'sessions' && (
                  <div>
                    {/* جلسه‌های مصاحبه و ارزیابی (مرحله‌های اولِ درمان) */}
                    {(() => {
                      const bk = bookings.find(b => b.case_number === selectedPatient.case_number)
                      if (!bk) return null
                      const showInterview = !!bk.interview_date || bk.interview_held
                      const showAssessment = !!bk.assessment_date || bk.assessment_held
                      if (!showInterview && !showAssessment) return null
                      return (
                        <div className="space-y-2 mb-4">
                          {showInterview && (
                            <StageSessionCard stage="interview" date={bk.interview_date} time={bk.interview_time}
                              notes={bk.interview_notes || ''} held={!!bk.interview_held}
                              canHold={!!bk.interview_date && !bk.interview_held}
                              onSave={(notes, markHeld) => saveStageSession(bk.id, 'interview', notes, markHeld)} />
                          )}
                          {showAssessment && (
                            <StageSessionCard stage="assessment" date={bk.assessment_date} time={bk.assessment_time}
                              notes={bk.assessment_notes || ''} held={!!bk.assessment_held}
                              canHold={!!bk.assessment_date && !bk.assessment_held}
                              onSave={(notes, markHeld) => saveStageSession(bk.id, 'assessment', notes, markHeld)} />
                          )}
                        </div>
                      )
                    })()}

                    <div className="text-xs text-gray-400 mb-2 px-1">جلسات پروتکل درمان</div>
                    <button onClick={() => setShowNewSession(true)}
                      className="w-full py-3 border-2 border-dashed border-brand-200 rounded-xl text-sm text-brand-600 hover:bg-brand-50 mb-4 transition-all">
                      + ثبت جلسه جدید
                    </button>
                    <div className="space-y-2">
                      {(() => {
                        const sorted = [...sessions].sort((a, b) => (a.session_number || 0) - (b.session_number || 0))
                        let n = 0
                        return sorted.map((s) => {
                          const active = s.status !== 'forfeited' && s.status !== 'replaced' && s.status !== 'cancelled'
                          const num = active ? ++n : null
                          return (
                        <div key={s.id} onClick={() => { setEditSession(s); setSessForm({ session_goals: s.session_goals || '', session_summary: s.session_summary || '', doctor_notes_private: s.doctor_notes_private || '', doctor_note_for_patient: s.doctor_note_for_patient || '', status: s.status || 'confirmed' }) }}
                          className="bg-white rounded-xl border border-gray-100 p-3 cursor-pointer hover:border-brand-200 transition-all">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${num ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-400'}`}>{num ? toFarsiNum(num) : '—'}</div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">{enTime(s.session_date)} — {enTime(s.session_time)}</div>
                                <div className="text-xs text-gray-400">
                                  {s.attendee === 'child' ? '👧 کودک' : '👨‍👩 والدین'} •
                                  {s.session_type === 'online' ? ' 🎥 آنلاین' : ' 🏥 حضوری'}
                                </div>
                              </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[s.status] || 'bg-gray-100 text-gray-500'}`}>
                              {STATUS_LABEL[s.status] || s.status}
                            </span>
                          </div>
                          {s.session_summary && (
                            <div className="mt-2 bg-blue-50 rounded-lg p-2 border border-blue-100">
                              <p className="text-xs text-blue-600 mb-0.5">شرح جلسه:</p>
                              <p className="text-xs text-gray-700 line-clamp-2">{s.session_summary}</p>
                            </div>
                          )}
                          {!s.paid && s.payment_submitted && (
                            <div className="mt-2 text-xs text-blue-600" onClick={e => e.stopPropagation()}>
                              💳 پرداختِ جایگزین اعلام شد{s.payment_ref ? ` — ${s.payment_ref}` : ''} — تأیید از تبِ «تأیید پرداخت‌ها»
                            </div>
                          )}
                          {!s.paid && !s.payment_submitted && active && (
                            <div className="mt-2 text-xs text-gray-400" onClick={e => e.stopPropagation()}>⏳ در انتظارِ پرداختِ مراجع</div>
                          )}
                          {s.refund_status === 'pending' && (
                            <div className="mt-2 text-xs text-amber-600" onClick={e => e.stopPropagation()}>
                              💸 بازپرداختِ {toFarsiNum(s.refund_percent || 50)}٪ — در انتظارِ واریز (از تبِ «تأیید پرداخت‌ها» انجام می‌شود)
                            </div>
                          )}
                          {s.refund_status === 'done' && (
                            <div className="mt-2 text-xs text-green-600" onClick={e => e.stopPropagation()}>✅ بازپرداخت واریز شد{s.refund_ref ? ` — ${s.refund_ref}` : ''}</div>
                          )}
                        </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Patient Edit Form ────────────────────────────────────── */}
            {patientView === 'edit' && selectedPatient && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setPatientView('detail')}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
                    ← انصراف
                  </button>
                  <button onClick={savePatient}
                    className="text-sm px-4 py-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700">
                    💾 ذخیره پرونده
                  </button>
                </div>

                <div className="space-y-4">
                  {/* مشخصات کودک */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">👤 مشخصات کودک</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="نام کودک *" value={editingPatient.child_name} onChange={v => setEditingPatient(p => ({...p, child_name: v}))} />
                      <Field label="تاریخ تولد *" value={editingPatient.birth_date} onChange={v => setEditingPatient(p => ({...p, birth_date: v}))} placeholder="1394/06/15" />
                      <Field label="پایه‌ی تحصیلی" value={editingPatient.grade} onChange={v => setEditingPatient(p => ({...p, grade: v}))} placeholder="سوم ابتدایی" />
                    </div>
                    <div className="mt-3 space-y-3">
                      <TextareaField label="دلیلِ مراجعه *" value={editingPatient.reason} onChange={v => setEditingPatient(p => ({...p, reason: v}))} rows={3} />
                    </div>
                  </div>

                  {/* اطلاعات پدر */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">👨 اطلاعات پدر</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="نام پدر *" value={editingPatient.father_name} onChange={v => setEditingPatient(p => ({...p, father_name: v}))} />
                      <Field label="تلفن پدر *" value={editingPatient.father_phone} onChange={v => setEditingPatient(p => ({...p, father_phone: v}))} placeholder="09xxxxxxxxx" />
                    </div>
                  </div>

                  {/* اطلاعات مادر */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">👩 اطلاعات مادر</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="نام مادر" value={editingPatient.mother_name} onChange={v => setEditingPatient(p => ({...p, mother_name: v}))} />
                      <Field label="تلفن مادر" value={editingPatient.mother_phone} onChange={v => setEditingPatient(p => ({...p, mother_phone: v}))} placeholder="09xxxxxxxxx" />
                    </div>
                  </div>

                  {/* سایرِ پاسخ‌های فرمِ رزرو — کاملاً دیتایی، برچسب از فرمِ فعلی یا نگاشتِ پرونده‌های قدیمی */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">📝 سایرِ اطلاعاتِ فرم</h3>
                    <div className="space-y-3">
                      {Object.keys(editingPatient.details || {}).length === 0 ? (
                        <p className="text-xs text-gray-400">چیزی ثبت نشده.</p>
                      ) : (
                        Object.entries(editingPatient.details || {}).map(([key, value]) => (
                          <TextareaField key={key} label={detailFieldLabel(key)} value={formatDetailValue(value)} rows={2}
                            onChange={v => setEditingPatient(p => ({ ...p, details: { ...(p.details || {}), [key]: v } }))} />
                        ))
                      )}
                      <SelectField label="نوعِ جلسه" value={editingPatient.session_type} onChange={v => setEditingPatient(p => ({...p, session_type: v} as any))} options={['offline','online']} />
                    </div>

                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <button onClick={() => setPatientView('detail')}
                    className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-500">انصراف</button>
                  <button onClick={savePatient}
                    className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium">💾 ذخیره پرونده</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: BOOKINGS
        ════════════════════════════════════════════════════════════════ */}
        {mainTab === 'bookings' && (
          <div>
            {/* صندوقِ تأیید پرداخت‌ها — سه بخش */}
            {(() => {
              const childOf = (cn: string) => bookings.find(b => b.case_number === cn)?.child_name || cn
              const interviewPending = bookings.filter(b => b.flow_status === FLOW.INTERVIEW_PAYMENT_SUBMITTED)
              const assessmentPending = bookings.filter(b => b.flow_status === FLOW.ASSESSMENT_PAYMENT_SUBMITTED)
              const pkgAmount = (p: Package) =>
                (p.child_sessions * (p.child_session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline)) +
                (p.parent_sessions * (p.parent_session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline))
              const totalPending = interviewPending.length + assessmentPending.length + pendingPkgs.length + pendingSess.length + pendingRefunds.length
              const refundAmt = (s: Session) => {
                const full = s.session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline
                return Math.round(full * (100 - (s.refund_percent || 50)) / 100)
              }

              if (loading) return <div className="text-center py-16 text-gray-400">در حال بارگذاری...</div>

              return (
                <div className="space-y-6">
                  <p className="text-sm text-gray-500">
                    {totalPending === 0 ? 'موردِ منتظرِ اقدامی وجود ندارد.' : `${toFarsiNum(totalPending)} مورد منتظر اقدام است.`}
                  </p>

                  {/* بخش ۱: مصاحبه */}
                  <PendingSection title="مصاحبه‌ی اولیه" icon="🩺" count={interviewPending.length}>
                    {interviewPending.map(b => (
                      <PendingPayCard key={b.id} name={b.child_name} caseNumber={b.case_number}
                        amount={b.interview_price || PRICING.interview} receipt={b.interview_payment_ref}>
                        <div className="flex gap-2">
                          <button onClick={() => confirmStagePayment(b.id, 'interview')}
                            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm">✅ تأیید پرداخت</button>
                          <button onClick={() => rejectInterview(b.id)}
                            className="flex-1 py-2 border border-red-200 text-red-500 rounded-lg text-sm">رد</button>
                        </div>
                      </PendingPayCard>
                    ))}
                  </PendingSection>

                  {/* بخش ۲: ارزیابی */}
                  <PendingSection title="ارزیابیِ کودک" icon="🧩" count={assessmentPending.length}>
                    {assessmentPending.map(b => (
                      <PendingPayCard key={b.id} name={b.child_name} caseNumber={b.case_number}
                        amount={b.assessment_price || PRICING.assessment} receipt={b.assessment_payment_ref}>
                        <div className="flex gap-2">
                          <button onClick={() => confirmStagePayment(b.id, 'assessment')}
                            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm">✅ تأیید پرداخت</button>
                          <button onClick={() => rejectAssessmentPayment(b.id)}
                            className="flex-1 py-2 border border-red-200 text-red-500 rounded-lg text-sm">رد</button>
                        </div>
                      </PendingPayCard>
                    ))}
                  </PendingSection>

                  {/* بخش ۳: پروتکل‌های درمان (و جلسه‌های جایگزین) */}
                  <PendingSection title="پروتکل درمان" icon="📦" count={pendingPkgs.length + pendingSess.length}>
                    {pendingPkgs.map(p => (
                      <PendingPayCard key={p.id} name={childOf(p.case_number)} caseNumber={p.case_number}
                        amount={pkgAmount(p)} receipt={p.payment_ref}
                        sub={`${PERSIAN_MONTHS[parseInt(p.month) - 1]} ${p.year} • ${p.child_sessions + p.parent_sessions} جلسه`}>
                        <div className="flex gap-2">
                          <button onClick={() => confirmPackagePayment(p.id)}
                            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm">✅ تأیید پرداخت</button>
                          <button onClick={() => rejectPackagePayment(p.id)}
                            className="flex-1 py-2 border border-red-200 text-red-500 rounded-lg text-sm">رد</button>
                        </div>
                      </PendingPayCard>
                    ))}
                    {pendingSess.map(s => (
                      <PendingPayCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
                        amount={s.session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline} receipt={s.payment_ref}
                        sub="جلسه‌ی جایگزین">
                        <div className="flex gap-2">
                          <button onClick={() => confirmSessionPayment(s.id)}
                            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm">✅ تأیید پرداخت</button>
                          <button onClick={() => rejectSessionPayment(s.id)}
                            className="flex-1 py-2 border border-red-200 text-red-500 rounded-lg text-sm">رد</button>
                        </div>
                      </PendingPayCard>
                    ))}
                  </PendingSection>

                  {/* بخش ۴: بازپرداختِ کنسلی‌ها */}
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

            {/* Booking detail modal */}
            {selectedBooking && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => { if (e.target === e.currentTarget) setSelectedBooking(null) }}>
                <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 shadow-xl" dir="rtl">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900">{selectedBooking.child_name}</h2>
                    <button onClick={() => setSelectedBooking(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <div className="space-y-2 mb-4">
                    <InfoRow label="شماره پرونده" value={selectedBooking.case_number} />
                    <InfoRow label="تاریخ" value={selectedBooking.booking_date} />
                    <InfoRow label="ساعت" value={selectedBooking.booking_time} />
                    <InfoRow label="نوع جلسه" value={selectedBooking.session_type === 'online' ? 'آنلاین' : `حضوری${selectedBooking.office_location ? ` — ${selectedBooking.office_location}` : ''}`} />
                    <InfoRow label="مبلغ" value={`${selectedBooking.price?.toLocaleString('en-US')} تومان`} />
                    <InfoRow label="وضعیت" value={STATUS_LABEL[selectedBooking.status]} />
                    <InfoRow label="مرحله پرونده" value={FLOW_LABEL[selectedBooking.flow_status || FLOW.INTERVIEW_AWAITING_PAYMENT] || '—'} />
                    {selectedBooking.interview_date && (
                      <InfoRow label="وقت مصاحبه" value={`${enTime(selectedBooking.interview_date)} — ${enTime(selectedBooking.interview_time)}`} />
                    )}
                    {selectedBooking.interview_payment_ref && (
                      <InfoRow label="فیش واریزیِ مصاحبه" value={selectedBooking.interview_payment_ref} />
                    )}
                    {selectedBooking.assessment_date && (
                      <InfoRow label="وقت ارزیابی" value={`${enTime(selectedBooking.assessment_date)} — ${enTime(selectedBooking.assessment_time)}`} />
                    )}
                    {selectedBooking.assessment_payment_ref && (
                      <InfoRow label="فیش واریزیِ ارزیابی" value={selectedBooking.assessment_payment_ref} />
                    )}
                    {selectedBooking.flow_status === FLOW.INTERVIEW_REJECTED && selectedBooking.reject_reason && (
                      <InfoRow label="دلیل رد" value={selectedBooking.reject_reason} />
                    )}
                  </div>
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 mb-1 block">یادداشت دکتر</label>
                    <textarea value={bookingNotes} onChange={e => setBookingNotes(e.target.value)}
                      rows={3} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none" />
                  </div>

                  {/* اکشن‌های مرحله‌ایِ دکتر */}
                  {(() => {
                    const fs = selectedBooking.flow_status || FLOW.INTERVIEW_AWAITING_PAYMENT
                    const id = selectedBooking.id

                    if (fs === FLOW.INTERVIEW_AWAITING_PAYMENT)
                      return (
                        <div className="space-y-2">
                          <div className="text-center text-xs text-amber-700 bg-amber-50 rounded-xl py-2.5 border border-amber-100">💳 منتظر پرداختِ کارت‌به‌کارتِ مصاحبه توسط مراجع</div>
                          <button onClick={() => rejectInterview(id)} className="w-full py-2 border border-red-200 text-red-500 rounded-xl text-sm">❌ رد پرونده</button>
                        </div>
                      )

                    if (fs === FLOW.INTERVIEW_PAYMENT_SUBMITTED)
                      return (
                        <div className="space-y-2">
                          <div className="text-center text-xs text-blue-700 bg-blue-50 rounded-xl py-2 border border-blue-100">مراجع اعلام کرده پرداخت کرده. واریز را بررسی و تأیید کنید.</div>
                          <div className="flex gap-2">
                            <button onClick={() => confirmStagePayment(id, 'interview')} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm">✅ تأیید پرداختِ مصاحبه</button>
                            <button onClick={() => rejectInterview(id)} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm">❌ رد</button>
                          </div>
                        </div>
                      )

                    if (fs === FLOW.INTERVIEW_AWAITING_BOOKING)
                      return <div className="text-center text-sm text-gray-600 bg-gray-50 rounded-xl py-3">پرداخت تأیید شد. منتظرِ گرفتنِ وقتِ مصاحبه توسط مراجع.</div>

                    if (fs === FLOW.INTERVIEW_BOOKED)
                      return (
                        <button onClick={() => openAssessmentStage(id)} className="w-full py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium">
                          ✅ مصاحبه برگزار شد → فعال‌سازیِ مرحله‌ی ارزیابی
                        </button>
                      )

                    if (fs === FLOW.ASSESSMENT_AWAITING_PAYMENT)
                      return <div className="text-center text-xs text-amber-700 bg-amber-50 rounded-xl py-2.5 border border-amber-100">💳 منتظر پرداختِ کارت‌به‌کارتِ ارزیابی توسط مراجع</div>

                    if (fs === FLOW.ASSESSMENT_PAYMENT_SUBMITTED)
                      return (
                        <button onClick={() => confirmStagePayment(id, 'assessment')} className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium">
                          ✅ تأیید پرداختِ ارزیابی
                        </button>
                      )

                    if (fs === FLOW.ASSESSMENT_AWAITING_BOOKING)
                      return <div className="text-center text-sm text-gray-600 bg-gray-50 rounded-xl py-3">پرداختِ ارزیابی تأیید شد. منتظرِ گرفتنِ وقتِ ارزیابی توسط مراجع.</div>

                    if (fs === FLOW.ASSESSMENT_BOOKED)
                      return <div className="text-center text-sm text-gray-600 bg-gray-50 rounded-xl py-3">ارزیابی رزرو شد. پس از برگزاری، از تبِ «پروتکل‌های درمان»ی پرونده، پروتکلِ درمان را تعریف کنید.</div>

                    return (
                      <div className="text-center text-sm text-gray-600 bg-gray-50 rounded-xl py-3">
                        مرحله: <b className="text-gray-800">{FLOW_LABEL[fs] || fs}</b>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: SCHEDULE
        ════════════════════════════════════════════════════════════════ */}
        {mainTab === 'schedule' && (
          <div className="max-w-2xl mx-auto">
            {/* زیرتب‌ها */}
            <div className="flex bg-white rounded-xl border border-gray-100 p-1 mb-4">
              {([['edit', '🗓 تنظیم روزها'], ['agenda', '📋 برنامه‌ی نوبت‌ها']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setSchedSubTab(k)}
                  className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${schedSubTab === k ? 'bg-brand-600 text-white' : 'text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* نوار ماه (مشترک) */}
            <div className="bg-white rounded-2xl border border-gray-100 p-3 mb-4 flex items-center justify-between gap-2">
              <button onClick={() => changeMonth(-1)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 shrink-0">قبلی</button>
              <h2 className="text-sm sm:text-base font-medium text-gray-800 text-center">{PERSIAN_MONTHS[schedMonth]} {toFarsiNum(schedYear)}</h2>
              <button onClick={() => changeMonth(1)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 shrink-0">بعدی</button>
            </div>

            {/* ════ نمای تنظیم روزها ════ */}
            {schedSubTab === 'edit' && (
              <>
                {/* راهنمای رنگ‌ها */}
                <div className="flex items-center justify-center gap-4 text-xs text-gray-500 mb-3">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-300" /> روز کاری</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400" /> نوبتِ رزروشده</span>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['ش','ی','د','س','چ','پ','ج'].map(d => (
                      <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
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
                            ${isSel ? 'ring-2 ring-brand-500 font-medium' : ''}
                            ${!isPast && totalSlots > 0 ? 'bg-green-50 text-green-700' : ''}
                            ${!isPast && totalSlots === 0 ? 'text-gray-600 hover:bg-gray-50' : ''}`}>
                          {toFarsiNum(d)}
                          {!isPast && totalSlots > 0 && (
                            <span className="block text-[10px] mt-0.5 text-green-600">{toFarsiNum(totalSlots)} ساعت</span>
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
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 className="text-sm font-medium text-gray-800 mb-1">
                      ساعات کاری — {toFarsiNum(selectedDay)} {PERSIAN_MONTHS[schedMonth]}
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">ساعت‌هایی که نوبت می‌دهی را انتخاب کن. اگر هیچ ساعتی انتخاب نکنی، آن روز تعطیل محسوب می‌شود.</p>
                    {profile.session_modes === 'both' && (
                      <p className="text-[11px] text-gray-400 mb-3">روی نوعِ هر ساعت بزن تا بینِ 🎥 آنلاین و مطب‌های حضوری جابجا شود. هر ساعت یک نوعِ مشخص دارد.</p>
                    )}
                    {profile.session_modes === 'offline' && settings.office_locations.length > 1 && (
                      <p className="text-[11px] text-gray-400 mb-3">روی هر ساعت بزن تا بینِ مطب‌ها جابجا شود.</p>
                    )}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {ALL_TIMES.map(t => {
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
                        if (mode === 'both' || mode === 'online') opts.push({ kind: 'online', label: '🎥 آنلاین' })
                        if (mode === 'both' || mode === 'offline') {
                          if (offlineLocs.length <= 1) opts.push({ kind: 'offline', loc: offlineLocs[0]?.title, label: `🏥 ${offlineLocs[0]?.title || 'حضوری'}` })
                          else offlineLocs.forEach(l => opts.push({ kind: 'offline', loc: l.title, label: `🏥 ${l.title}` }))
                        }
                        const fixed = opts.length === 1
                        const curKind = slotTypes[t] === 'offline' ? 'offline' : slotTypes[t] === 'online' ? 'online' : ''
                        const curLoc = slotLocs[t]
                        let curIdx = opts.findIndex(o => o.kind === curKind && (o.kind !== 'offline' || (o.loc || '') === (curLoc || '')))
                        if (curIdx < 0) curIdx = 0  // پیش‌فرض: اولین گزینه
                        const curLabel = opts[curIdx]?.label
                        const setOpt = (o: Opt) => {
                          setSlotTypes(prev => ({ ...prev, [t]: o.kind }))
                          setSlotLocs(prev => { const n = { ...prev }; if (o.kind === 'offline' && o.loc) n[t] = o.loc; else delete n[t]; return n })
                        }
                        const cycle = (ev: { stopPropagation: () => void }) => {
                          ev.stopPropagation()
                          setOpt(opts[(curIdx + 1) % opts.length])
                        }
                        return (
                          <div key={t}
                            onClick={() => {
                              if (locked) return
                              if (selected) {
                                setSelectedTimes(prev => prev.filter(x => x !== t))
                                setSlotTypes(st => { const n = { ...st }; delete n[t]; return n })
                                setSlotLocs(sl => { const n = { ...sl }; delete n[t]; return n })
                              } else {
                                setSelectedTimes(prev => [...prev, t])
                                setOpt(opts[0])  // پیش‌فرض: اولین گزینه (بدونِ «هردو»)
                              }
                            }}
                            className={`text-center py-2 border rounded-xl text-sm transition-all
                              ${isPastTime ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed line-through' :
                                takenBy ? 'border-amber-200 bg-amber-50 text-amber-700 cursor-not-allowed' :
                                'cursor-pointer ' + (selected ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300')}`}>
                            {enTime(t)}
                            {takenBy && !isPastTime && <span className="block text-[10px] mt-0.5">🔒 {takenBy.name}</span>}
                            {isPastTime && <span className="block text-[10px] mt-0.5">گذشته</span>}
                            {selected && !locked && (
                              fixed
                                ? <span className="block text-[10px] mt-1 text-brand-600">{opts[0]?.label}</span>
                                : <button onClick={cycle}
                                    className="block w-full text-[10px] mt-1 text-brand-700 bg-white/70 border border-brand-200 rounded py-0.5 hover:bg-white truncate">{curLabel}</button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <button onClick={saveSchedule} disabled={schedSaving}
                      className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-800 transition-colors">
                      {schedSaving ? 'در حال ذخیره...' : schedSaved ? '✅ ذخیره شد!' : '💾 ذخیره برنامه'}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ════ نمای برنامه‌ی نوبت‌ها ════ */}
            {schedSubTab === 'agenda' && (
              <div className="space-y-3">
                {/* تاگلِ هفتگی/ماهانه */}
                <div className="flex bg-white rounded-xl border border-gray-100 p-1">
                  {([['week', 'هفتگی'], ['month', 'ماهانه']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setAgendaMode(k)}
                      className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-all ${agendaMode === k ? 'bg-brand-600 text-white' : 'text-gray-500'}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {(() => {
                  const WEEK = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']
                  // مرزِ هفته‌ها (شنبه‌ها در روزهای ۶، ۱۳، ۲۰، ۲۷ شروع می‌شوند؛ هفته‌ی اول ۱ تا ۵)
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
                        <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-3 py-2 gap-2">
                          <button onClick={() => setWeekIdx(i => Math.max(0, i - 1))} disabled={wIdx === 0}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 disabled:opacity-30 shrink-0">قبلی</button>
                          <span className="text-xs text-gray-600 text-center">هفته‌ی {toFarsiNum(wIdx + 1)} — {toFarsiNum(rangeStart)} تا {toFarsiNum(rangeEnd)} {PERSIAN_MONTHS[schedMonth]}</span>
                          <button onClick={() => setWeekIdx(i => Math.min(weekStarts.length - 1, i + 1))} disabled={wIdx >= weekStarts.length - 1}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 disabled:opacity-30 shrink-0">بعدی</button>
                        </div>
                      )}

                      {days.length === 0 ? (
                        <div className="text-center py-16 text-gray-400 bg-white rounded-2xl border border-gray-100">
                          {agendaMode === 'week' ? 'برای این هفته روز کاری‌ای تنظیم نشده است.' : 'برای این ماه روز کاری‌ای تنظیم نشده است.'}
                        </div>
                      ) : days.map(({ d, appts, allTimes, weekday }) => (
                        <div key={d} className="bg-white rounded-2xl border border-gray-100 p-4">
                          <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-50">
                            <span className="text-sm font-semibold text-gray-800">{weekday} {toFarsiNum(d)} {PERSIAN_MONTHS[schedMonth]}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{toFarsiNum(appts.length)} از {toFarsiNum(allTimes.length)} رزرو</span>
                              {appts.length > 0 && (
                                <button onClick={() => cancelDay(`${schedYear}/${schedMonth + 1}/${d}`, appts)}
                                  className="text-xs px-2 py-0.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">لغو روز</button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {allTimes.map(t => {
                              const appt = appts.find(a => a.time === t)
                              const slotType = schedForDay(d)?.slot_types?.[t]
                              const slotLoc = schedForDay(d)?.slot_locs?.[t]
                              const slotTypeLabel = slotType === 'online' ? '🎥 آنلاین' : slotType === 'offline' ? `🏥 ${slotLoc || 'حضوری'}` : 'خالی'
                              return (
                                <div key={t} className="flex items-center gap-3 text-sm">
                                  <span className="font-mono text-xs text-gray-500 w-12 shrink-0">{enTime(t)}</span>
                                  {appt ? (
                                    <span className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${appt.color}`}>
                                      <span className="font-medium">{appt.mode === 'online' ? '🎥 ' : appt.mode === 'offline' ? '🏥 ' : ''}{appt.name}</span>
                                      <span className="flex items-center gap-2">
                                        <span className="opacity-75">{appt.type}{appt.loc ? ` — ${appt.loc}` : ''}</span>
                                        <button onClick={() => cancelAppointment(appt)}
                                          className="px-1.5 py-0.5 bg-white/70 border border-gray-200 rounded text-red-500 hover:bg-white">لغو</button>
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="flex-1 px-3 py-1.5 rounded-lg border border-dashed border-gray-200 text-xs text-gray-300">{slotTypeLabel}</span>
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
              <div className="text-center py-16 text-gray-400">در حال محاسبه‌ی گزارش...</div>
            ) : !finance ? (
              <div className="text-center py-16 text-gray-400">داده‌ای برای نمایش نیست</div>
            ) : (() => {
              const f = finance
              const money = (n: number) => n.toLocaleString('en-US') + ' تومان'
              const cats = [
                { key: 'interview', label: 'مصاحبه‌ی اولیه', icon: '🗣', amount: f.paid.interview, count: f.paidCount.interview },
                { key: 'assessment', label: 'ارزیابی', icon: '📋', amount: f.paid.assessment, count: f.paidCount.assessment },
                { key: 'packages', label: 'پروتکل درمان', icon: '📦', amount: f.paid.packages, count: f.paidCount.packages },
                { key: 'sessions', label: 'جلسه‌ی جداگانه', icon: '🎯', amount: f.paid.sessions, count: f.paidCount.sessions },
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
                    <p className="text-xs text-gray-400">ارقام از پرداخت‌های تأییدشده در بازه‌ی انتخابی محاسبه شده‌اند.</p>
                    <button onClick={() => { setFinanceLoaded(false); loadFinance() }}
                      className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">↻ بروزرسانی</button>
                  </div>
                  <div className="flex bg-white rounded-xl border border-gray-100 p-1 gap-1">
                    {([['1m', '۱ ماه'], ['3m', '۳ ماه'], ['6m', '۶ ماه'], ['12m', '۱۲ ماه'], ['all', 'همه']] as const).map(([k, lbl]) => (
                      <button key={k} onClick={() => { setFinanceRange(k); setFinanceCustomOpen(false); setFinanceLoaded(false); loadFinance(k) }}
                        className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${financeRange === k ? 'bg-brand-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>

                  {/* بازه‌ی دقیقِ جلالی */}
                  <div className="bg-white rounded-xl border border-gray-100 p-3">
                    <button onClick={() => setFinanceCustomOpen(o => !o)}
                      className={`text-xs font-medium ${financeRange === 'custom' ? 'text-brand-700' : 'text-gray-500'}`}>
                      🗓 بازه‌ی دقیق {financeRange === 'custom' && financeFromIso ? '(فعال)' : ''} {financeCustomOpen ? '▲' : '▼'}
                    </button>
                    {financeCustomOpen && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-500 w-8 shrink-0">از</span>
                          <JalaliDateSelect value={fromJ} onChange={setFromJ} />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-500 w-8 shrink-0">تا</span>
                          <JalaliDateSelect value={toJ} onChange={setToJ} />
                        </div>
                        <button onClick={applyCustomRange}
                          className="w-full py-2 bg-brand-600 text-white rounded-lg text-xs font-medium hover:bg-brand-800">اعمالِ بازه</button>
                      </div>
                    )}
                  </div>

                  {/* خلاصه */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <div className="text-xs text-gray-400 mb-1">💰 درآمدِ خالص</div>
                      <div className="text-2xl font-bold text-brand-700">{money(f.netPaid)}</div>
                      {f.refundsTotal > 0 && (
                        <div className="text-[11px] text-gray-400 mt-1">ناخالص {money(f.totalPaid)} − بازپرداخت {money(f.refundsTotal)}</div>
                      )}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <div className="text-xs text-gray-400 mb-1">⏳ در انتظارِ تأیید</div>
                      <div className="text-2xl font-bold text-amber-600">{money(f.totalPending)}</div>
                    </div>
                  </div>

                  {f.refundsTotal > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between">
                      <span className="text-sm text-gray-700">💸 بازپرداختِ کنسلی‌ها <span className="text-xs text-gray-400">({toFarsiNum(f.refundsCount)} مورد)</span></span>
                      <span className="text-sm font-semibold text-red-500">− {money(f.refundsTotal)}</span>
                    </div>
                  )}

                  {/* درآمد به تفکیکِ دسته */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-4">درآمد به تفکیکِ دسته</h2>
                    <div className="space-y-3">
                      {cats.map(c => (
                        <div key={c.key}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-700">{c.icon} {c.label}{' '}
                              <span className="text-gray-400 text-xs">({toFarsiNum(c.count)} مورد)</span></span>
                            <span className="font-medium text-gray-800">{money(c.amount)}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-400 rounded-full" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* روندِ ماهانه */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-4">روندِ درآمدِ ماهانه</h2>
                    {f.monthly.length === 0 ? (
                      <p className="text-xs text-gray-400">هنوز درآمدی ثبت نشده است.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {f.monthly.map(m => {
                          const [y, mm] = m.month.split('/')
                          const label = `${PERSIAN_MONTHS[parseInt(mm) - 1]} ${y}`
                          return (
                            <div key={m.month}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-gray-600">{label}</span>
                                <span className="text-gray-700 font-medium">{money(m.amount)}</span>
                              </div>
                              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${(m.amount / maxMonth) * 100}%` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* تفکیکِ آنلاین/حضوری */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">تفکیکِ آنلاین / حضوری (جلسات و پکیج‌ها)</h2>
                    <div className="flex h-4 rounded-full overflow-hidden mb-2 bg-gray-100">
                      <div className="bg-brand-400" style={{ width: `${(f.split.online / splitTotal) * 100}%` }} />
                      <div className="bg-brand-200" style={{ width: `${(f.split.offline / splitTotal) * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">🎥 آنلاین: {money(f.split.online)}</span>
                      <span className="text-gray-600">🏥 حضوری: {money(f.split.offline)}</span>
                    </div>
                  </div>

                  {/* در انتظارِ تأیید به تفکیک */}
                  {pendCats.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <h2 className="text-sm font-semibold text-gray-900 mb-3">⏳ در انتظارِ تأییدِ شما</h2>
                      <div className="space-y-2">
                        {pendCats.map(c => (
                          <div key={c.label} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{c.label} <span className="text-xs text-gray-400">({toFarsiNum(c.count)} مورد)</span></span>
                            <span className="font-medium text-amber-600">{money(c.amount)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-3">این مبالغ از طرفِ مراجع اعلام شده ولی هنوز تأیید نشده‌اند. برای تأیید به تبِ «تأیید پرداخت‌ها» بروید.</p>
                    </div>
                  )}

                  {/* پرونده‌های برتر */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">پرونده‌های با بیشترین پرداخت</h2>
                    {f.topCases.length === 0 ? (
                      <p className="text-xs text-gray-400">—</p>
                    ) : (
                      <div className="space-y-2">
                        {f.topCases.map((c, i) => (
                          <div key={c.case_number} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700">{toFarsiNum(i + 1)}. {c.name}{' '}
                              <span className="text-xs text-gray-400">({c.case_number})</span></span>
                            <span className="font-medium text-gray-800">{money(c.amount)}</span>
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
        {mainTab === 'settings' && (
          <div className="space-y-4 pb-24">
            {!settingsLoaded || !profileLoaded ? (
              <div className="text-center py-16 text-gray-400">در حال بارگذاری تنظیمات...</div>
            ) : (
            <>
              {/* سوییچرِ دکتر — فقط وقتی owner است و بیش از یک نفر پرسنل دارد */}
              {me?.isOwner && staffList.filter(r => r.is_active).length > 1 && (
                <section className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h2 className="text-sm font-semibold text-gray-900 mb-1">👥 پروفایلِ کدام دکتر؟</h2>
                  <p className="text-xs text-gray-400 mb-3">مجموعه‌ی شما چند نفر پرسنل دارد؛ اول انتخاب کنید پروفایل و برنامه‌ی کاریِ کدام‌شان را ویرایش می‌کنید.</p>
                  <select value={viewingResourceId || staffList.find(r => r.is_active)?.id || ''} onChange={e => { setViewingResourceId(e.target.value); setProfileLoaded(false); setIntakeLoaded(false) }}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400">
                    {staffList.filter(r => r.is_active).map(r => (
                      <option key={r.id} value={r.id}>{r.name}{r.title ? ` — ${r.title}` : ''}</option>
                    ))}
                  </select>
                </section>
              )}

              {/* پروفایلِ عمومی — حالا per-resource؛ دقیقاً شبیه‌سازیِ سرِ صفحه‌ی مصاحبه، مستقیم روی خودش ویرایش می‌شود */}
              <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">👤 پروفایلِ عمومی</h2>
                <p className="text-xs text-gray-400 mb-4">دقیقاً همین‌طور بالای صفحه‌ی مصاحبه به مراجع نمایش داده می‌شود — روی هرکدام بزنید تا ویرایش کنید.</p>

                <div className="bg-gray-50 rounded-2xl p-6 text-center">
                  <div className="relative w-20 h-20 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-3 text-3xl overflow-hidden shrink-0 cursor-pointer group"
                    onClick={async () => { const url = await uiPrompt('لینکِ عکسِ پروفایل (خالی برای حذف)', { defaultValue: profile.avatar_url }); if (url !== null) patchProfile({ avatar_url: url }) }}>
                    {profile.avatar_url
                      ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      : '👩‍⚕️'}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition-opacity">تغییرِ عکس</div>
                  </div>
                  <input value={profile.name} onChange={e => patchProfile({ name: e.target.value })} placeholder="نام"
                    className="text-lg font-medium text-gray-900 text-center bg-transparent border-b border-dashed border-gray-300 hover:border-gray-400 focus:outline-none focus:border-brand-500 w-full max-w-[260px] mx-auto block py-0.5" />
                  <input value={profile.title} onChange={e => patchProfile({ title: e.target.value })} placeholder="عنوان / تخصص"
                    className="text-sm text-gray-500 text-center bg-transparent border-b border-dashed border-transparent hover:border-gray-300 focus:outline-none focus:border-brand-400 w-full max-w-[260px] mx-auto block mt-1 py-0.5" />
                  <div className="flex gap-2 justify-center mt-3 flex-wrap">
                    {profile.badges.map((b, i) => (
                      <span key={i} className="text-xs pl-1.5 pr-3 py-1 bg-white border border-gray-200 rounded-lg text-gray-500 flex items-center gap-1">
                        <input value={b} size={Math.max(b.length, 3)}
                          onChange={e => { const next = [...profile.badges]; next[i] = e.target.value; patchProfile({ badges: next }) }}
                          className="bg-transparent focus:outline-none text-gray-500" />
                        <button onClick={() => patchProfile({ badges: profile.badges.filter((_, j) => j !== i) })}
                          className="text-gray-300 hover:text-red-400 leading-none">×</button>
                      </span>
                    ))}
                    <button onClick={() => patchProfile({ badges: [...profile.badges, 'نشانِ جدید'] })}
                      className="text-xs px-3 py-1 border border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-brand-300 hover:text-brand-500">
                      + نشان
                    </button>
                  </div>
                </div>
              </section>

              {/* نوعِ جلسات — per-resource (هر دکتر مدِ خودش را دارد) */}
              <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">🎥 نوعِ جلساتِ قابلِ ارائه</h2>
                <p className="text-xs text-gray-400 mb-4">تعیین می‌کند مراجع هنگامِ رزرو چه گزینه‌هایی ببیند.</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['both', '🎥🏥', 'هردو'],
                    ['online', '🎥', 'فقط آنلاین'],
                    ['offline', '🏥', 'فقط حضوری'],
                  ] as [SessionMode, string, string][]).map(([val, icon, label]) => (
                    <button key={val} onClick={() => patchProfile({ session_modes: val })}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        profile.session_modes === val
                          ? 'border-brand-600 border-2 bg-brand-50'
                          : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-xl mb-1">{icon}</div>
                      <div className="text-xs font-medium text-gray-800">{label}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* مکان‌های حضوری — سطحِ tenant، مشترکِ همه‌ی دکترها؛ فقط owner ویرایش می‌کند */}
              {me?.isOwner !== false && (
                <section className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-semibold text-gray-900">📍 مکان‌های جلسه‌ی حضوری</h2>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">می‌توانید چند مطب/آدرس تعریف کنید؛ بینِ همه‌ی دکترهای این مجموعه مشترک است.</p>
                  <div className="space-y-3">
                    {settings.office_locations.map((loc, i) => (
                      <div key={loc.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                        <div className="flex items-center gap-2 mb-2">
                          <input value={loc.title}
                            onChange={e => {
                              const next = [...settings.office_locations]; next[i] = { ...loc, title: e.target.value }
                              patchSettings({ office_locations: next })
                            }}
                            placeholder="نامِ مطب (مثلاً مطب ولنجک)"
                            className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400" />
                          <button onClick={() => patchSettings({ office_locations: settings.office_locations.filter((_, j) => j !== i) })}
                            className="text-xs px-2.5 py-2 border border-red-200 text-red-500 rounded-lg shrink-0 hover:bg-red-50">حذف</button>
                        </div>
                        <input value={loc.address}
                          onChange={e => {
                            const next = [...settings.office_locations]; next[i] = { ...loc, address: e.target.value }
                            patchSettings({ office_locations: next })
                          }}
                          placeholder="آدرسِ کامل"
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400" />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => patchSettings({ office_locations: [...settings.office_locations, { id: genId('loc'), title: '', address: '' }] })}
                    className="mt-3 text-xs px-3 py-1.5 border border-brand-200 text-brand-600 rounded-lg hover:bg-brand-50">+ افزودنِ مکان</button>
                </section>
              )}

              {/* شماره کارت‌ها — per-resource (کارتِ دریافتِ وجه/بازپرداختِ خودِ هر دکتر) */}
              <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">💳 شماره کارت‌های واریزی</h2>
                <p className="text-xs text-gray-400 mb-4">این کارت‌ها در صفحه‌ی پرداختِ کارت‌به‌کارت به مراجع نمایش داده می‌شوند.</p>
                <div className="space-y-3">
                  {profile.cards.map((c, i) => (
                    <div key={c.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <input value={c.number}
                          onChange={e => {
                            const next = [...profile.cards]; next[i] = { ...c, number: e.target.value }
                            patchProfile({ cards: next })
                          }}
                          dir="ltr" placeholder="6037-9900-0000-0000"
                          className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white font-mono tracking-wider focus:outline-none focus:border-brand-400" />
                        <button onClick={() => patchProfile({ cards: profile.cards.filter((_, j) => j !== i) })}
                          className="text-xs px-2.5 py-2 border border-red-200 text-red-500 rounded-lg shrink-0 hover:bg-red-50">حذف</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={c.holder}
                          onChange={e => {
                            const next = [...profile.cards]; next[i] = { ...c, holder: e.target.value }
                            patchProfile({ cards: next })
                          }}
                          placeholder="نامِ صاحبِ کارت"
                          className="text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400" />
                        <input value={c.bank || ''}
                          onChange={e => {
                            const next = [...profile.cards]; next[i] = { ...c, bank: e.target.value }
                            patchProfile({ cards: next })
                          }}
                          placeholder="نامِ بانک (اختیاری)"
                          className="text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400" />
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => patchProfile({ cards: [...profile.cards, { id: genId('card'), number: '', holder: '' }] })}
                  className="mt-3 text-xs px-3 py-1.5 border border-brand-200 text-brand-600 rounded-lg hover:bg-brand-50">+ افزودنِ کارت</button>
              </section>

              {/* فرمِ رزرو — کاملاً دیتایی، شبیه‌سازیِ زنده‌ی خودِ صفحه‌ی مصاحبه */}
              <section className="bg-white rounded-2xl border border-gray-100 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">📋 فرمِ رزرو</h2>
                <p className="text-xs text-gray-400 mb-4">
                  همان‌طور که پایین می‌بینید، این‌ها سوال‌هایی هستند که مراجع در صفحه‌ی مصاحبه پر می‌کند — مستقیم روی هرکدام بزنید تا ویرایش کنید.
                  نام و شماره‌تماس همیشه ثابت‌اند (برای ورودِ مراجع لازم‌اند) و این‌جا نیستند.
                </p>
                {!intakeLoaded ? (
                  <div className="text-center py-8 text-gray-400 text-sm">در حال بارگذاری فرم...</div>
                ) : (
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-5">
                    {intakeForm.sections.map((section, sIdx) => (
                      <div key={section.id} className="bg-white rounded-xl border border-gray-100 p-4">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                          <input value={section.title} onChange={e => updateFormSection(sIdx, { title: e.target.value })}
                            placeholder="عنوانِ بخش"
                            className="flex-1 min-w-0 text-sm font-medium text-gray-800 bg-transparent focus:outline-none border-b border-dashed border-transparent hover:border-gray-300 focus:border-brand-400" />
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => moveFormSection(sIdx, -1)} disabled={sIdx === 0}
                              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-20">▲</button>
                            <button onClick={() => moveFormSection(sIdx, 1)} disabled={sIdx === intakeForm.sections.length - 1}
                              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-20">▼</button>
                            <button onClick={async () => { if (await uiConfirm(`بخشِ «${section.title}» با همه‌ی سوال‌هایش حذف شود؟`)) removeFormSection(sIdx) }}
                              className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500">✕</button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {section.fields.map((field, fIdx) => (
                            <div key={field.id}>
                              {/* برچسبِ سوال + نوارِ کوچکِ ابزار */}
                              <div className="flex items-center gap-1.5 mb-1">
                                <input value={field.label} onChange={e => updateFormField(sIdx, fIdx, { label: e.target.value })}
                                  placeholder="متنِ سوال"
                                  className="flex-1 min-w-0 text-xs text-gray-500 bg-transparent focus:outline-none border-b border-dashed border-transparent hover:border-gray-300 focus:border-brand-400" />
                                {field.required && <span className="text-red-400 text-xs shrink-0">*</span>}
                                <select value={field.type} onChange={e => updateFormField(sIdx, fIdx, { type: e.target.value as FormFieldType })}
                                  className="text-[10px] px-1.5 py-1 border border-gray-200 rounded-md bg-white text-gray-500 shrink-0">
                                  <option value="text">متنِ کوتاه</option>
                                  <option value="textarea">متنِ بلند</option>
                                  <option value="select">تک‌گزینه</option>
                                  <option value="multiselect">چندگزینه</option>
                                </select>
                                <button onClick={() => updateFormField(sIdx, fIdx, { required: !field.required })}
                                  title="اجباری/اختیاری"
                                  className={`text-xs shrink-0 w-6 h-6 rounded-md border flex items-center justify-center ${field.required ? 'border-amber-300 text-amber-500 bg-amber-50' : 'border-gray-200 text-gray-300'}`}>*</button>
                                <button onClick={() => moveFormField(sIdx, fIdx, -1)} disabled={fIdx === 0}
                                  className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-20 shrink-0">▲</button>
                                <button onClick={() => moveFormField(sIdx, fIdx, 1)} disabled={fIdx === section.fields.length - 1}
                                  className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-gray-600 disabled:opacity-20 shrink-0">▼</button>
                                <button onClick={() => removeFormField(sIdx, fIdx)}
                                  className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-500 shrink-0">✕</button>
                              </div>

                              {/* نمایشِ زنده — دقیقاً مثلِ چیزی که مراجع می‌بیند */}
                              {field.type === 'text' && (
                                <input disabled placeholder={field.placeholder} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-400" />
                              )}
                              {field.type === 'textarea' && (
                                <textarea disabled rows={2} placeholder={field.placeholder} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 resize-none" />
                              )}
                              {(field.type === 'select' || field.type === 'multiselect') && (
                                <div>
                                  <div className="flex gap-2 flex-wrap mb-1.5">
                                    {(field.options || []).length === 0 && <span className="text-xs text-gray-300">هنوز گزینه‌ای اضافه نشده</span>}
                                    {(field.options || []).map((o, oi) => (
                                      field.type === 'select' ? (
                                        <span key={oi} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-400 bg-white">{o}</span>
                                      ) : (
                                        <span key={oi} className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-400 bg-white">{o}</span>
                                      )
                                    ))}
                                  </div>
                                  <input value={(field.options || []).join('، ')}
                                    onChange={e => updateFormField(sIdx, fIdx, { options: e.target.value.split(/[,،]/).map(s => s.trim()).filter(Boolean) })}
                                    placeholder="گزینه‌ها را با کاما جدا کنید — مثلاً: بله، خیر"
                                    className="w-full text-xs px-2.5 py-1.5 border border-dashed border-gray-300 rounded-lg bg-white focus:outline-none focus:border-brand-400 text-gray-500" />
                                </div>
                              )}
                            </div>
                          ))}
                          <button onClick={() => addFormField(sIdx)}
                            className="w-full text-xs py-2 border border-dashed border-brand-200 text-brand-600 rounded-lg hover:bg-brand-50">+ افزودنِ سوال</button>
                        </div>
                      </div>
                    ))}
                    <button onClick={addFormSection}
                      className="w-full text-sm py-2.5 border border-dashed border-gray-300 text-gray-500 rounded-xl hover:bg-white bg-white/50">+ افزودنِ بخشِ جدید</button>
                  </div>
                )}
              </section>

              {/* نوارِ ذخیره (چسبیده به پایین) */}
              <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 border-t border-gray-100 backdrop-blur">
                <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-end gap-3">
                  {(settingsSaved || profileSaved || intakeSaved) && <span className="text-xs text-brand-600">✓ تنظیمات ذخیره شد</span>}
                  <button onClick={async () => {
                      if (me?.isOwner) await Promise.all([saveSettings(), saveProfile(), saveIntakeForm()])
                      else await Promise.all([saveProfile(), saveIntakeForm()])
                    }}
                    disabled={settingsSaving || profileSaving || intakeSaving}
                    className="px-6 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-800 transition-colors">
                    {(settingsSaving || profileSaving || intakeSaving) ? 'در حال ذخیره...' : '💾 ذخیره‌ی تغییرات'}
                  </button>
                </div>
              </div>
            </>

            )}
          </div>
        )}
      </div>

      {/* ── New Package Modal ──────────────────────────────────────────── */}
      {showNewPackage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" dir="rtl">
            <h2 className="font-semibold text-gray-900 mb-4">تعریف پروتکل درمانی جدید</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">ماه</label>
                  <select value={newPkg.month} onChange={e => setNewPkg({...newPkg, month: e.target.value})}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white">
                    {PERSIAN_MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">سال</label>
                  <input value={newPkg.year} onChange={e => setNewPkg({...newPkg, year: e.target.value})}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" placeholder="1404" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">تعداد جلسه کودک</label>
                  <input type="number" value={newPkg.child_sessions} onChange={e => setNewPkg({...newPkg, child_sessions: parseInt(e.target.value)})}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">نوع جلسه کودک</label>
                  <select value={newPkg.child_session_type} onChange={e => setNewPkg({...newPkg, child_session_type: e.target.value})}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white">
                    <option value="offline">حضوری — ۱,۲۰۰,۰۰۰</option>
                    <option value="online">آنلاین — ۸۵۰,۰۰۰</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">تعداد جلسه والدین</label>
                  <input type="number" value={newPkg.parent_sessions} onChange={e => setNewPkg({...newPkg, parent_sessions: parseInt(e.target.value)})}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">نوع جلسه والدین</label>
                  <select value={newPkg.parent_session_type} onChange={e => setNewPkg({...newPkg, parent_session_type: e.target.value})}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white">
                    <option value="offline">حضوری — ۱,۲۰۰,۰۰۰</option>
                    <option value="online">آنلاین — ۸۵۰,۰۰۰</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">توضیحات پروتکل درمان</label>
                <textarea value={newPkg.notes} onChange={e => setNewPkg({...newPkg, notes: e.target.value})}
                  rows={3} placeholder="پروتکل درمانی، اهداف کلی..."
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none" />
              </div>
              <div className="bg-brand-50 rounded-lg p-3 border border-brand-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">مجموع مبلغ پروتکل درمان:</span>
                  <span className="font-semibold text-brand-600">
                    {((newPkg.child_sessions * (newPkg.child_session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline)) +
                      (newPkg.parent_sessions * (newPkg.parent_session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline))).toLocaleString('en-US')} تومان
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNewPackage(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">انصراف</button>
              <button onClick={createPackage}
                className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium">ثبت پروتکل درمان</button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Session Modal ──────────────────────────────────────────── */}
      {showAddPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => { if (e.target === e.currentTarget) setShowAddPatient(false) }}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-xl" dir="rtl">
            <h2 className="font-semibold text-gray-900 mb-1">افزودنِ پرونده‌ی دستی</h2>
            <p className="text-xs text-gray-400 mb-4">شماره‌ی پرونده خودکار ساخته می‌شود. این پرونده مستقیم در مرحله‌ی درمان قرار می‌گیرد.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">نام کودک <span className="text-red-500">*</span></label>
                <input value={newPatientForm.child_name} onChange={e => setNewPatientForm({ ...newPatientForm, child_name: e.target.value })}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">تاریخ تولد</label>
                  <input value={newPatientForm.birth_date} onChange={e => setNewPatientForm({ ...newPatientForm, birth_date: e.target.value })}
                    placeholder="1395/03/12" className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">پایه‌ی تحصیلی</label>
                  <input value={newPatientForm.grade} onChange={e => setNewPatientForm({ ...newPatientForm, grade: e.target.value })}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">نام پدر</label>
                  <input value={newPatientForm.father_name} onChange={e => setNewPatientForm({ ...newPatientForm, father_name: e.target.value })}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">موبایل پدر</label>
                  <input value={newPatientForm.father_phone} onChange={e => setNewPatientForm({ ...newPatientForm, father_phone: e.target.value })}
                    dir="ltr" placeholder="0912..." className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">نام مادر</label>
                  <input value={newPatientForm.mother_name} onChange={e => setNewPatientForm({ ...newPatientForm, mother_name: e.target.value })}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">موبایل مادر</label>
                  <input value={newPatientForm.mother_phone} onChange={e => setNewPatientForm({ ...newPatientForm, mother_phone: e.target.value })}
                    dir="ltr" placeholder="0912..." className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">شکایت / علتِ مراجعه</label>
                <textarea value={newPatientForm.reason} onChange={e => setNewPatientForm({ ...newPatientForm, reason: e.target.value })}
                  rows={2} className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none" />
              </div>
              <p className="text-[11px] text-gray-400">حداقل یکی از شماره‌های تماس (پدر یا مادر) لازم است تا مراجع بتواند وارد پنل شود.</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddPatient(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">انصراف</button>
              <button onClick={createPatient} disabled={addPatientSaving}
                className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
                {addPatientSaving ? 'در حال ثبت...' : 'ثبت پرونده'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" dir="rtl">
            <h2 className="font-semibold text-gray-900 mb-4">ثبت جلسه جدید</h2>
            <div className="space-y-3">
              {/* نوعِ ثبت: پروتکل درمان یا جلسه‌ی جداگانه */}
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {([[false, '📦 از پروتکل درمان'], [true, '🎯 جلسه‌ی جداگانه']] as const).map(([val, lbl]) => (
                  <button key={String(val)} onClick={() => setNewSess({ ...newSess, standalone: val })}
                    className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${newSess.standalone === val ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'}`}>
                    {lbl}
                  </button>
                ))}
              </div>

              {!newSess.standalone ? (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">پروتکل درمان مربوطه</label>
                  <select value={newSess.package_id} onChange={e => setNewSess({...newSess, package_id: e.target.value})}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white">
                    <option value="">انتخاب پروتکل درمان...</option>
                    {packages.map(p => (
                      <option key={p.id} value={p.id}>{PERSIAN_MONTHS[parseInt(p.month) - 1]} {p.year}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-gray-400 bg-brand-50 border border-brand-100 rounded-lg p-2.5">
                  جلسه‌ی جداگانه به هیچ پروتکل درمانی وصل نیست و مستقیم در پرونده‌ی این مراجع ثبت می‌شود.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">تاریخ</label>
                  <input value={newSess.session_date} onChange={e => setNewSess({...newSess, session_date: e.target.value})}
                    placeholder="1404/04/15" className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">ساعت</label>
                  <input value={newSess.session_time} onChange={e => setNewSess({...newSess, session_time: e.target.value})}
                    placeholder="10:00" className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">نوع جلسه</label>
                  <select value={newSess.session_type} onChange={e => setNewSess({...newSess, session_type: e.target.value})}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white">
                    <option value="offline">🏥 حضوری</option>
                    <option value="online">🎥 آنلاین</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">حضور</label>
                  <select value={newSess.attendee} onChange={e => setNewSess({...newSess, attendee: e.target.value})}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white">
                    <option value="child">👧 کودک</option>
                    <option value="parent">👨‍👩 والدین</option>
                  </select>
                </div>
              </div>
              {newSess.standalone && (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={newSess.paid} onChange={e => setNewSess({ ...newSess, paid: e.target.checked })}
                    className="w-4 h-4 accent-brand-600" />
                  این جلسه پرداخت‌شده است (اگر تیک نزنی، مراجع باید در پنل پرداخت کند)
                </label>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNewSession(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">انصراف</button>
              <button onClick={createSession}
                className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium">ثبت جلسه</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Session Modal ─────────────────────────────────────────── */}
      {editSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-xl" dir="rtl">
            <h2 className="font-semibold text-gray-900 mb-4">ویرایش جلسه — {editSession.session_date}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">اهداف جلسه</label>
                <textarea value={sessForm.session_goals} onChange={e => setSessForm({...sessForm, session_goals: e.target.value})}
                  rows={3} placeholder="اهداف این جلسه را بنویسید..."
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">شرح جلسه</label>
                <textarea value={sessForm.session_summary} onChange={e => setSessForm({...sessForm, session_summary: e.target.value})}
                  rows={4} placeholder="خلاصه و شرح جلسه..."
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">یادداشت خصوصی دکتر</label>
                <textarea value={sessForm.doctor_notes_private} onChange={e => setSessForm({...sessForm, doctor_notes_private: e.target.value})}
                  rows={3} placeholder="یادداشت خصوصی..."
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none bg-red-50 border-red-100" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">یادداشت برای مراجع</label>
                <textarea value={sessForm.doctor_note_for_patient} onChange={e => setSessForm({...sessForm, doctor_note_for_patient: e.target.value})}
                  rows={3} placeholder="پیام یا تکلیف برای مراجع..."
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none bg-blue-50 border-blue-100" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">وضعیت جلسه</label>
                <select value={sessForm.status} onChange={e => setSessForm({...sessForm, status: e.target.value})}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white">
                  <option value="confirmed">تایید شده</option>
                  <option value="completed">برگزار شده</option>
                  <option value="cancelled">کنسل شده</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditSession(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">انصراف</button>
              <button onClick={saveSession}
                className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium">💾 ذخیره</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB: STAFF (کارمندها) — فقط owner می‌بیند
      ════════════════════════════════════════════════════════════════ */}
      {mainTab === 'staff' && me?.isOwner && (
        <div className="max-w-lg mx-auto pb-24">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-1">👥 کارمندها</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              هر نفر یک «منبع» است: پرونده‌ها/برنامه‌ی کاری/پروفایلِ خودش را دارد.
              اگر شماره‌ی موبایل بدهید، آن نفر می‌تواند مستقل با شماره‌ی خودش وارد این پنل شود
              (بدونِ نیاز به شماره‌ی صاحبِ مجموعه).
            </p>
          </div>

          {!staffLoaded ? (
            <div className="text-center py-16 text-gray-400">در حال بارگذاری...</div>
          ) : (
            <div className="space-y-2 mb-4">
              {staffList.map(r => (
                <div key={r.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-3 ${r.is_active ? 'border-gray-100' : 'border-gray-100 opacity-50'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 font-semibold text-sm shrink-0 overflow-hidden">
                      {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" /> : (r.name?.charAt(0) || '?')}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{r.name}{r.title ? ` — ${r.title}` : ''}</div>
                      <div className="text-xs text-gray-400 mt-0.5" dir="ltr">
                        {r.phone ? toFarsiNum(r.phone) : 'بدونِ ورودِ مستقل'}
                        {!r.is_active && <span className="text-red-400"> · غیرفعال</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEditStaffForm(r)}
                      className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">ویرایش</button>
                    {r.is_active && (
                      <button onClick={() => deactivateStaffMember(r.id)}
                        className="text-xs px-2.5 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">غیرفعال</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={openNewStaffForm}
            className="w-full py-2.5 border border-brand-200 text-brand-600 rounded-xl text-sm hover:bg-brand-50">
            ➕ افزودنِ کارمندِ تازه
          </button>

          {staffFormOpen && (
            <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setStaffFormOpen(false)}>
              <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-gray-900 mb-4">{staffForm.id ? 'ویرایشِ کارمند' : 'افزودنِ کارمند'}</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">نام</label>
                    <input value={staffForm.name} onChange={e => setStaffForm(s => ({ ...s, name: e.target.value }))}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">عنوان / تخصص</label>
                    <input value={staffForm.title} onChange={e => setStaffForm(s => ({ ...s, title: e.target.value }))}
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">شماره‌ی موبایل (اختیاری — برای ورودِ مستقل)</label>
                    <input value={staffForm.phone} onChange={e => setStaffForm(s => ({ ...s, phone: e.target.value }))}
                      dir="ltr" placeholder="09xxxxxxxxx"
                      className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setStaffFormOpen(false)}
                    className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500">انصراف</button>
                  <button onClick={saveStaffMember} disabled={staffSaving}
                    className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                    {staffSaving ? 'در حال ذخیره...' : '💾 ذخیره'}
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
      {mainTab === 'patient_settings' && (
        <div className="max-w-3xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-1">تنظیماتِ پنلِ مراجع</h2>
              <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                این‌ها قابلیت‌هایی هستند که مراجع پس از ورود به پنلِ خودش (/{slug}/my) می‌بیند — پیش‌نمایشِ زنده کنارش است.
              </p>
              {!patientFeaturesLoaded ? (
                <div className="text-center py-10 text-gray-400 text-sm">در حال بارگذاری...</div>
              ) : (
                <div className="space-y-4">
                  <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-gray-100 cursor-pointer">
                    <div>
                      <div className="text-sm font-medium text-gray-800">خریدِ جلسه‌ی جایگزین</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">مراجع بتواند پس از سوختنِ یک جلسه، خودش جلسه‌ی جدید بخرد</div>
                    </div>
                    <input type="checkbox" checked={!!patientFeatures.patient_buy_extra_session}
                      onChange={e => togglePatientFeature('patient_buy_extra_session', e.target.checked)}
                      className="w-5 h-5 accent-brand-600 shrink-0" />
                  </label>
                  <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-gray-100 cursor-pointer">
                    <div>
                      <div className="text-sm font-medium text-gray-800">کنسلِ خودکارِ جلسه</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">مراجع بتواند خودش جلسه را کنسل کند (طبقِ قانونِ بازپرداخت)</div>
                    </div>
                    <input type="checkbox" checked={!!patientFeatures.patient_self_cancel}
                      onChange={e => togglePatientFeature('patient_self_cancel', e.target.checked)}
                      className="w-5 h-5 accent-brand-600 shrink-0" />
                  </label>
                </div>
              )}
            </div>

            {/* پیش‌نمایشِ زنده — دقیقاً همان کارتی که مراجع در پنلِ خودش می‌بیند */}
            <div>
              <p className="text-xs text-gray-400 mb-2 px-1">👁 پیش‌نمایشِ زنده</p>
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800">جلسه‌ی ۳</span>
                    <span className="text-xs text-gray-400">۱۴۰۵/۰۴/۱۰ — ۱۶:۰۰ | 🎥 آنلاین</span>
                  </div>
                  {patientFeatures.patient_self_cancel && (
                    <button disabled className="text-xs px-2.5 py-1 border border-red-200 text-red-500 rounded-lg mt-1">کنسل</button>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-800">جلسه‌ی ۲</span>
                    <span className="text-xs text-red-500">سوخت شد — مبلغ برنگشت</span>
                  </div>
                  {patientFeatures.patient_buy_extra_session && (
                    <button disabled className="w-full mt-2 py-2 border border-gray-300 text-gray-600 rounded-xl text-xs">🔄 خریدِ جلسه‌ی جایگزین</button>
                  )}
                </div>
                {!patientFeatures.patient_self_cancel && !patientFeatures.patient_buy_extra_session && (
                  <p className="text-[11px] text-gray-400 text-center py-2">هر دو قابلیت خاموش‌اند — مراجع فقط وضعیت را می‌بیند.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helper field components ──────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, fullWidth }: {
  label: string; value?: string; onChange: (v: string) => void; placeholder?: string; fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400" />
    </div>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value?: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-brand-400">
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
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={rows || 3} placeholder={placeholder}
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-brand-400" />
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
    setOtpSent(true); setDevCode(d.dev_code || '')
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
          <h1 className="text-lg font-bold text-gray-900">ورود به پنلِ مدیریت</h1>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            {mode === 'owner'
              ? 'کدِ ورود به شماره‌ی موبایلِ ثبت‌شده‌ی صاحبِ این مجموعه فرستاده می‌شود.'
              : 'اگر عضوِ تیمِ این مجموعه‌اید، شماره‌ی موبایلِ خودتان را وارد کنید.'}
          </p>
        </div>

        {/* سوییچِ صاحبِ مجموعه / کارمند */}
        <div className="grid grid-cols-2 gap-2 mb-5 p-1 bg-gray-100 rounded-xl">
          <button onClick={() => switchMode('owner')}
            className={`py-2 rounded-lg text-xs font-medium transition-colors ${mode === 'owner' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            صاحبِ مجموعه‌ام
          </button>
          <button onClick={() => switchMode('staff')}
            className={`py-2 rounded-lg text-xs font-medium transition-colors ${mode === 'staff' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            عضوِ تیمم
          </button>
        </div>

        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5 mb-3 text-center">{err}</div>}

        {!otpSent ? (
          <div className="space-y-3">
            {mode === 'staff' && (
              <input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" inputMode="tel" autoFocus
                placeholder="09xxxxxxxxx"
                className="w-full p-3 rounded-xl border border-gray-200 text-center tracking-wide focus:outline-none focus:border-brand-400" />
            )}
            <button onClick={send} disabled={busy || (mode === 'staff' && phone.trim().length < 10)}
              className="w-full py-3 rounded-xl bg-brand-600 text-white font-medium disabled:opacity-50">
              {busy ? 'در حال ارسال…' : 'ارسالِ کدِ ورود'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {devCode && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
                کدِ تست (تا اتصالِ پیامک): <strong className="text-base">{devCode}</strong>
              </div>
            )}
            <input value={code} onChange={e => setCode(e.target.value)} dir="ltr" inputMode="numeric" autoFocus
              placeholder="کد ۴ رقمی"
              className="w-full p-3 rounded-xl border border-gray-200 text-lg text-center tracking-widest focus:outline-none focus:border-brand-400" />
            <button onClick={verify} disabled={busy || code.trim().length < 4}
              className="w-full py-3 rounded-xl bg-brand-600 text-white font-medium disabled:opacity-40">
              ورود
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
