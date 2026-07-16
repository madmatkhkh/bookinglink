'use client'
// ── ماژول «پرونده‌ها» — ششمین و آخرین تب جداشده از PsychologyAdmin (فاز 4) ───
// بزرگ‌ترین تب پنل: لیست + جستجو، جزئیات پرونده (اطلاعات/پرداخت/پروتکل‌ها/
// جلسات/بالینی)، ویرایش، مرحله‌ی جدید، پروتکل جدید، پرونده‌ی جدید و مودال
// ویرایش جلسه. مرز جداسازی طبق قاعده‌ی ثابت فاز 4:
//   در والد ماند: patients + fetchAll (loader مشترک با داشبورد)، bookings،
//   اکشن‌های تایید/رد پرداخت (مال تب «تأیید پرداخت‌ها» هستند).
//   callback ها: onAppointmentsChanged (به‌جای loadAllSessions والد، بعد از
//   تغییر زمان/وضعیت جلسه تا برنامه و داشبورد تازه بمانند).
// گیت ماژول یادداشت بالینی با mod('clinical_notes') از props می‌آید.
import React, { useState } from 'react'
import { toFarsiNum, getCurrentJalali, PERSIAN_MONTHS } from '@/lib/calendar'
import { uiAlert, uiConfirm, uiPrompt } from '@/components/ui/Dialog'
import { Glyph } from '@/components/Glyph'
import { PRICING } from '@/lib/config'
import { MonthYearWheel, JalaliDateWheel } from '@/components/WheelPicker'
import { useModalBackClose } from '@/lib/useModalBackClose'
import { stageTitle, STAGE_STATUS_LABEL, STAGE_TYPE_LABEL } from '@/lib/flow'
import { IntakeForm, DEFAULT_INTAKE_FORM, LEGACY_DETAIL_LABELS, INTAKE_KNOWN_COLUMNS, fieldVisible, Pricing } from '@/lib/psy'
import { PageHeader, EmptyState, SkeletonRows, enTime, Field, SelectField, TextareaField } from '../shared'
import type { Session, Package, CaseStage, Patient, Booking } from '../../PsychologyAdmin'

// فقط دو فیلدی که این تب از پروفایل مصرف می‌کند (برچسب همراه + قیمت‌ها)
type ProfileBits = { companion_label?: string | null; pricing: Pricing }
type ExtraCharge = {
 id: string; case_number: string; title: string; amount: number
 status: 'awaiting_payment' | 'payment_submitted' | 'paid'
 payment_ref?: string | null; payment_reject_reason?: string | null; created_at: string
}
type Refund = { id: string; case_number: string; amount: number; note?: string | null; created_at: string }
import type { ResourceRow } from '../staff/StaffTab'
import type { ModuleFlags } from '@/lib/moduleManifest'

