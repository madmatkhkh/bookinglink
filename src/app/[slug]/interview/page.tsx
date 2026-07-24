'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import { toFarsiNum, toLatinNum, getCurrentJalali } from '@/lib/calendar'
import { PSY_PRICING as PRICING, resolvePrice } from '@/lib/psy'
import { usePublicClinic, CardChooser, TermsGate, DiscountCodeField } from '@/components/PsyPublic'
import { onlineAvailable, offlineAvailable, fieldVisible, missingIntakeFields } from '@/lib/psy'
import { usableMeetChannels, mergeMeetChannels } from '@/lib/meet'
import type { PaymentCardInfo, IntakeForm, FormField, PaymentMethods, PublicDoctor, OfficeLocation, SessionMode } from '@/lib/psy'
import { DialogHost, uiAlert, uiConfirm, uiPrompt } from '@/components/ui/Dialog'
import { JalaliDateWheel } from '@/components/WheelPicker'
import { useTenantThemeColor } from '@/lib/useTenantThemeColor'
import SlotPicker, { SlotConfirmResult } from '@/components/SlotPicker'

// ترتیب فلو: اطلاعات → پرداخت. انتخاب نوع جلسه/روش برگزاری روی همان صفحه‌ی پرداخت است
// (مثل StagePayment پنل مراجع)؛ پرونده تا لحظه‌ی پرداخت ساخته نمی‌شود تا نوع/مکان انتخابی درست ذخیره شود.
type Step = 'info' | 'pay' | 'done'