// برچسب ترکیبی نمایش سریع یک مرحله («مصاحبه: منتظر پرداخت»)
function stageLabel(s?: CaseStage | null): string {
 if (!s) return '—'
 return `${stageTitle(s)}: ${STAGE_STATUS_LABEL[s.status] || s.status}`
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

// کارت جلسه‌ی مصاحبه/ارزیابی در پرونده — یادداشت + تأیید برگزاری
function StageSessionCard({ stage, index, onSave }: {
 stage: CaseStage; index?: number
 onSave: (stageId: string, notes: string, markHeld: boolean) => Promise<void> | void
}) {
 const [val, setVal] = useState(stage.notes || '')
 const [saving, setSaving] = useState(false)
 const label = stageTitle(stage) + (index && index > 1 ? ` #${index}` : '')
 const icon = stage.stage_type === 'interview' ? '🩺' : stage.stage_type === 'assessment' ? '🧩' : '📝'
 const held = !!stage.held
 const canHold = stage.status === 'booked' && !held
 return (
  <div className="bg-white rounded-xl border border-sand p-3">
   <div className="flex items-center justify-between mb-2">
    <div className="flex items-center gap-2">
     <Glyph icon={icon} className="w-5 h-5 shrink-0 text-ink" />
     <div>
      <div className="text-sm font-medium text-ink">{label}</div>
      <div className="text-xs text-soot">{stage.session_date ? `${enTime(stage.session_date)} — ${enTime(stage.session_time)}` : 'زمان ثبت نشده'}</div>
     </div>
    </div>
    <span className={`text-xs px-2 py-0.5 rounded-full ${held ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'}`}>
     {held ? '✅ برگزار شد' : 'برگزار نشده'}
    </span>
   </div>
   <textarea value={val} onChange={e => setVal(e.target.value)} rows={2} placeholder="مطالب و یادداشت این جلسه..."
    className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none focus:outline-none focus:border-ink mb-2" />
   <div className="flex gap-2">
    <button onClick={async () => { setSaving(true); await onSave(stage.id, val, false); setSaving(false) }} disabled={saving}
     className="flex-1 py-2 border border-sand text-soot rounded-lg text-sm disabled:opacity-40">ذخیره یادداشت</button>
    {!held && canHold && (
     <button onClick={async () => { if (!await uiConfirm('تأیید برگزاری این جلسه؟ پرونده برای تعیین مرحله‌ی بعد آزاد می‌شود.')) return; setSaving(true); await onSave(stage.id, val, true); setSaving(false) }} disabled={saving}
      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-40">✅ تایید برگزاری</button>
    )}
   </div>
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

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
 return (
  <div className="mb-5">
   <h3 className="text-xs font-semibold text-soot uppercase tracking-wide mb-2 bg-gray-50 px-3 py-2 rounded-lg flex items-center gap-1.5">
    {icon && <Glyph icon={icon} className="w-4 h-4 shrink-0" />}
    {title}
   </h3>
   <div className="px-1">{children}</div>
  </div>
 )
}

export default function PatientsTab({
 api, patients, fetchAll, bookings, loading, isOwner, profile, staffList,
 viewingResourceId, setViewingResourceId, mod, onAppointmentsChanged,
}: {
 api: (path: string) => string
 patients: Patient[]
 fetchAll: () => Promise<void>
 bookings: Booking[]
 loading: boolean
 isOwner: boolean
 profile: ProfileBits
 staffList: ResourceRow[]
 viewingResourceId: string
 setViewingResourceId: (id: string) => void
 mod: (key: string) => boolean
 onAppointmentsChanged: () => void
}) {
 // ── Patients state ── (خود لیست patients از props می‌آید)
 const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
 const [patientView, setPatientView] = useState<'list' | 'detail' | 'edit'>('list')
 const [patientTab, setPatientTab] = useState<'info' | 'payment' | 'packages' | 'sessions' | 'clinical'>('info')
 const [packages, setPackages] = useState<Package[]>([])
 const [sessions, setSessions] = useState<Session[]>([])
 const [stages, setStages] = useState<CaseStage[]>([])
 const [extraCharges, setExtraCharges] = useState<ExtraCharge[]>([])
 const [refunds, setRefunds] = useState<Refund[]>([])
 const [newChargeTitle, setNewChargeTitle] = useState('')
 const [newChargeAmount, setNewChargeAmount] = useState('')
 const [chargeSaving, setChargeSaving] = useState(false)
 const [newRefundAmount, setNewRefundAmount] = useState('')
 const [newRefundNote, setNewRefundNote] = useState('')
 const [refundSaving, setRefundSaving] = useState(false)
 const [clinicalNotes, setClinicalNotes] = useState<{ id: string; format: string; fields: Record<string, string>; created_at: string; updated_at: string }[]>([])
 const [newNoteFormat, setNewNoteFormat] = useState<'soap' | 'dap' | 'freeform'>('soap')
 const [newNoteFields, setNewNoteFields] = useState<Record<string, string>>({})
 const [savingNote, setSavingNote] = useState(false)
 const [patientSearch, setPatientSearch] = useState('')
 const [showNewPackage, setShowNewPackage] = useState(false)
 const [showNewStage, setShowNewStage] = useState(false)
 const [newStageType, setNewStageType] = useState<'interview' | 'assessment' | 'custom'>('assessment')
 const [newStageTitle, setNewStageTitle] = useState('')
 const [newStageSaving, setNewStageSaving] = useState(false)
 const [showAddPatient, setShowAddPatient] = useState(false)
 const [addPatientSaving, setAddPatientSaving] = useState(false)
 const [newPatientForm, setNewPatientForm] = useState({
  client_name: '', birth_date: '', grade: '', reason: '',
  contact_name: '', contact_phone: '', contact2_name: '', contact2_phone: '',
 })
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
 const [editSession, setEditSession] = useState<Session | null>(null)
 const [editingPatient, setEditingPatient] = useState<Partial<Patient>>({})
 // فرم رزرو فعلی همون دکتر صاحب این پرونده — فقط برای نمایش برچسب درست
 // سوال‌ها (مستقل از تب تنظیمات، که فرم منبع در حال ویرایش را نگه می‌دارد)
 const [patientIntakeForm, setPatientIntakeForm] = useState<IntakeForm>(DEFAULT_INTAKE_FORM)
 const [infoOpenSection, setInfoOpenSection] = useState<string | null>(null)
 const [manualFieldLabel, setManualFieldLabel] = useState('')
 const [manualFieldValue, setManualFieldValue] = useState('')
 const [sessForm, setSessForm] = useState({
  session_goals: '', session_summary: '',
  doctor_notes_private: '', doctor_note_for_patient: '', status: 'confirmed'
 })

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

 useModalBackClose(showNewPackage, () => setShowNewPackage(false))
 useModalBackClose(showNewStage, () => setShowNewStage(false))
 useModalBackClose(showAddPatient, () => setShowAddPatient(false))
 useModalBackClose(!!editSession, () => setEditSession(null))

 async function loadPatientData(case_number: string) {
  const [pkgRes, sessRes, stageRes, chargeRes, refundRes] = await Promise.all([
   fetch(api(`/packages?case_number=${case_number}`), { cache: 'no-store' }),
   fetch(api(`/sessions?case_number=${case_number}`), { cache: 'no-store' }),
   fetch(api(`/stages?case_number=${case_number}`), { cache: 'no-store' }),
   fetch(api(`/extra-charges?case_number=${case_number}`), { cache: 'no-store' }),
   fetch(api(`/refunds?case_number=${case_number}`), { cache: 'no-store' }),
  ])
  const pkgData = await pkgRes.json()
  const sessData = await sessRes.json()
  const stageData = await stageRes.json()
  const chargeData = await chargeRes.json().catch(() => ({}))
  const refundData = await refundRes.json().catch(() => ({}))
  setPackages(pkgData.packages || [])
  setSessions(sessData.sessions || [])
  setStages(stageData.stages || [])
  setExtraCharges(chargeData.extra_charges || [])
  setRefunds(refundData.refunds || [])
 }

 async function createExtraCharge(case_number: string) {
  const title = newChargeTitle.trim()
  const amount = Math.round(Number(newChargeAmount) || 0)
  if (!title) { uiAlert('بابت چه چیزی؟ (توضیح لازم است)'); return }
  if (!(amount > 0)) { uiAlert('مبلغ نامعتبر است'); return }
  setChargeSaving(true)
  const res = await fetch(api('/extra-charges'), {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ case_number, title, amount }),
  })
  const data = await res.json().catch(() => ({}))
  setChargeSaving(false)
  if (!res.ok) { uiAlert(data.error || 'ثبت شارژ اضافه ناموفق بود'); return }
  setNewChargeTitle(''); setNewChargeAmount('')
  await loadPatientData(case_number)
 }

 async function confirmExtraCharge(id: string, case_number: string) {
  const res = await fetch(api('/extra-charges'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id, confirm_payment: true }),
  })
  if (!res.ok) { uiAlert('تایید ناموفق بود'); return }
  await loadPatientData(case_number)
 }

 async function rejectExtraCharge(id: string, case_number: string) {
  const reason = await uiPrompt('دلیل رد پرداخت (اختیاری):', { defaultValue: '' })
  if (reason === null) return
  const res = await fetch(api('/extra-charges'), {
   method: 'PATCH', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id, reject_payment: true, reject_reason: reason }),
  })
  if (!res.ok) { uiAlert('رد ناموفق بود'); return }
  await loadPatientData(case_number)
 }

 async function deleteExtraCharge(id: string, case_number: string) {
  const ok = await uiConfirm('این شارژ اضافه حذف شود؟')
  if (!ok) return
  const res = await fetch(api('/extra-charges'), {
   method: 'DELETE', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { uiAlert(data.error || 'حذف ناموفق بود'); return }
  await loadPatientData(case_number)
 }

 async function createRefund(case_number: string) {
  const amount = Math.round(Number(newRefundAmount) || 0)
  if (!(amount > 0)) { uiAlert('مبلغ نامعتبر است'); return }
  const ok = await uiConfirm(`${amount.toLocaleString('en-US')} تومان به این مراجع بازپرداخت شود؟ این عمل بلافاصله در دفتر حساب ثبت می‌شود.`)
  if (!ok) return
  setRefundSaving(true)
  const res = await fetch(api('/refunds'), {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ case_number, amount, note: newRefundNote.trim() || undefined }),
  })
  const data = await res.json().catch(() => ({}))
  setRefundSaving(false)
  if (!res.ok) { uiAlert(data.error || 'ثبت بازپرداخت ناموفق بود'); return }
  setNewRefundAmount(''); setNewRefundNote('')
  await loadPatientData(case_number)
 }

 async function openPatient(p: Patient) {
  setSelectedPatient(p)
  setPatientView('detail')
  setPatientTab('info')
  setInfoOpenSection(null)
  await Promise.all([loadPatientData(p.case_number), loadPatientIntakeForm((p as any).resource_id), loadClinicalNotes(p.case_number)])
 }

 function closePatientDetail() {
  setPatientView('list')
 }

 async function loadClinicalNotes(case_number: string) {
  try {
   const res = await fetch(api(`/clinical-notes?case_number=${case_number}`), { cache: 'no-store' })
   const data = await res.json()
   setClinicalNotes(data.notes || [])
  } catch {}
 }

 // فرم رزرو صاحب این پرونده رو فقط برای نمایش/برچسب می‌خونه — چیزی رو تو
 // تب تنظیمات دست‌نخورده می‌ذاره
 async function loadPatientIntakeForm(resourceId?: string | null) {
  try {
   const url = resourceId ? api(`/intake-form?resource_id=${resourceId}`) : api('/intake-form')
   const res = await fetch(url, { cache: 'no-store' })
   const data = await res.json().catch(() => ({}))
   setPatientIntakeForm(res.ok && data.form ? data.form : DEFAULT_INTAKE_FORM)
  } catch { setPatientIntakeForm(DEFAULT_INTAKE_FORM) }
 }

 // مقدار فعلی یک فیلد برای این پرونده — یا از ستون واقعی یا از details
 function patientFieldValue(p: Partial<Patient>, fieldId: string): unknown {
  if ((INTAKE_KNOWN_COLUMNS as readonly string[]).includes(fieldId)) return (p as any)[fieldId]
  return (p.details || {})[fieldId]
 }

 // همه‌ی پاسخ‌های این پرونده (ستون‌های واقعی + details) — برای چک showIf
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

 // حذف کامل یک پروتکل درمان (مثلا اگر دکتر اشتباهی ثبتش کرده بود). جلسه‌های
 // این پروتکل حذف نمی‌شوند، فقط از این پروتکل جدا می‌شوند (جلسه‌ی تکی بی‌عنوان).
 async function deletePackage(pkg: Package) {
  if (!await uiConfirm(`پروتکل درمان «${PERSIAN_MONTHS[parseInt(pkg.month) - 1]} ${pkg.year}» برای همیشه حذف شود؟ جلسه‌های ثبت‌شده‌ی این پروتکل حذف نمی‌شوند، فقط از آن جدا می‌مانند.`)) return
  const res = await fetch(api('/packages'), {
   method: 'DELETE', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: pkg.id }),
  })
  if (!res.ok) { uiAlert('حذف ناموفق بود'); return }
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
 }

 // حذف کامل یک پرونده (با تأیید)
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

 // افزودن پرونده‌ی دستی
 async function createPatient() {
  if (!newPatientForm.client_name.trim()) { uiAlert('نام مراجع را وارد کنید'); return }
  if (!newPatientForm.contact_phone.trim() && !newPatientForm.contact2_phone.trim()) { uiAlert('حداقل یک شماره تماس وارد کنید'); return }
  setAddPatientSaving(true)
  try {
   const res = await fetch(api('/cases'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...newPatientForm, ...(isOwner && viewingResourceId ? { resource_id: viewingResourceId } : {}) }),
   })
   const data = await res.json().catch(() => ({}))
   setAddPatientSaving(false)
   if (!res.ok) { uiAlert((data.error || 'ثبت پرونده ناموفق بود') + (data.detail ? `\n\n(جزئیات فنی: ${data.detail})` : '')); return }
   setShowAddPatient(false)
   setNewPatientForm({ client_name: '', birth_date: '', grade: '', reason: '', contact_name: '', contact_phone: '', contact2_name: '', contact2_phone: '' })
   await fetchAll()
   if (data.booking) { setSelectedPatient(data.booking); await Promise.all([loadPatientData(data.booking.case_number), loadPatientIntakeForm(data.booking.resource_id)]); setPatientView('detail') }
  } catch (e: any) {
   setAddPatientSaving(false)
   uiAlert('خطای شبکه: ' + (e?.message || e))
  }
 }

 // تأیید پرداخت کارت‌به‌کارت پروتکل درمان → مراجع می‌تواند روزهای جلسات را انتخاب کند
 async function createStage() {
  if (!selectedPatient) return
  const title = newStageType === 'custom' ? newStageTitle.trim() : ''
  if (newStageType === 'custom' && !title) { uiAlert('عنوان جلسه‌ی دلخواه را بنویسید.'); return }
  setNewStageSaving(true)
  const res = await fetch(api('/stages'), {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ case_number: selectedPatient.case_number, stage_type: newStageType, title }),
  })
  const data = await res.json().catch(() => ({}))
  setNewStageSaving(false)
  if (!res.ok) { uiAlert(data.error || 'ثبت جلسه ناموفق بود'); return }
  setShowNewStage(false)
  setNewStageType('assessment')
  setNewStageTitle('')
  await loadPatientData(selectedPatient.case_number)
  await fetchAll() // current_stage_id در لیست پرونده‌ها هم به‌روز شود
 }

 // تأیید پرداخت جلسه‌ی جایگزین
 async function saveSession() {
  if (!editSession) return
  await fetch(api('/sessions'), {
   method: 'PATCH',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: editSession.id, ...sessForm }),
  })
  setEditSession(null)
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
  onAppointmentsChanged()
 }

 // حذف کامل یک جلسه (مثلا اگر دکتر اشتباهی ثبتش کرده بود)
 async function deleteSession() {
  if (!editSession) return
  if (!await uiConfirm('این جلسه برای همیشه حذف شود؟ این کار بازگشت‌پذیر نیست.')) return
  await fetch(api('/sessions'), {
   method: 'DELETE', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ id: editSession.id }),
  })
  setEditSession(null)
  if (selectedPatient) await loadPatientData(selectedPatient.case_number)
  onAppointmentsChanged()
 }

 // تأیید پرداخت یک مرحله (مصاحبه/ارزیابی) → باز شدن گرفتن وقت
 async function saveClinicalNote() {
  if (!selectedPatient) return
  const hasContent = Object.values(newNoteFields).some(v => v?.trim())
  if (!hasContent) { uiAlert('حداقل یک فیلد را پر کن.'); return }
  setSavingNote(true)
  const res = await fetch(api('/clinical-notes'), {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ case_number: selectedPatient.case_number, format: newNoteFormat, fields: newNoteFields }),
  })
  setSavingNote(false)
  if (!res.ok) { uiAlert('ثبت ناموفق بود'); return }
  setNewNoteFields({})
  await loadClinicalNotes(selectedPatient.case_number)
 }

 async function deleteClinicalNote(id: string) {
  if (!selectedPatient) return
  if (!await uiConfirm('این یادداشت بالینی برای همیشه حذف شود؟')) return
  await fetch(api('/clinical-notes'), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  await loadClinicalNotes(selectedPatient.case_number)
 }

 // ذخیره‌ی یادداشت و/یا تأیید برگزاری یک مرحله — بعد از این، پرونده آزاد می‌شود
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

 // daysInMonth و schedForDay همراه تب به ScheduleTab.tsx رفتند (فاز 4).
 // ── کمک‌توابع برنامه ───────────────────────────────────────────


 // یک ردیف جلسه (هم برای «جلسات تکی» هم برای جلسه‌های زیر هر پروتکل درمان)
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
          <span className="text-amber-600 font-normal">{s.paid ? 'منتظر نوبت‌گیری مراجع' : 'منتظر پرداخت و نوبت‌گیری مراجع'}</span>
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
       پرداخت جایگزین اعلام شد{s.payment_ref ? ` — ${s.payment_ref}` : ''} — تأیید از تب «تأیید پرداخت‌ها»
      </div>
     )}
     {!s.paid && !s.payment_submitted && active && (
      <div className="mt-2 text-xs text-soot" onClick={e => e.stopPropagation()}>در انتظار پرداخت مراجع</div>
     )}
     {s.refund_status === 'pending' && (
      <div className="mt-2 text-xs text-soot" onClick={e => e.stopPropagation()}>
       بازپرداخت {toFarsiNum(s.refund_percent || 50)}٪ — در انتظار واریز (از تب «تأیید پرداخت‌ها» انجام می‌شود)
      </div>
     )}
     {s.refund_status === 'done' && (
      <div className="mt-2 text-xs text-ink" onClick={e => e.stopPropagation()}>بازپرداخت واریز شد{s.refund_ref ? ` — ${s.refund_ref}` : ''}</div>
     )}
    </div>
   )
  })
 }

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

 return (
  <>
     <>
      {/* ── Patient List ─────────────────────────────────────────── */}
      {patientView === 'list' && (
       <div>
        <PageHeader title="پرونده‌ها" desc="پرونده‌ی مراجعان، روند درمان و جلسات هرکدام از همین‌جا مدیریت می‌شود." />
        {/* سوییچر کارمند — فقط owner و فقط وقتی بیش از یک نفر پرسنل هست */}
        {isOwner && staffList.filter(r => r.is_active).length > 1 && (
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
          <svg viewBox="0 0 24 24" className="absolute right-3 top-3 w-4 h-4 text-soot pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
           <circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" />
          </svg>
         </div>
         <button onClick={() => setShowAddPatient(true)}
          className="text-sm px-4 py-2.5 bg-ink text-white rounded-xl hover:bg-ink/90 whitespace-nowrap shrink-0">
          افزودن پرونده
         </button>
        </div>
        {loading ? (
         <SkeletonRows count={5} />
        ) : filteredPatients.length === 0 ? (
         patientSearch.trim() ? (
          <EmptyState icon="📁" title="نتیجه‌ای یافت نشد"
           desc={`برای «${patientSearch.trim()}» پرونده‌ای پیدا نشد — عبارت دیگری را امتحان کنید.`} />
         ) : (
          <EmptyState icon="📁" title="هنوز پرونده‌ای ثبت نشده"
           desc="نخستین پرونده‌ی مراجع خود را بسازید؛ رزروهای آنلاین مراجعان نیز به‌صورت خودکار همین‌جا پرونده می‌سازند."
           action={
            <button onClick={() => setShowAddPatient(true)}
             className="text-sm px-5 py-2.5 bg-ink text-white rounded-xl hover:bg-ink/90">افزودن پرونده</button>
           } />
         )
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
         <button onClick={closePatientDetail}
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
               {st ? stageLabel(st) : 'منتظر تعیین مرحله‌ی بعد'}
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
          ['clinical', '📝', 'یادداشت بالینی'],
         ] as const).map(([k, icon, label]) => (
          <button key={k} onClick={() => setPatientTab(k)}
           className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5 ${
            patientTab === k
             ? 'bg-ink text-white'
             : 'bg-white border border-sand text-soot hover:border-gray-300'
           }`}>
           <Glyph icon={icon} className="w-4 h-4 shrink-0" />{label}
          </button>
         ))}
        </div>

        {/* ── Tab: اطلاعات مراجع ─────────────────────────────── */}
        {patientTab === 'info' && (() => {
         const answers = patientAnswers(selectedPatient)
         const usedKeys = new Set<string>(['client_name', 'contact_phone'])
         return (
          <div className="space-y-2">
           {/* همیشه بالا و باز: مشخصات ثابت (نام/شماره — این‌ها بیرون فرم و برای OTP لازم‌اند) */}
           <div className="bg-white rounded-xl border border-sand p-4">
            <Section title="مشخصات ثابت و نوبت‌دهی" icon="🗓">
             <InfoRow label="نام" value={selectedPatient.client_name} />
             <InfoRow label="شماره‌ی تماس ثابت" value={enTime(selectedPatient.contact_phone)} />
             <InfoRow label="شماره‌ی پرونده" value={selectedPatient.case_number} />
             <InfoRow label="نوع جلسه" value={selectedPatient.session_type === 'online' ? 'آنلاین' : selectedPatient.session_type === 'offline' ? 'حضوری' : selectedPatient.session_type} />
             <InfoRow label="مطب انتخابی" value={(selectedPatient as any).office_location} />
            </Section>
           </div>

           {/* بخش‌های فرم فعلی این دکتر — آکاردئونی، دقیقا طبق سوال‌هایی که همین الان تعریف شده‌اند */}
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

           {/* هرچه در details هست ولی جزو فرم فعلی نیست — فرم عوض‌شده یا یادداشت دستی دکتر */}
           {(() => {
            const leftover = Object.entries((selectedPatient as any).details || {}).filter(([k]) => !usedKeys.has(k))
            if (leftover.length === 0) return null
            const isOpen = infoOpenSection === '__legacy'
            return (
             <div className="bg-white rounded-xl border border-sand overflow-hidden">
              <button onClick={() => setInfoOpenSection(isOpen ? null : '__legacy')}
               className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink">
               <span>سایر / یادداشت‌های دستی</span>
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
        {patientTab === 'payment' && (() => {
         const fmt = (paid?: boolean, sub?: boolean, ref?: string) =>
          paid ? `پرداخت‌شده${ref ? ' — فیش: ' + ref : ''}` : sub ? 'منتظر تأیید' : '—'
         const CHARGE_STATUS_LABEL: Record<string, string> = {
          awaiting_payment: '—', payment_submitted: 'منتظر تأیید', paid: 'پرداخت‌شده',
         }
         const typeCounts: Record<string, number> = {}
         return (
          <div className="space-y-4">
           {/* بخش ۱: پرداختی‌های مراجع */}
           <div className="bg-white rounded-xl border border-sand p-4">
            <Section title="پرداختی‌های مراجع" icon="💳">
             {stages.map(s => {
              typeCounts[s.stage_type] = (typeCounts[s.stage_type] || 0) + 1
              const n = typeCounts[s.stage_type]
              const label = stageTitle(s) + (n > 1 ? ` #${n}` : '')
              return <InfoRow key={s.id} label={label} value={fmt(s.paid, s.payment_submitted, s.payment_ref)} />
             })}
             {packages.map(p => (
              <InfoRow key={p.id} label={`پروتکل درمان ${PERSIAN_MONTHS[parseInt(p.month) - 1]} ${p.year}`}
               value={fmt(p.paid, p.payment_submitted, p.payment_ref)} />
             ))}
             {extraCharges.map(c => (
              <InfoRow key={c.id} label={c.title} value={`${c.amount.toLocaleString('en-US')} ت — ${CHARGE_STATUS_LABEL[c.status]}`} />
             ))}
            </Section>
           </div>

           {/* بخش ۲: بازپرداخت — دکتر به مراجع پرداخت می‌کند (عمل قطعی، همان لحظه) */}
           <div className="bg-white rounded-xl border border-sand p-4">
            <Section title="بازپرداخت" icon="↩️">
             <p className="text-xs text-soot mb-3">وقتی به هر دلیلی مبلغی به این مراجع برمی‌گردانید، همین‌جا ثبت کنید — بلافاصله در دفتر حساب (بازپرداخت) می‌نشیند.</p>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <input type="number" min={0} value={newRefundAmount} onChange={e => setNewRefundAmount(e.target.value)}
               placeholder="مبلغ (تومان)" className="text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
              <input value={newRefundNote} onChange={e => setNewRefundNote(e.target.value)}
               placeholder="یادداشت (اختیاری)" className="text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
             </div>
             <button onClick={() => createRefund(selectedPatient.case_number)} disabled={refundSaving || !newRefundAmount}
              className="px-4 py-2 bg-ink text-white rounded-lg text-xs font-medium disabled:opacity-40">
              {refundSaving ? 'در حال ثبت...' : 'ثبت بازپرداخت'}
             </button>
             {refunds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-sand space-y-1.5">
               {refunds.map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                 <span className="text-soot">{r.note || 'بدون یادداشت'}</span>
                 <span className="font-medium text-ink tnum">{r.amount.toLocaleString('en-US')} ت</span>
                </div>
               ))}
              </div>
             )}
            </Section>
           </div>

           {/* بخش ۳: ارسال لینک پرداخت اضافه — دکتر مبلغی مشخص می‌کند، در پنل مراجع قابل‌پرداخت می‌شود */}
           <div className="bg-white rounded-xl border border-sand p-4">
            <Section title="ارسال لینک پرداخت اضافه" icon="➕">
             <p className="text-xs text-soot mb-3">یک مبلغ دلخواه (مثلا هزینه‌ی دقایق اضافه) بفرستید — در پنل مراجع به‌صورت قابل‌پرداخت (آنلاین یا کارت‌به‌کارت) ظاهر می‌شود.</p>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <input value={newChargeTitle} onChange={e => setNewChargeTitle(e.target.value)}
               placeholder="بابت چه چیزی؟ (مثلا «۱۵ دقیقه اضافه»)" className="text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
              <input type="number" min={0} value={newChargeAmount} onChange={e => setNewChargeAmount(e.target.value)}
               placeholder="مبلغ (تومان)" className="text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
             </div>
             <button onClick={() => createExtraCharge(selectedPatient.case_number)} disabled={chargeSaving || !newChargeTitle.trim() || !newChargeAmount}
              className="px-4 py-2 bg-ink text-white rounded-lg text-xs font-medium disabled:opacity-40">
              {chargeSaving ? 'در حال ارسال...' : 'ارسال به پنل مراجع'}
             </button>
             {extraCharges.length > 0 && (
              <div className="mt-3 pt-3 border-t border-sand space-y-2">
               {extraCharges.map(c => (
                <div key={c.id} className="bg-gray-50 rounded-lg p-3 border border-sand">
                 <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-ink">{c.title}</span>
                  <span className="text-sm font-medium text-ink tnum">{c.amount.toLocaleString('en-US')} ت</span>
                 </div>
                 <div className="flex items-center justify-between">
                  <span className={`text-xs ${c.status === 'paid' ? 'text-emerald-600' : c.status === 'payment_submitted' ? 'text-amber-600' : 'text-soot'}`}>
                   {CHARGE_STATUS_LABEL[c.status]}
                  </span>
                  {c.status === 'payment_submitted' ? (
                   <div className="flex gap-1.5">
                    <button onClick={() => confirmExtraCharge(c.id, selectedPatient.case_number)}
                     className="text-xs px-2 py-1 border border-emerald-500/30 text-emerald-700 rounded-md hover:bg-emerald-500/5">تایید</button>
                    <button onClick={() => rejectExtraCharge(c.id, selectedPatient.case_number)}
                     className="text-xs px-2 py-1 border border-red-500/30 text-red-600 rounded-md hover:bg-red-500/5">رد</button>
                   </div>
                  ) : c.status === 'awaiting_payment' ? (
                   <button onClick={() => deleteExtraCharge(c.id, selectedPatient.case_number)}
                    className="text-xs px-2 py-1 border border-sand text-soot rounded-md hover:bg-gray-100">حذف</button>
                  ) : null}
                 </div>
                 {c.payment_reject_reason && (
                  <p className="text-xs text-red-600 mt-1.5 pt-1.5 border-t border-sand">پرداخت قبلی رد شد — {c.payment_reject_reason}</p>
                 )}
                 {c.payment_ref && c.status === 'payment_submitted' && (
                  <p className="text-xs text-soot mt-1.5 pt-1.5 border-t border-sand whitespace-pre-wrap break-words">فیش: {c.payment_ref}</p>
                 )}
                </div>
               ))}
              </div>
             )}
            </Section>
           </div>
          </div>
         )
        })()}

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
                 مراجع اعلام کرده پرداخت کرده{pkg.payment_ref ? ` — فیش: ${pkg.payment_ref}` : ''} — تأیید از تب «تأیید پرداخت‌ها»
                </div>
               ) : (
                <div className="text-center text-xs text-soot bg-gray-100 rounded-lg py-2 border border-sand">منتظر پرداخت مراجع</div>
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
          {/* مراحل پیش‌ازدرمان (مصاحبه/ارزیابی) — هر تعداد، به هر ترتیب */}
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

          {/* تنها راه دادن جلسه‌ی تازه به مراجع. قبلا این‌جا دو دکمه بود
             («افزودن مرحله» و «ثبت جلسه‌ی تکی») که هر دو یک کار را با رفتار
             متفاوت انجام می‌دادند و مدام با هم اشتباه گرفته می‌شدند؛ حالا یکی
             است و همیشه روی psy_stages می‌نشیند، یعنی همیشه پنل مراجع را برای
             پرداخت و گرفتن وقت باز می‌کند. وقتی جلسه‌ی بازی در جریان است دکمه
             غیرفعال می‌شود (نه ناپدید) تا معلوم باشد چرا نمی‌شود جلسه‌ی تازه داد. */}
          {!selectedPatient?.current_stage_id ? (
           <button onClick={() => setShowNewStage(true)}
            className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium hover:bg-ink/90 mb-4 transition-colors">
            + افزودن جلسه‌ی جدید
           </button>
          ) : (
           <div className="w-full py-3 border-2 border-dashed border-sand rounded-xl text-xs text-soot text-center mb-4 px-3 leading-relaxed">
            یک جلسه‌ی باز در جریان است — تا وقتی برگزار (یا لغو) نشود، جلسه‌ی تازه‌ای نمی‌شود داد.
           </div>
          )}

          {/* جلسه‌های تکی قدیمی (قبل از یکی‌شدن مسیرها ثبت شده‌اند) — دیگر ساخته
             نمی‌شوند ولی باید همان‌طور که بودند دیده شوند. برای پرونده‌های تازه
             این فهرست خالی است و اصلا رندر نمی‌شود. */}
          {sessions.some(s => !s.package_id) && (
           <>
            <div className="text-xs text-soot mb-2 px-1">جلسه‌های تکی (ثبت‌شده پیش از یکی‌شدن مسیر افزودن جلسه)</div>
            <div className="space-y-2">
             {renderSessionList(sessions.filter(s => !s.package_id))}
            </div>
           </>
          )}
         </div>
        )}

        {/* یادداشت بالینی ساختاریافته — کاملا خصوصی، هرگز به مراجع نمایش داده نمی‌شود */}
        {patientTab === 'clinical' && (
         <div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-700 mb-4">
           🔒 این یادداشت‌ها فقط برای خودتان است — هیچ‌وقت در پنل مراجع نمایش داده نمی‌شود.
          </div>

          <div className="bg-white rounded-xl border border-sand p-4 mb-4">
           <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-3">
            {(['soap', 'dap', 'freeform'] as const).map(f => (
             <button key={f} onClick={() => { setNewNoteFormat(f); setNewNoteFields({}) }}
              className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${newNoteFormat === f ? 'bg-white text-ink shadow-sm' : 'text-soot'}`}>
              {f === 'soap' ? 'SOAP' : f === 'dap' ? 'DAP' : 'آزاد'}
             </button>
            ))}
           </div>
           <div className="space-y-2">
            {(newNoteFormat === 'soap'
              ? [['subjective', 'Subjective — گفته‌ی مراجع'], ['objective', 'Objective — مشاهده‌ی دکتر'], ['assessment', 'Assessment — ارزیابی/تشخیص'], ['plan', 'Plan — برنامه‌ی ادامه']]
              : newNoteFormat === 'dap'
              ? [['data', 'Data — شرح جلسه'], ['assessment', 'Assessment — ارزیابی/تشخیص'], ['plan', 'Plan — برنامه‌ی ادامه']]
              : [['note', 'یادداشت آزاد']]
            ).map(([key, label]) => (
             <div key={key}>
              <label className="text-xs text-soot mb-1 block">{label}</label>
              <textarea value={newNoteFields[key] || ''} onChange={e => setNewNoteFields(f => ({ ...f, [key]: e.target.value }))}
               rows={key === 'note' ? 6 : 2}
               className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink resize-none" />
             </div>
            ))}
           </div>
           <button onClick={saveClinicalNote} disabled={savingNote}
            className="w-full mt-3 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
            {savingNote ? 'در حال ثبت...' : '+ ثبت یادداشت تازه'}
           </button>
          </div>

          <div className="space-y-2">
           {clinicalNotes.length === 0 ? (
            <div className="text-center py-8 text-soot text-sm">هنوز یادداشتی ثبت نشده.</div>
           ) : clinicalNotes.map(n => (
            <div key={n.id} className="bg-white rounded-xl border border-sand p-4">
             <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-ink bg-gray-100 px-2 py-0.5 rounded">{n.format.toUpperCase()}</span>
              <div className="flex items-center gap-2">
               <span className="text-[11px] text-soot">{new Date(n.created_at).toLocaleDateString('fa-IR')}</span>
               <button onClick={() => deleteClinicalNote(n.id)} className="text-xs text-red-500 hover:text-red-700">حذف</button>
              </div>
             </div>
             <div className="space-y-1.5">
              {Object.entries(n.fields).filter(([, v]) => v).map(([key, value]) => (
               <div key={key} className="text-sm text-ink">
                <span className="text-xs text-soot block">{key === 'subjective' ? 'Subjective' : key === 'objective' ? 'Objective' : key === 'assessment' ? 'Assessment' : key === 'plan' ? 'Plan' : key === 'data' ? 'Data' : ''}</span>
                {value}
               </div>
              ))}
             </div>
            </div>
           ))}
          </div>
         </div>
        )}
       </div>
      )}

      {/* ── Modal: افزودن جلسه‌ی تازه ──────────────────────────────── */}
      {showNewStage && (
       <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-xl" dir="rtl">
         <h2 className="font-display font-semibold text-ink mb-1">افزودن جلسه‌ی جدید</h2>
         <p className="text-xs text-soot mb-4">
          هر نوع جلسه‌ای که لازم می‌دانید. مراجع در پنل خودش این جلسه را می‌بیند: اول هزینه‌اش را پرداخت می‌کند، بعد وقتش را انتخاب می‌کند.
         </p>
         <label className="text-xs text-soot mb-1 block">عنوان جلسه</label>
         <div className="flex bg-gray-100 rounded-xl p-1 gap-1 mb-3">
          {(['interview', 'assessment', 'custom'] as const).map(t => (
           <button key={t} onClick={() => setNewStageType(t)}
            className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${newStageType === t ? 'bg-white text-ink shadow-sm' : 'text-soot'}`}>
            {t === 'custom' ? 'دلخواه' : STAGE_TYPE_LABEL[t]}
           </button>
          ))}
         </div>
         {newStageType === 'custom' && (
          <input value={newStageTitle} onChange={e => setNewStageTitle(e.target.value)}
           placeholder="مثلا: جلسه‌ی مشاوره‌ی خانواده"
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg mb-3 focus:outline-none focus:border-ink" />
         )}
         <div className="flex gap-2">
          <button onClick={() => setShowNewStage(false)} className="flex-1 py-2.5 border border-sand text-soot rounded-xl text-sm">انصراف</button>
          <button onClick={createStage} disabled={newStageSaving || (newStageType === 'custom' && !newStageTitle.trim())}
           className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
           {newStageSaving ? 'در حال ثبت...' : 'ثبت'}
          </button>
         </div>
        </div>
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
          {/* مشخصات ثابت — بیرون فرم، همیشه باز */}
          <div className="bg-white rounded-xl border border-sand p-4">
           <h3 className="text-sm font-semibold text-ink mb-3 pb-2 border-b border-sand">مشخصات ثابت و نوبت‌دهی</h3>
           <div className="grid grid-cols-2 gap-3">
            <Field label="نام *" value={editingPatient.client_name} onChange={v => setEditingPatient(p => ({ ...p, client_name: v }))} />
            <Field label="شماره‌ی تماس ثابت *" value={editingPatient.contact_phone} onChange={v => setEditingPatient(p => ({ ...p, contact_phone: v }))} placeholder="09xxxxxxxxx" />
           </div>
           <div className="mt-3">
            <SelectField label="نوع جلسه" value={editingPatient.session_type} onChange={v => setEditingPatient(p => ({ ...p, session_type: v } as any))} options={['offline', 'online']} />
           </div>
          </div>

          {/* بخش‌های فرم فعلی — آکاردئونی، همون سکشنی که تو نمای مشاهده باز بود */}
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

          {/* سایر/دستی — شامل کلیدهای قدیمی + امکان افزودن یادداشت تازه */}
          <div className="bg-white rounded-xl border border-sand p-4">
           <h3 className="text-sm font-semibold text-ink mb-3 pb-2 border-b border-sand">سایر / یادداشت‌های دستی</h3>
           <div className="space-y-3">
            {Object.entries(editingPatient.details || {}).filter(([k]) => !usedKeys.has(k)).map(([key, value]) => (
             <TextareaField key={key} label={detailFieldLabel(key)} value={formatDetailValue(value)} rows={2}
              onChange={v => setEditingPatient(p => ({ ...p, details: { ...(p.details || {}), [key]: v } }))} />
            ))}
            <div className="pt-2 border-t border-sand flex gap-2 items-end">
             <div className="flex-1">
              <Field label="عنوان یادداشت تازه" value={manualFieldLabel} onChange={setManualFieldLabel} placeholder="مثلا: نگرانی ویژه" />
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
   {showNewPackage && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
     <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-xl" dir="rtl">
      <h2 className="font-display font-semibold text-ink mb-4">تعریف پروتکل درمانی جدید</h2>
      <div className="space-y-3">
       <div>
        <label className="text-xs text-soot mb-1.5 block text-center">ماه/سال شروع پروتکل</label>
        <MonthYearWheel month={parseInt(newPkg.month)} year={parseInt(newPkg.year)}
         onChange={(m, y) => setNewPkg({ ...newPkg, month: String(m), year: String(y) })} />
       </div>
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">تعداد جلسه‌ی مراجع</label>
         <input type="number" value={newPkg.primary_sessions} onChange={e => setNewPkg({...newPkg, primary_sessions: parseInt(e.target.value)})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">نوع جلسه‌ی مراجع</label>
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
         <label className="text-xs text-soot mb-1 block">تعداد جلسه‌ی {profile.companion_label || 'همراه'}</label>
         <input type="number" value={newPkg.secondary_sessions} onChange={e => setNewPkg({...newPkg, secondary_sessions: parseInt(e.target.value)})}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">نوع جلسه‌ی {profile.companion_label || 'همراه'}</label>
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
      <h2 className="font-display font-semibold text-ink mb-1">افزودن پرونده‌ی دستی</h2>
      <p className="text-xs text-soot mb-4">شماره‌ی پرونده خودکار ساخته می‌شود. این پرونده مستقیم در مرحله‌ی درمان قرار می‌گیرد.</p>
      <div className="space-y-3">
       <div>
        <label className="text-xs text-soot mb-1 block">نام مراجع <span className="text-ink">*</span></label>
        <input value={newPatientForm.client_name} onChange={e => setNewPatientForm({ ...newPatientForm, client_name: e.target.value })}
         className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
       </div>
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">تاریخ تولد</label>
         <JalaliDateWheel value={newPatientForm.birth_date} onChange={v => setNewPatientForm({ ...newPatientForm, birth_date: v })}
          label="تاریخ تولد" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">پایه‌ی تحصیلی (اختیاری)</label>
         <input value={newPatientForm.grade} onChange={e => setNewPatientForm({ ...newPatientForm, grade: e.target.value })}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
       </div>
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">نام تماس</label>
         <input value={newPatientForm.contact_name} onChange={e => setNewPatientForm({ ...newPatientForm, contact_name: e.target.value })}
          placeholder="اگر با خود مراجع فرق دارد" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">موبایل تماس</label>
         <input value={newPatientForm.contact_phone} onChange={e => setNewPatientForm({ ...newPatientForm, contact_phone: e.target.value })}
          dir="ltr" placeholder="0912..." className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
       </div>
       <div className="grid grid-cols-2 gap-3">
        <div>
         <label className="text-xs text-soot mb-1 block">نام {profile.companion_label || 'همراه'} (اختیاری)</label>
         <input value={newPatientForm.contact2_name} onChange={e => setNewPatientForm({ ...newPatientForm, contact2_name: e.target.value })}
          className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div>
         <label className="text-xs text-soot mb-1 block">موبایل {profile.companion_label || 'همراه'}</label>
         <input value={newPatientForm.contact2_phone} onChange={e => setNewPatientForm({ ...newPatientForm, contact2_phone: e.target.value })}
          dir="ltr" placeholder="0912..." className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
       </div>
       <div>
        <label className="text-xs text-soot mb-1 block">شکایت / علت مراجعه</label>
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


   {/* ── Edit Session Modal ─────────────────────────────────────────── */}
   {editSession && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
     <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-xl" dir="rtl">
      <h2 className="font-display font-semibold text-ink mb-4">ویرایش جلسه — {editSession.title || editSession.session_date || 'بدون عنوان'}</h2>
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
  </>
 )
}