export default function InterviewPage() {
 const { slug } = useParams<{ slug: string }>()
 const today = getCurrentJalali()
 const settings = usePublicClinic(slug)
 useTenantThemeColor(settings.theme_color)
 const [step, setStep] = useState<Step>('info')
 const [selectedDoctorId, setSelectedDoctorId] = useState('')
 const [caseNumber, setCaseNumber] = useState('')
 const [stageId, setStageId] = useState('')
 // نام و شماره‌تماس همیشه ثابت‌اند (برای OTP لازم‌اند)؛ بقیه‌ی سوال‌ها کاملا
 // دیتایی‌اند و از فرم تنظیم‌شده‌ی همین دکتر می‌آیند.
 const [clientName, setClientName] = useState('')
 const [contactPhone, setContactPhone] = useState('')
 // ایمیل اختیاری — برای مراجع خارج از ایران که پیامک ایرانی بهش نمی‌رسد؛
 // اگر پر شود، هم برای ورود جایگزین هم برای یادآوری ایمیلی استفاده می‌شود.
 const [contactEmail, setContactEmail] = useState('')
 const [intakeForm, setIntakeForm] = useState<IntakeForm>({ sections: [] })
 const [intakeLoaded, setIntakeLoaded] = useState(false)
 const [answers, setAnswers] = useState<Record<string, any>>({})
 const setAnswer = (id: string, v: any) => setAnswers(a => ({ ...a, [id]: v }))
 // فرم دراز قدیمی به یک ویزارد چندمرحله‌ای تبدیل شد — مرحله‌ی 0 = مشخصات تماس، بقیه = هر بخش یک صفحه
 const [pageIdx, setPageIdx] = useState(0)


 // اگر فقط یک دکتر بود، خودکار انتخاب شود (بدون نیاز به انتخابگر)؛ اگر چند دکتر
 // بود، مراجع باید صریح انتخاب کند — پیش‌فرض گذاشتن یکی از چند دکتر گمراه‌کننده است.
 useEffect(() => {
  if (!settings.loaded) return
  if (settings.doctors.length === 1) setSelectedDoctorId(settings.doctors[0].id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [settings.loaded, settings.doctors.length])

 const displayDoctor = settings.doctors.find(d => d.id === selectedDoctorId) || settings.doctors[0]
 const needsDoctorPick = settings.doctors.length > 1

 // فرم رزرو همان دکتر را بخوان — وقتی دکتر مشخص شد (تک‌دکترها فورا، چنددکترها بعد انتخاب)
 useEffect(() => {
  if (!settings.loaded) return
  if (needsDoctorPick && !selectedDoctorId) return
  let cancelled = false
  const qs = selectedDoctorId ? `?resource_id=${selectedDoctorId}` : ''
  fetch(`/api/t/${slug}/psy/intake-form${qs}`, { cache: 'no-store' })
   .then(r => r.json())
   .then(d => { if (!cancelled && d.form) setIntakeForm(d.form) })
   .finally(() => { if (!cancelled) setIntakeLoaded(true) })
  return () => { cancelled = true }
 }, [settings.loaded, needsDoctorPick, selectedDoctorId, slug])

 // toggle عمومی برای فیلدهای چندگزینه‌ای — همان رفتار «هیچ‌کدام» منحصربه‌فرد
 function toggleMulti(fieldId: string, option: string) {
  setAnswers(a => {
   const cur: string[] = Array.isArray(a[fieldId]) ? a[fieldId] : []
   if (option === 'هیچ‌کدام') return { ...a, [fieldId]: cur.includes('هیچ‌کدام') ? [] : ['هیچ‌کدام'] }
   const base = cur.filter(x => x !== 'هیچ‌کدام')
   return { ...a, [fieldId]: base.includes(option) ? base.filter(x => x !== option) : [...base, option] }
  })
 }

 // شماره‌ی موبایل ایرانی: دقیقا 11 رقم، با 09 شروع می‌شود (ارقام فارسی هم قبول است)
 function isValidIranPhone(v: string): boolean {
  return /^09\d{9}$/.test(toLatinNum(v).trim())
 }

 function isValidEmailFmt(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
 }

 // اعتبارسنجی: نام/تماس همیشه اجباری + هرچه در فرم این دکتر اجباری علامت خورده
 // (طبق همان تابع مشترکی که سمت سرور هم استفاده می‌شود — فیلدهای مخفی شرطی حساب نمی‌شوند)
 function missingFields(): string[] {
  const miss: string[] = []
  if (!clientName.trim()) miss.push('نام')
  // شماره یا ایمیل — حداقل یکی لازم است (نه لزوما شماره‌ی ایرانی؛ مراجع خارج
  // از ایران با ایمیل ادامه می‌دهد)
  if (!contactPhone.trim() && !contactEmail.trim()) miss.push('شماره تماس یا ایمیل')
  else {
   if (contactPhone.trim() && !isValidIranPhone(contactPhone)) miss.push('شماره تماس (باید 11 رقم و با 09 شروع شود)')
   if (contactEmail.trim() && !isValidEmailFmt(contactEmail)) miss.push('ایمیل (فرمت نامعتبر است)')
  }
  return [...miss, ...missingIntakeFields(intakeForm, answers)]
 }

 // پرونده تا لحظه‌ی پرداخت ساخته نمی‌شود؛ وقتی مراجع روی صفحه‌ی پرداخت نوع جلسه
 // (آنلاین/حضوری) و مکان را انتخاب کرد و پرداخت را شروع کرد، همان‌جا پرونده با همان
 // مقادیر ساخته می‌شود. یک‌بار ساخته می‌شود و caseNumber/stageId کش می‌شوند تا اگر
 // مراجع بین آنلاین/کارت‌به‌کارت جابه‌جا شد یا دوباره تلاش کرد، پرونده‌ی تکراری نسازد.
 async function ensureCase(sessionType: 'online' | 'offline', officeLocation: string): Promise<{ caseNumber: string; stageId: string } | null> {
  if (caseNumber && stageId) return { caseNumber, stageId }
  const miss = missingFields()
  if (miss.length) { uiAlert('لطفا این موارد را کامل کنید:\n• ' + miss.join('\n• ')); return null }
  try {
   const res = await fetch(`/api/t/${slug}/psy/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     clientName, contactPhone, contactEmail: contactEmail.trim() || undefined,
     sessionType, officeLocation: officeLocation || undefined,
     resourceId: selectedDoctorId || undefined, answers,
    })
   })
   const data = await res.json()
   if (data.caseNumber) { setCaseNumber(data.caseNumber); setStageId(data.stageId || ''); return { caseNumber: data.caseNumber, stageId: data.stageId || '' } }
   uiAlert((data.error || 'خطا در ثبت اطلاعات') + (data.detail ? `\n\n(جزئیات فنی برای پشتیبانی: ${data.detail})` : ''))
   return null
  } catch { uiAlert('خطا در ارتباط با سرور'); return null }
 }

 if (step === 'pay') return <InterviewPayScreen
  doctor={displayDoctor} resourceId={displayDoctor?.id} slug={slug} phone={contactPhone}
  cards={settings.cards} loaded={settings.loaded}
  sessionModes={settings.session_modes} officeLocations={settings.office_locations}
  ensureCase={ensureCase} onDone={() => setStep('done')} />

 if (step === 'done') return (
  <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
   <DialogHost />
   <div className="max-w-sm w-full bg-white rounded-2xl border border-sand p-8 text-center">
    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 text-3xl">✅</div>
    <h1 className="text-xl font-display font-medium text-ink mb-2">پرداخت شما ثبت شد!</h1>
    {caseNumber && (
     <div className="bg-sand rounded-xl p-3 mb-4">
      <p className="text-xs text-soot mb-1">شماره پرونده شما</p>
      <p className="text-2xl font-display font-bold text-ink tracking-widest">{caseNumber}</p>
      <p className="text-xs text-soot mt-1">این شماره را نزد خود نگه دارید</p>
     </div>
    )}
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-700">
     پرداخت شما در انتظار <b>تأیید</b> است. پس از تأیید، از پنل مراجع می‌توانید <b>وقت مصاحبه</b> را انتخاب کنید.
    </div>
    <a href={`/${slug}/my`} className="block mt-3 w-full py-3 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors">ورود به پنل مراجع</a>
   </div>
  </div>
 )

 return (
  <div className="min-h-screen bg-canvas py-8 px-4">
   <DialogHost />
   <div className="max-w-lg mx-auto">
    <div className="text-center mb-6">
     <div className="w-24 h-24 rounded-full bg-sand border border-sand flex items-center justify-center mx-auto mb-3 text-3xl overflow-hidden">
      {!settings.loaded
       ? <div className="w-full h-full bg-gray-100 animate-pulse" />
       : displayDoctor?.avatar_url
        ? <img src={displayDoctor.avatar_url} alt={displayDoctor.name} className="w-full h-full object-cover" />
        : ''}
     </div>
     {settings.loaded ? (
      <>
       <h1 className="text-xl font-display font-medium text-ink mb-1">{needsDoctorPick && !selectedDoctorId ? 'مصاحبه‌ی اولیه' : (displayDoctor?.name || settings.doctor_name)}</h1>
       <p className="text-sm text-soot">مصاحبه‌ی اولیه</p>
       <div className="flex gap-2 justify-center mt-3 flex-wrap">
        {(displayDoctor?.badges || settings.badges).map((b, i) => (
         <span key={i} className="text-xs px-3 py-1 bg-white border border-sand rounded-lg text-soot">{b}</span>
        ))}
       </div>
      </>
     ) : (
      <>
       <div className="h-6 w-44 mx-auto bg-gray-100 rounded animate-pulse mb-2" />
       <p className="text-sm text-soot">مصاحبه‌ی اولیه</p>
       <div className="flex gap-2 justify-center mt-3">
        <div className="h-7 w-24 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-7 w-20 bg-gray-100 rounded-lg animate-pulse" />
       </div>
      </>
     )}
    </div>

    <StepBar current={step === 'info' ? 1 : 2} />

    {/* اطلاعات — اولین قدم. صفحه‌ی 0: انتخاب دکتر (اگر چنددکتره) + مشخصات تماس؛ صفحه‌های بعد: بخش‌های فرم همین دکتر، به‌صورت ویزارد چندمرحله‌ای. */}
    {step === 'info' && (() => {
     const visibleSections = intakeForm.sections
      .map(s => ({ ...s, fields: s.fields.filter(f => fieldVisible(f, answers)) }))
      .filter(s => s.fields.length > 0)
     const totalPages = 1 + visibleSections.length
     const safeIdx = Math.min(pageIdx, totalPages - 1)
     const currentSection = safeIdx === 0 ? null : visibleSections[safeIdx - 1]

     function missingOnThisPage(): string[] {
      if (safeIdx === 0) {
       const miss: string[] = []
       // فرم رزرو per-doctor است؛ برای مجموعه‌ی چنددکتره باید همین صفحه دکتر انتخاب شود تا فرم درست بارگذاری شود.
       if (needsDoctorPick && !selectedDoctorId) miss.push('انتخاب دکتر')
       if (!clientName.trim()) miss.push('نام')
       if (!contactPhone.trim() && !contactEmail.trim()) miss.push('شماره تماس یا ایمیل')
       else {
        if (contactPhone.trim() && !isValidIranPhone(contactPhone)) miss.push('شماره تماس (باید 11 رقم و با 09 شروع شود)')
        if (contactEmail.trim() && !isValidEmailFmt(contactEmail)) miss.push('ایمیل (فرمت نامعتبر است)')
       }
       return miss
      }
      if (!currentSection) return []
      const miss: string[] = []
      for (const f of currentSection.fields) {
       const v = answers[f.id]
       const empty = f.type === 'multiselect' ? !Array.isArray(v) || v.length === 0 : !String(v ?? '').trim()
       if (f.required && empty) { miss.push(f.label); continue }
       if (f.type === 'phone' && !empty && !isValidIranPhone(String(v))) miss.push(`${f.label} (فرمت شماره نامعتبر است)`)
       if (f.type === 'email' && !empty && !isValidEmailFmt(String(v))) miss.push(`${f.label} (فرمت ایمیل نامعتبر است)`)
      }
      return miss
     }

     async function goNext() {
      const miss = missingOnThisPage()
      if (miss.length) { uiAlert('لطفا این موارد را کامل کنید:\n• ' + miss.join('\n• ')); return }
      // قبل از ادامه، مطمئن شو همین نام+شماره از قبل ثبت نشده (تا مراجع کل فرم رو الکی پر نکنه)
      if (safeIdx === 0) {
       try {
        const res = await fetch(`/api/t/${slug}/psy/check-existing`, {
         method: 'POST', headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ clientName, phone: contactPhone, email: contactEmail.trim() || undefined }),
        })
        const d = await res.json()
        if (d.exists) { uiAlert('پرونده‌ای با همین نام و شماره‌تماس قبلا ثبت شده است. اگر برای شخص دیگری است، نام را متفاوت وارد کنید.'); return }
       } catch {}
      }
      // آخرین صفحه‌ی اطلاعات → صفحه‌ی پرداخت (نوع جلسه/روش برگزاری همان‌جا انتخاب می‌شود؛ پرونده لحظه‌ی پرداخت ساخته می‌شود)
      if (safeIdx === totalPages - 1) setStep('pay')
      else setPageIdx(safeIdx + 1)
     }
     function goBack() {
      // صفحه‌ی اول اطلاعات → برگشت به صفحه‌ی عمومی مجموعه (جایی که «مصاحبه» را انتخاب کرد)
      if (safeIdx === 0) { window.location.href = `/${slug}`; return }
      setPageIdx(safeIdx - 1)
     }

     // صفحه‌ی 0 (دکتر + مشخصات تماس) به فرم رزرو نیاز ندارد و باید حتی پیش از بارگذاری فرم دیده شود —
     // برای چنددکتره‌ها فرم اصلا تا انتخاب دکتر بارگذاری نمی‌شود. فقط صفحه‌های بخش‌ها منتظر intakeLoaded می‌مانند.
     const waitingForForm = safeIdx > 0 && !intakeLoaded

     return (
      <div className="bg-white rounded-2xl border border-sand p-5 mb-4">
       {waitingForForm ? (
        <div className="text-center py-10 text-soot text-sm">در حال بارگذاری فرم...</div>
       ) : (
        <>
         {/* نوار پیشرفت */}
         <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
           <span className="text-xs text-soot">{safeIdx === 0 ? 'مشخصات تماس' : currentSection?.title}</span>
           <span className="text-[11px] text-soot">{toFarsiNum(safeIdx + 1)} از {toFarsiNum(totalPages)}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
           <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${((safeIdx + 1) / totalPages) * 100}%` }} />
          </div>
         </div>

         {safeIdx === 0 ? (
          <>
           {needsDoctorPick && (
            <div className="mb-5">
             <h2 className="text-base font-medium mb-3 text-ink">با کدام دکتر مصاحبه می‌خواهید؟</h2>
             <div className="grid grid-cols-2 gap-3">
              {settings.doctors.map(d => (
               <div key={d.id} onClick={() => setSelectedDoctorId(d.id)}
                className={`p-3 rounded-xl border cursor-pointer transition-all text-center ${selectedDoctorId === d.id ? 'border-ink border-2 bg-sand' : 'border-sand hover:border-gray-300'}`}>
                <div className="w-12 h-12 rounded-full bg-sand border border-sand flex items-center justify-center mx-auto mb-2 text-xl overflow-hidden">
                 {d.avatar_url ? <img src={d.avatar_url} alt={d.name} className="w-full h-full object-cover" /> : ''}
                </div>
                <div className="font-medium text-ink text-sm">{d.name}</div>
                {d.title && <div className="text-xs text-soot">{d.title}</div>}
               </div>
              ))}
             </div>
            </div>
           )}
           <div className="grid grid-cols-2 gap-3">
            <Field label="نام و نام خانوادگی *" value={clientName} onChange={setClientName} placeholder="آرین رضایی" />
            <Field label="شماره تماس" value={contactPhone} onChange={setContactPhone} placeholder="0912..." dir="ltr" />
            <div className="col-span-2">
             <Field label="ایمیل" value={contactEmail} onChange={setContactEmail} placeholder="example@gmail.com" dir="ltr" />
             <p className="text-[11px] text-soot mt-1">حداقل یکی از شماره یا ایمیل لازم است.</p>
            </div>
           </div>
          </>
         ) : (
          <div className="space-y-3">
           {currentSection?.fields.map(f => (
            <DynamicField key={f.id} field={f} value={answers[f.id]}
             onChange={v => setAnswer(f.id, v)} onToggle={o => toggleMulti(f.id, o)} />
           ))}
          </div>
         )}
        </>
       )}

       <div className="flex gap-2 pt-6">
        <button onClick={goBack} className="px-4 py-3 border border-sand rounded-xl text-sm text-soot hover:bg-gray-50">برگشت</button>
        <button disabled={waitingForForm} onClick={goNext}
         className="flex-1 py-3 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-accent/90 transition-colors">
         {safeIdx === totalPages - 1 ? 'ادامه به پرداخت ←' : 'بعدی ←'}
        </button>
       </div>
      </div>
     )
    })()}
   </div>
  </div>
 )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
 return (
  <div>
   <h3 className="text-sm font-medium text-ink mb-3 pb-2 border-b border-sand">{title}</h3>
   {children}
  </div>
 )
}

function Field({ label, value, onChange, placeholder, dir, textarea }: {
 label: string; value: string; onChange: (v: string) => void;
 placeholder?: string; dir?: string; textarea?: boolean
}) {
 const cls = "w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink"
 return (
  <div>
   {label && <label className="text-xs text-soot mb-1 block">{label}</label>}
   {textarea
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cls + " resize-none"} />
    : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} dir={dir} className={cls} />
   }
  </div>
 )
}

// یک فیلد را طبق نوع تعریف‌شده‌اش (توسط خود دکتر) رندر می‌کند
function DynamicField({ field, value, onChange, onToggle }: {
 field: FormField; value: any; onChange: (v: string) => void; onToggle: (option: string) => void
}) {
 const label = field.label + (field.required ? ' *' : '')
 if (field.type === 'text') return <Field label={label} value={value || ''} onChange={onChange} placeholder={field.placeholder} />
 if (field.type === 'textarea') return <Field label={label} value={value || ''} onChange={onChange} placeholder={field.placeholder} textarea />
 if (field.type === 'date') return (
  <div>
   <label className="text-xs text-soot mb-1 block">{label}</label>
   <JalaliDateWheel value={value || ''} onChange={onChange} placeholder="انتخاب تاریخ تولد" label="تاریخ تولد" yearsBack={90} />
  </div>
 )
 if (field.type === 'phone') return (
  <Field label={label} value={value || ''} onChange={onChange} placeholder="0912..." dir="ltr" />
 )
 if (field.type === 'email') return (
  <Field label={label} value={value || ''} onChange={onChange} placeholder="example@gmail.com" dir="ltr" />
 )
 if (field.type === 'select') return (
  <div>
   <label className="text-xs text-soot mb-1 block">{label}</label>
   <div className="flex gap-2 flex-wrap">
    {(field.options || []).map(o => (
     <button key={o} type="button" onClick={() => onChange(o)}
      className={`px-4 py-1.5 text-sm rounded-lg border ${value === o ? 'bg-accent text-white border-accent' : 'border-sand text-soot'}`}>
      {o}
     </button>
    ))}
   </div>
  </div>
 )
 // multiselect
 const selected: string[] = Array.isArray(value) ? value : []
 return (
  <div>
   <label className="text-xs text-soot mb-1 block">{label}</label>
   <div className="flex flex-wrap gap-2">
    {(field.options || []).map(o => (
     <button key={o} type="button" onClick={() => onToggle(o)}
      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selected.includes(o) ? 'bg-accent text-white border-accent' : 'border-sand text-soot hover:border-gray-300'}`}>
      {o}
     </button>
    ))}
   </div>
  </div>
 )
}

function StepBar({ current }: { current: number }) {
 const steps = ['اطلاعات','پرداخت']
 return (
  <div className="flex items-center mb-6">
   {steps.map((s, i) => {
    const done = current > i + 1
    const active = current === i + 1
    return (
    <div key={s} className="flex items-center flex-1 last:flex-none">
     <div className={`flex items-center gap-1.5 text-xs ${active ? 'text-ink font-medium' : done ? 'text-emerald-600' : 'text-gray-300'}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border
       ${active ? 'border-ink bg-sand text-ink' : done ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-sand text-gray-300'}`}>
       {done ? '✓' : toFarsiNum(i+1)}
      </div>
      <span className="hidden sm:inline">{s}</span>
     </div>
     {i < steps.length-1 && <div className={`flex-1 h-px mx-2 ${current > i + 1 ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
    </div>
   )})}
  </div>
 )
}
// صفحه‌ی پرداخت مصاحبه‌ی اولیه — همه‌چیز در یک صفحه (مثل StagePayment پنل مراجع):
// نوع جلسه (آنلاین/حضوری) + مکان حضوری + روش برگزاری آنلاین + تخفیف + شرایط + پرداخت.
// پرونده تا لحظه‌ی پرداخت ساخته نمی‌شود؛ نوع/مکان انتخاب‌شده در همان ساخت ذخیره می‌شوند.
function InterviewPayScreen({ doctor, resourceId, slug, phone, cards, loaded, sessionModes, officeLocations, ensureCase, onDone }: {
 doctor?: PublicDoctor; resourceId?: string; slug: string; phone: string
 cards: PaymentCardInfo[]; loaded: boolean
 sessionModes: SessionMode; officeLocations: OfficeLocation[]
 ensureCase: (sessionType: 'online' | 'offline', officeLocation: string) => Promise<{ caseNumber: string; stageId: string } | null>
 onDone: () => void
}) {
 const pricing = doctor?.pricing
 // حالت‌های جلسه از session_modes خود متخصص می‌آیند — نه از وجود «مکان حضوری».
 // باگ قبلی: حضوری فقط وقتی نشان داده می‌شد که مجموعه office_location ثبت کرده بود؛
 // مجموعه‌ای که حضوری داشت ولی آدرسی ثبت نکرده بود، اصلا گزینه‌ی حضوری نمی‌دید.
 const modesOnline = onlineAvailable(sessionModes)
 const modesOffline = offlineAvailable(sessionModes)
 const [mode, setMode] = useState<'online' | 'offline'>(modesOffline ? 'offline' : 'online')

 // مکان حضوری (اختیاری) — اگر مجموعه چند مکان دارد، مراجع یکی را انتخاب می‌کند؛
 // اگر یکی یا هیچ، همان پیش‌فرض. مکان‌ها ممکن است با تاخیر برسند.
 const [officeLoc, setOfficeLoc] = useState('')
 useEffect(() => {
  if (!officeLoc && officeLocations.length) setOfficeLoc(officeLocations[0].title)
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [officeLocations.length])

 const baseAmount = resolvePrice(mode, pricing)
 const [discount, setDiscount] = useState<{ code: string; discountedAmount: number; discountAmount: number } | null>(null)
 const finalAmount = discount ? discount.discountedAmount : baseAmount

 // روش‌های آنلاین فعال متخصص — مراجع هنگام پرداخت یکی را انتخاب می‌کند
 const onlineChannels = usableMeetChannels(mergeMeetChannels(doctor?.meet_channels, doctor?.meet_link))
 const [meetChannel, setMeetChannel] = useState<string | null>(null)
 useEffect(() => {
  if (mode === 'online') { if (onlineChannels.length === 1) setMeetChannel(onlineChannels[0].method) }
  else setMeetChannel(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [mode, onlineChannels.length])
 const needsChannel = mode === 'online' && onlineChannels.length > 0 && !meetChannel

 const pm = doctor?.payment_methods
 const onlineOn = !!pm?.online
 const cardOn = pm ? pm.card_to_card : false
 // انتخاب کاربر از پیش‌فرض جدا — تا وقتی دیتای متخصص نرسیده در حالت اشتباه قفل نشود
 const [picked, setPicked] = useState<'online' | 'card' | null>(null)
 const method: 'online' | 'card' = picked ?? (onlineOn ? 'online' : 'card')
 const noMethod = loaded && !onlineOn && !cardOn

 const [termsAccepted, setTermsAccepted] = useState(false)
 const termsBlocked = !!doctor?.terms?.enabled && !termsAccepted
 const [ref, setRef] = useState('')
 const [submitting, setSubmitting] = useState(false)
 const [showSlotPicker, setShowSlotPicker] = useState(false)
 const [onlineError, setOnlineError] = useState('')
 // پرونده یک‌بار ساخته و کش می‌شود — جابه‌جایی بین آنلاین/کارت‌به‌کارت پرونده‌ی تکراری نمی‌سازد
 const [localCase, setLocalCase] = useState<{ caseNumber: string; stageId: string } | null>(null)

 async function ensure(): Promise<{ caseNumber: string; stageId: string } | null> {
  if (localCase) return localCase
  const c = await ensureCase(mode, mode === 'offline' ? officeLoc : '')
  if (c) setLocalCase(c)
  return c
 }

 // کارت‌به‌کارت: اول پرونده ساخته می‌شود، بعد ادعای پرداخت با نوع/کانال انتخابی ثبت می‌شود
 async function submitCard() {
  if (needsChannel) { uiAlert('روش برگزاری جلسه‌ی آنلاین را انتخاب کنید.'); return }
  setSubmitting(true)
  const c = await ensure()
  if (!c) { setSubmitting(false); return }
  try {
   const res = await fetch(`/api/t/${slug}/psy/pay`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     case_number: c.caseNumber, phone, stage_id: c.stageId, payment_ref: ref.trim(),
     discount_code: discount?.code, session_type: mode,
     meet_channel: mode === 'online' ? (meetChannel || undefined) : undefined,
    })
   })
   setSubmitting(false)
   if (res.ok) onDone()
   else uiAlert('ثبت پرداخت ناموفق بود')
  } catch { setSubmitting(false); uiAlert('خطا در ارتباط با سرور') }
 }

 // آنلاین: اول پرونده را بساز، بعد انتخاب‌گر وقت را باز کن (چون «اول وقت، بعد پرداخت»)
 async function openSlotPicker() {
  if (needsChannel) { uiAlert('روش برگزاری جلسه‌ی آنلاین را انتخاب کنید.'); return }
  setOnlineError('')
  const c = await ensure()
  if (!c) return
  setShowSlotPicker(true)
 }

 // پرداخت آنلاین = «اول وقت، بعد پرداخت». وقت انتخابی همراه درخواست می‌رود،
 // سرور اعتبارسنجی‌اش می‌کند و روی intent می‌نشاند؛ بعد از تایید پرداخت، کال‌بک
 // همان وقت را ثبت می‌کند. کارت‌به‌کارت این مسیر را نمی‌رود.
 async function payOnlineWithSlot(date: string, time: string): Promise<SlotConfirmResult> {
  const c = localCase || await ensure()
  if (!c) return { ok: false, error: 'خطا در ثبت اطلاعات' }
  setOnlineError('')
  try {
   const res = await fetch(`/api/t/${slug}/psy/pay-online`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     case_number: c.caseNumber, phone, purpose: 'stage', ref_id: c.stageId,
     session_date: date, session_time: time,
     discount_code: discount?.code, session_type: mode,
     meet_channel: mode === 'online' ? (meetChannel || undefined) : undefined,
    }),
   })
   const data = await res.json().catch(() => ({}))
   if (!res.ok || !data.url) return { ok: false, error: data.error || 'خطا در اتصال به درگاه' }
   window.location.href = data.url
   // redirecting = «مودال را نبند» — بستنش history.back() می‌زند و همین ناوبری را لغو می‌کند
   return { ok: true, redirecting: true }
  } catch {
   return { ok: false, error: 'خطا در ارتباط با سرور' }
  }
 }

 return (
  <div className="min-h-screen bg-canvas flex items-center justify-center p-4" dir="rtl">
   <DialogHost />
   <div className="max-w-sm w-full bg-white rounded-2xl border border-sand p-6 text-right">
    <div className="text-center mb-4">
     <div className="w-16 h-16 rounded-full bg-sand flex items-center justify-center mx-auto mb-3 text-3xl">💳</div>
     <h1 className="text-lg font-display font-medium text-ink">پرداخت هزینه‌ی مصاحبه</h1>
     <p className="text-sm text-soot mt-1">برای ادامه، هزینه‌ی مصاحبه‌ی اولیه را پرداخت کنید.</p>
    </div>

    {/* نوع جلسه — فقط حالت‌هایی که متخصص ارائه می‌دهد */}
    {(modesOnline || modesOffline) && (
     <div className="mb-3">
      <div className="text-xs text-soot mb-1.5 text-center">نوع این جلسه را انتخاب کنید</div>
      <div className={`grid gap-2 p-1 bg-gray-100 rounded-xl ${modesOnline && modesOffline ? 'grid-cols-2' : 'grid-cols-1'}`}>
       {modesOffline && (
        <button onClick={() => { setMode('offline'); setDiscount(null) }}
         className={`py-2 rounded-lg text-xs font-medium transition-colors ${mode === 'offline' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
         🏥 حضوری
        </button>
       )}
       {modesOnline && (
        <button onClick={() => { setMode('online'); setDiscount(null) }}
         className={`py-2 rounded-lg text-xs font-medium transition-colors ${mode === 'online' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
         🎥 آنلاین
        </button>
       )}
      </div>
      {pricing && (
       <div className="mt-1.5 text-center text-[11px] text-soot tnum">
        {mode === 'online' ? pricing.duration_online : pricing.duration_offline} دقیقه
       </div>
      )}
     </div>
    )}

    {/* مکان حضوری — فقط اگر مجموعه بیش از یک مکان دارد */}
    {mode === 'offline' && officeLocations.length > 1 && (
     <div className="mb-3">
      <div className="text-xs text-soot mb-1.5 text-center">محل مراجعه را انتخاب کنید</div>
      <div className="grid grid-cols-2 gap-2">
       {officeLocations.map(l => (
        <button key={l.id} onClick={() => setOfficeLoc(l.title)}
         className={`py-2 rounded-lg text-xs border transition-colors ${officeLoc === l.title ? 'bg-accent text-white border-accent' : 'border-sand text-ink hover:bg-sand'}`}>
         {l.title || 'حضوری'}
        </button>
       ))}
      </div>
     </div>
    )}

    {/* روش برگزاری آنلاین */}
    {mode === 'online' && onlineChannels.length > 0 && (
     <div className="mb-3">
      <div className="text-xs text-soot mb-1.5 text-center">روش برگزاری جلسه‌ی آنلاین را انتخاب کنید</div>
      <div className="grid grid-cols-2 gap-2">
       {onlineChannels.map(ch => (
        <button key={ch.method} onClick={() => setMeetChannel(ch.method)}
         className={`py-2 rounded-lg text-xs border transition-colors ${meetChannel === ch.method ? 'bg-accent text-white border-accent' : 'border-sand text-ink hover:bg-sand'}`}>
         {ch.action}
        </button>
       ))}
      </div>
     </div>
    )}

    <div className="bg-sand border border-sand rounded-xl p-4 mb-3">
     <div className="flex items-center justify-between">
      <span className="text-xs text-soot">مبلغ قابل پرداخت</span>
      <span className="text-base font-bold text-ink">
       {discount && <span className="text-soot line-through text-xs ml-1.5">{baseAmount.toLocaleString()}</span>}
       {finalAmount.toLocaleString()} تومان
      </span>
     </div>
    </div>

    <DiscountCodeField slug={slug} resourceId={resourceId} amount={baseAmount} onApplied={setDiscount} />
    <TermsGate doctor={doctor} accepted={termsAccepted} onAcceptedChange={setTermsAccepted} />

    {!loaded ? (
     <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
    ) : noMethod ? (
     <div className="text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center leading-5">
      هنوز هیچ روش پرداختی برای این متخصص فعال نشده است. لطفا با ایشان تماس بگیرید.
     </div>
    ) : (
     <>
      {onlineOn && cardOn && (
       <div className="grid grid-cols-2 gap-2 mb-3 p-1 bg-gray-100 rounded-xl">
        <button onClick={() => setPicked('online')}
         className={`py-2 rounded-lg text-xs font-medium transition-colors ${method === 'online' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
         پرداخت آنلاین
        </button>
        <button onClick={() => setPicked('card')}
         className={`py-2 rounded-lg text-xs font-medium transition-colors ${method === 'card' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
         کارت‌به‌کارت
        </button>
       </div>
      )}

      {method === 'online' && onlineOn ? (
       <>
        <p className="text-xs text-soot mb-3 text-center">اول وقت خود را انتخاب کنید، سپس پرداخت می‌کنید. به‌محض تایید پرداخت، همان وقت برایتان ثبت می‌شود.</p>
        {onlineError && <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 mb-3 text-center">{onlineError}</div>}
        <button onClick={openSlotPicker} disabled={termsBlocked || needsChannel}
         className="w-full py-3 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-40">
         انتخاب وقت و پرداخت
        </button>
       </>
      ) : (
       <>
        <p className="text-xs text-soot mb-3">مبلغ را کارت‌به‌کارت کنید و سپس «پرداخت کردم» را بزنید.</p>
        <div className="bg-sand border border-sand rounded-xl p-3 mb-3">
         <CardChooser cards={cards} loaded={loaded} />
        </div>
        <label className="text-xs text-soot mb-1 block">متن فیش واریزی <span className="text-red-500">*</span></label>
        <textarea value={ref} onChange={e => setRef(e.target.value)} rows={3} placeholder="اطلاعات فیش واریزی را وارد کنید (کد پیگیری, شماره کارت مبدأ, تاریخ و ساعت واریز...)"
         className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl focus:outline-none focus:border-ink mb-3 resize-none" />
        <button onClick={submitCard} disabled={submitting || !ref.trim() || termsBlocked}
         className="w-full py-3 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-40">
         {submitting ? 'در حال ثبت...' : 'پرداخت کردم'}
        </button>
        <p className="text-[11px] text-soot mt-2 text-center">پس از تأیید پرداخت، از پنل مراجع وقت مصاحبه را می‌گیرید.</p>
       </>
      )}
     </>
    )}

    {showSlotPicker && (
     <SlotPicker phone={phone} caseNumber={localCase?.caseNumber || ''}
      title="انتخاب وقت مصاحبه" confirmLabel="ادامه و پرداخت" resourceId={resourceId}
      sessionType={mode} officeLocation={mode === 'offline' ? officeLoc : undefined}
      onClose={() => setShowSlotPicker(false)}
      onDone={() => setShowSlotPicker(false)}
      onConfirm={payOnlineWithSlot} />
    )}
   </div>
  </div>
 )
}