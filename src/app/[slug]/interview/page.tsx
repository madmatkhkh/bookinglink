'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import { PERSIAN_MONTHS, PERSIAN_WEEKDAYS, toFarsiNum, toLatinNum, getCurrentJalali, getDaysInJalaliMonth, jalaliWeekday } from '@/lib/calendar'
import { PSY_PRICING as PRICING } from '@/lib/psy'
import { usePublicClinic, CardChooser } from '@/components/PsyPublic'
import { onlineAvailable, offlineAvailable, fieldVisible, missingIntakeFields } from '@/lib/psy'
import type { PaymentCardInfo, IntakeForm, FormField, PaymentMethods } from '@/lib/psy'
import { DialogHost, uiAlert, uiConfirm, uiPrompt } from '@/components/ui/Dialog'

type Step = 1 | 3 | 'pay' | 'done'

export default function InterviewPage() {
 const { slug } = useParams<{ slug: string }>()
 const today = getCurrentJalali()
 const settings = usePublicClinic(slug)
 const [step, setStep] = useState<Step>(1)
 const [selectedDoctorId, setSelectedDoctorId] = useState('')
 const [sessionType, setSessionType] = useState<'online'|'offline'|''>('')
 const [officeLoc, setOfficeLoc] = useState('')  // عنوانِ مکانِ حضوریِ انتخاب‌شده
 const [selKey, setSelKey] = useState('')     // کلیدِ گزینه‌ی انتخاب‌شده (برای های‌لایت)
 const [loading, setLoading] = useState(false)
 const [caseNumber, setCaseNumber] = useState('')
 const [stageId, setStageId] = useState('')
 // نام و شماره‌تماس همیشه ثابت‌اند (برای OTP لازم‌اند)؛ بقیه‌ی سوال‌ها کاملاً
 // دیتایی‌اند و از فرمِ تنظیم‌شده‌ی همین دکتر می‌آیند.
 const [childName, setChildName] = useState('')
 const [fatherPhone, setFatherPhone] = useState('')
 const [intakeForm, setIntakeForm] = useState<IntakeForm>({ sections: [] })
 const [intakeLoaded, setIntakeLoaded] = useState(false)
 const [answers, setAnswers] = useState<Record<string, any>>({})
 const setAnswer = (id: string, v: any) => setAnswers(a => ({ ...a, [id]: v }))
 // فرمِ درازِ قدیمی به یک ویزاردِ چندمرحله‌ای تبدیل شد — مرحله‌ی 0 = مشخصاتِ تماس، بقیه = هر بخش یک صفحه
 const [pageIdx, setPageIdx] = useState(0)


 // گزینه‌های نوعِ جلسه: آنلاین (در صورتِ فعال‌بودن) + یک کارت به‌ازای هر مکانِ حضوری
 const sessionOptions = useMemo(() => {
  const opts: { key: string; type: 'online' | 'offline'; loc: string; icon: string; label: string; desc: string; price: string }[] = []
  if (onlineAvailable(settings.session_modes)) {
   opts.push({ key: 'online', type: 'online', loc: '', icon: '', label: 'آنلاین', desc: 'تماس تصویری', price: '850,000' })
  }
  if (offlineAvailable(settings.session_modes)) {
   for (const l of settings.office_locations) {
    opts.push({ key: `offline:${l.id}`, type: 'offline', loc: l.title, icon: '', label: l.title || 'حضوری', desc: l.address || 'جلسه‌ی حضوری', price: '1,200,000' })
   }
  }
  return opts
 }, [settings.session_modes, settings.office_locations])

 // اگر فقط یک دکتر بود، خودکار انتخاب شود (بدونِ نیاز به انتخابگر)؛ اگر چند دکتر
 // بود، مراجع باید صریح انتخاب کند — پیشِ‌فرض گذاشتنِ یکی از چند دکتر گمراه‌کننده است.
 useEffect(() => {
  if (!settings.loaded) return
  if (settings.doctors.length === 1) setSelectedDoctorId(settings.doctors[0].id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [settings.loaded, settings.doctors.length])

 const displayDoctor = settings.doctors.find(d => d.id === selectedDoctorId) || settings.doctors[0]
 const needsDoctorPick = settings.doctors.length > 1

 // فرمِ رزروِ همان دکتر را بخوان — وقتی دکتر مشخص شد (تک‌دکترها فوراً، چنددکترها بعدِ انتخاب)
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

 useEffect(() => {
  if (!settings.loaded) return
  if (sessionOptions.length === 1) {
   const o = sessionOptions[0]
   setSelKey(o.key); setSessionType(o.type); setOfficeLoc(o.loc)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [settings.loaded, sessionOptions])

 // toggle عمومی برای فیلدهای چندگزینه‌ای — همان رفتارِ «هیچ‌کدام» منحصربه‌فرد
 function toggleMulti(fieldId: string, option: string) {
  setAnswers(a => {
   const cur: string[] = Array.isArray(a[fieldId]) ? a[fieldId] : []
   if (option === 'هیچ‌کدام') return { ...a, [fieldId]: cur.includes('هیچ‌کدام') ? [] : ['هیچ‌کدام'] }
   const base = cur.filter(x => x !== 'هیچ‌کدام')
   return { ...a, [fieldId]: base.includes(option) ? base.filter(x => x !== option) : [...base, option] }
  })
 }

 // شماره‌ی موبایلِ ایرانی: دقیقاً 11 رقم، با 09 شروع می‌شود (ارقامِ فارسی هم قبول است)
 function isValidIranPhone(v: string): boolean {
  return /^09\d{9}$/.test(toLatinNum(v).trim())
 }

 // اعتبارسنجی: نام/تماس همیشه اجباری + هرچه در فرمِ این دکتر اجباری علامت خورده
 // (طبقِ همان تابعِ مشترکی که سمتِ سرور هم استفاده می‌شود — فیلدهای مخفیِ شرطی حساب نمی‌شوند)
 function missingFields(): string[] {
  const miss: string[] = []
  if (!childName.trim()) miss.push('نام')
  if (!fatherPhone.trim()) miss.push('شماره تماس')
  else if (!isValidIranPhone(fatherPhone)) miss.push('شماره تماس (باید 11 رقم و با 09 شروع شود)')
  return [...miss, ...missingIntakeFields(intakeForm, answers)]
 }

 async function handleSubmit() {
  const miss = missingFields()
  if (miss.length) {
   uiAlert('لطفاً این موارد را کامل کنید:\n• ' + miss.join('\n• '))
   return
  }
  setLoading(true)
  try {
   const res = await fetch(`/api/t/${slug}/psy/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     childName, fatherPhone, sessionType, officeLocation: officeLoc,
     resourceId: selectedDoctorId || undefined, answers,
    })
   })
   const data = await res.json()
   if (data.caseNumber) { setCaseNumber(data.caseNumber); setStageId(data.stageId || ''); setStep('pay') }
   else uiAlert((data.error || 'خطا در ثبت اطلاعات') + (data.detail ? `\n\n(جزئیاتِ فنی برای پشتیبانی: ${data.detail})` : ''))
  } catch { uiAlert('خطا در ارتباط با سرور') }
  setLoading(false)
 }

 // پرداختِ کارت‌به‌کارتِ مصاحبه (پس از ثبت فرم)
 async function submitInterviewPayment(ref: string, discountCode?: string) {
  setLoading(true)
  try {
   const res = await fetch(`/api/t/${slug}/psy/pay`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_number: caseNumber, phone: fatherPhone, stage_id: stageId, payment_ref: ref, discount_code: discountCode || undefined })
   })
   if (res.ok) setStep('done')
   else uiAlert('ثبتِ پرداخت ناموفق بود')
  } catch { uiAlert('خطا در ارتباط با سرور') }
  setLoading(false)
 }

 if (step === 'pay') return <InterviewPayScreen amount={sessionType === 'online' ? (displayDoctor?.pricing.online ?? PRICING.online) : (displayDoctor?.pricing.offline ?? PRICING.offline)} cards={settings.cards} loaded={settings.loaded} loading={loading}
  onPay={submitInterviewPayment} paymentMethods={displayDoctor?.payment_methods} slug={slug} caseNumber={caseNumber} phone={fatherPhone} stageId={stageId} resourceId={displayDoctor?.id} />

 if (step === 'done') return (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
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
     پرداختِ شما در انتظار <b>تأیید</b> است. پس از تأیید، از پنل مراجع می‌توانید <b>وقتِ مصاحبه</b> را انتخاب کنید.
    </div>
    <a href={`/${slug}/my`} className="block mt-3 w-full py-3 bg-ink text-white rounded-xl text-sm font-medium hover:bg-ink/90 transition-colors">ورود به پنل مراجع</a>
   </div>
  </div>
 )

 return (
  <div className="min-h-screen bg-gray-50 py-8 px-4">
   <DialogHost />
   <div className="max-w-lg mx-auto">
    <div className="text-center mb-6">
     <div className="w-16 h-16 rounded-full bg-sand border border-sand flex items-center justify-center mx-auto mb-3 text-2xl overflow-hidden">
      {!settings.loaded
       ? <div className="w-full h-full bg-gray-100 animate-pulse" />
       : displayDoctor?.avatar_url
        ? <img src={displayDoctor.avatar_url} alt={displayDoctor.name} className="w-full h-full object-cover" />
        : ''}
     </div>
     {settings.loaded ? (
      <>
       <h1 className="text-xl font-display font-medium text-ink mb-1">{needsDoctorPick && !selectedDoctorId ? 'مصاحبه‌ی اولیه' : (displayDoctor?.name || settings.doctor_name)}</h1>
       <p className="text-sm text-soot">مصاحبه‌ی اولیه با والدین</p>
       <div className="flex gap-2 justify-center mt-3 flex-wrap">
        {(displayDoctor?.badges || settings.badges).map((b, i) => (
         <span key={i} className="text-xs px-3 py-1 bg-white border border-sand rounded-lg text-soot">{b}</span>
        ))}
       </div>
      </>
     ) : (
      <>
       <div className="h-6 w-44 mx-auto bg-gray-100 rounded animate-pulse mb-2" />
       <p className="text-sm text-soot">مصاحبه‌ی اولیه با والدین</p>
       <div className="flex gap-2 justify-center mt-3">
        <div className="h-7 w-24 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-7 w-20 bg-gray-100 rounded-lg animate-pulse" />
       </div>
      </>
     )}
    </div>

    <StepBar current={step === 1 ? 1 : step === 3 ? 2 : 3} />

    {/* Step 1 */}
    {step === 1 && (
     <div className="bg-white rounded-2xl border border-sand p-5 mb-4">
      {!settings.loaded ? (
       <div className="text-center py-10 text-soot text-sm">در حال بارگذاری...</div>
      ) : (
       <>
        {needsDoctorPick && (
         <div className="mb-5">
          <h2 className="text-base font-medium mb-4 text-ink">با کدام دکتر مصاحبه می‌خواهید؟</h2>
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
        <h2 className="text-base font-medium mb-4 text-ink">نوع جلسه را انتخاب کنید</h2>
        <div className={`grid gap-3 mb-5 ${sessionOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
         {sessionOptions.map(o => {
          const sel = selKey === o.key
          const tint = o.type === 'online' ? 'border-sky-500 bg-sky-500/5' : 'border-emerald-500 bg-emerald-500/5'
          return (
           <div key={o.key} onClick={() => { setSelKey(o.key); setSessionType(o.type); setOfficeLoc(o.loc) }}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${sel ? `${tint} border-2` : 'border-sand hover:border-gray-300'}`}>
            <div className="text-2xl mb-2">{o.icon}</div>
            <div className="font-medium text-ink text-sm">{o.label}</div>
            <div className="text-xs text-soot mb-2">{o.desc}</div>
            <div className={`text-sm font-medium ${sel ? (o.type === 'online' ? 'text-sky-600' : 'text-emerald-600') : 'text-ink'}`}>{o.price} تومان</div>
           </div>
          )
         })}
        </div>
        <button disabled={!selKey || (needsDoctorPick && !selectedDoctorId)} onClick={() => setStep(3)}
         className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-ink/90 transition-colors">
         ادامه ←
        </button>
       </>
      )}
     </div>
    )}

    {/* Step 3 - فرم کامل (کاملاً دیتایی — از فرمِ تنظیم‌شده‌ی همین دکتر)، به‌صورتِ ویزاردِ چندمرحله‌ای */}
    {step === 3 && (() => {
     const visibleSections = intakeForm.sections
      .map(s => ({ ...s, fields: s.fields.filter(f => fieldVisible(f, answers)) }))
      .filter(s => s.fields.length > 0)
     const totalPages = 1 + visibleSections.length
     const safeIdx = Math.min(pageIdx, totalPages - 1)
     const currentSection = safeIdx === 0 ? null : visibleSections[safeIdx - 1]

     function missingOnThisPage(): string[] {
      if (safeIdx === 0) {
       const miss: string[] = []
       if (!childName.trim()) miss.push('نام')
       if (!fatherPhone.trim()) miss.push('شماره تماس')
       else if (!isValidIranPhone(fatherPhone)) miss.push('شماره تماس (باید 11 رقم و با 09 شروع شود)')
       return miss
      }
      if (!currentSection) return []
      const miss: string[] = []
      for (const f of currentSection.fields) {
       const v = answers[f.id]
       const empty = f.type === 'multiselect' ? !Array.isArray(v) || v.length === 0 : !String(v ?? '').trim()
       if (f.required && empty) { miss.push(f.label); continue }
       if (f.type === 'phone' && !empty && !isValidIranPhone(String(v))) miss.push(`${f.label} (فرمتِ شماره نامعتبر است)`)
      }
      return miss
     }

     async function goNext() {
      const miss = missingOnThisPage()
      if (miss.length) { uiAlert('لطفاً این موارد را کامل کنید:\n• ' + miss.join('\n• ')); return }
      // قبل از ادامه، مطمئن شو همین نام+شماره از قبل ثبت نشده (تا مراجع کلِ فرم رو الکی پر نکنه)
      if (safeIdx === 0) {
       try {
        const res = await fetch(`/api/t/${slug}/psy/check-existing`, {
         method: 'POST', headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ childName, phone: fatherPhone }),
        })
        const d = await res.json()
        if (d.exists) { uiAlert('پرونده‌ای با همین نام و شماره‌تماس قبلاً ثبت شده است. اگر برای فرزندِ دیگری است، نام را متفاوت وارد کنید.'); return }
       } catch {}
      }
      if (safeIdx === totalPages - 1) handleSubmit()
      else setPageIdx(safeIdx + 1)
     }
     function goBack() {
      if (safeIdx === 0) setStep(1)
      else setPageIdx(safeIdx - 1)
     }

     return (
      <div className="bg-white rounded-2xl border border-sand p-5 mb-4">
       {/* خلاصه — فقط صفحه‌ی اول */}
       {safeIdx === 0 && (
        <div className="bg-sand rounded-xl p-3 text-sm mb-5">
         <div className="flex justify-between text-soot mb-1">
          <span>نوع جلسه</span><span className="font-medium">{sessionType === 'online' ? 'آنلاین ' : `حضوری ${officeLoc ? ` — ${officeLoc}` : ''}`}</span>
         </div>
         <div className="flex justify-between border-t border-sand pt-2 mt-2">
          <span className="font-medium">هزینه‌ی مصاحبه‌ی اولیه</span><span className="font-medium text-ink">{(sessionType === 'online' ? (displayDoctor?.pricing.online ?? PRICING.online) : (displayDoctor?.pricing.offline ?? PRICING.offline)).toLocaleString()} تومان</span>
         </div>
        </div>
       )}

       {!intakeLoaded ? (
        <div className="text-center py-10 text-soot text-sm">در حال بارگذاری فرم...</div>
       ) : (
        <>
         {/* نوارِ پیشرفت */}
         <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
           <span className="text-xs text-soot">{safeIdx === 0 ? 'مشخصاتِ تماس' : currentSection?.title}</span>
           <span className="text-[11px] text-soot">{toFarsiNum(safeIdx + 1)} از {toFarsiNum(totalPages)}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
           <div className="h-full bg-ink rounded-full transition-all" style={{ width: `${((safeIdx + 1) / totalPages) * 100}%` }} />
          </div>
         </div>

         {safeIdx === 0 ? (
          <div className="grid grid-cols-2 gap-3">
           <Field label="نام و نام خانوادگی *" value={childName} onChange={setChildName} placeholder="آرین رضایی" />
           <Field label="شماره تماس *" value={fatherPhone} onChange={setFatherPhone} placeholder="0912..." dir="ltr" />
          </div>
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
        <button disabled={loading || !intakeLoaded} onClick={goNext}
         className="flex-1 py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-ink/90 transition-colors">
         {loading ? 'در حال ثبت...' : safeIdx === totalPages - 1 ? 'ادامه به پرداخت ←' : 'بعدی ←'}
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

// یک فیلد را طبقِ نوعِ تعریف‌شده‌اش (توسطِ خودِ دکتر) رندر می‌کند
function DynamicField({ field, value, onChange, onToggle }: {
 field: FormField; value: any; onChange: (v: string) => void; onToggle: (option: string) => void
}) {
 const label = field.label + (field.required ? ' *' : '')
 if (field.type === 'text') return <Field label={label} value={value || ''} onChange={onChange} placeholder={field.placeholder} />
 if (field.type === 'textarea') return <Field label={label} value={value || ''} onChange={onChange} placeholder={field.placeholder} textarea />
 if (field.type === 'date') return (
  <div>
   <label className="text-xs text-soot mb-1 block">{label}</label>
   <JalaliDatePicker value={value || ''} onChange={onChange} />
  </div>
 )
 if (field.type === 'phone') return (
  <Field label={label} value={value || ''} onChange={onChange} placeholder="0912..." dir="ltr" />
 )
 if (field.type === 'select') return (
  <div>
   <label className="text-xs text-soot mb-1 block">{label}</label>
   <div className="flex gap-2 flex-wrap">
    {(field.options || []).map(o => (
     <button key={o} type="button" onClick={() => onChange(o)}
      className={`px-4 py-1.5 text-sm rounded-lg border ${value === o ? 'bg-ink text-white border-ink' : 'border-sand text-soot'}`}>
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
      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selected.includes(o) ? 'bg-ink text-white border-ink' : 'border-sand text-soot hover:border-gray-300'}`}>
      {o}
     </button>
    ))}
   </div>
  </div>
 )
}

// انتخابگرِ تاریخِ شمسی — یک تقویمِ واقعی (نه سه‌تا select ساده). به‌جای selectِ
// بومیِ مرورگر (که لیستش دراز و بی‌سبک است)، ماه/سال با یه دراپ‌داونِ کوچیکِ
// خودمان (اسکرول‌شونده، هم‌شکلِ بقیه‌ی پنل) انتخاب می‌شوند.
function MiniDropdown({ value, label, options, onSelect, open, onToggle }: {
 value: number; label: string; options: { value: number; label: string }[]
 onSelect: (v: number) => void; open: boolean; onToggle: () => void
}) {
 return (
  <div className="relative flex-1">
   <button type="button" onClick={onToggle}
    className="w-full text-xs px-2.5 py-1.5 border border-sand rounded-lg bg-gray-50 flex items-center justify-between hover:border-gray-300 transition-colors">
    <span className="text-ink">{label}</span>
    <span className="text-soot text-[10px]">▾</span>
   </button>
   {open && (
    <div className="absolute z-40 mt-1 w-full max-h-40 overflow-y-auto bg-white border border-sand rounded-lg shadow-lg py-1">
     {options.map(o => (
      <button key={o.value} type="button" onClick={() => onSelect(o.value)}
       className={`w-full text-right px-3 py-1.5 text-xs transition-colors ${o.value === value ? 'bg-sand text-ink font-medium' : 'text-soot hover:bg-gray-50'}`}>
       {o.label}
      </button>
     ))}
    </div>
   )}
  </div>
 )
}

function JalaliDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
 const currentYear = getCurrentJalali().year
 const parts = value ? value.split('/').map(s => parseInt(s, 10)) : []
 const selY = parts[0] || 0, selM = parts[1] || 0, selD = parts[2] || 0

 const [open, setOpen] = useState(false)
 const [openWhich, setOpenWhich] = useState<'month' | 'year' | null>(null)
 const [viewYear, setViewYear] = useState(selY || currentYear - 10)
 const [viewMonth, setViewMonth] = useState(selM || 1)
 const wrapRef = useRef<HTMLDivElement>(null)

 useEffect(() => {
  function onDocClick(e: MouseEvent) {
   if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setOpenWhich(null) }
  }
  document.addEventListener('mousedown', onDocClick)
  return () => document.removeEventListener('mousedown', onDocClick)
 }, [])

 const years = Array.from({ length: 90 }, (_, i) => currentYear - i)
 const daysInMonth = getDaysInJalaliMonth(viewYear, viewMonth - 1)
 const offset = jalaliWeekday(viewYear, viewMonth, 1)

 function selectDay(d: number) {
  onChange(`${viewYear}/${String(viewMonth).padStart(2, '0')}/${String(d).padStart(2, '0')}`)
  setOpen(false)
 }
 function prevMonth() { if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
 function nextMonth() { if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }

 const displayValue = (selY && selM && selD) ? `${toFarsiNum(selD)} ${PERSIAN_MONTHS[selM - 1]} ${toFarsiNum(selY)}` : ''

 return (
  <div className="relative" ref={wrapRef}>
   <button type="button" onClick={() => { setOpen(o => !o); setOpenWhich(null) }}
    className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl bg-white flex items-center justify-between focus:outline-none focus:border-ink hover:border-gray-300 transition-colors">
    <span className={displayValue ? 'text-ink' : 'text-soot'}>{displayValue || 'انتخابِ تاریخِ تولد'}</span>
    <span className="text-soot text-base"></span>
   </button>
   {open && (
    <div className="absolute z-30 mt-1.5 w-full min-w-[280px] bg-white border border-sand rounded-2xl shadow-lg p-3">
     <div className="flex items-center gap-2 mb-3">
      <MiniDropdown value={viewMonth} label={PERSIAN_MONTHS[viewMonth - 1]}
       options={PERSIAN_MONTHS.map((mn, i) => ({ value: i + 1, label: mn }))}
       onSelect={v => { setViewMonth(v); setOpenWhich(null) }}
       open={openWhich === 'month'} onToggle={() => setOpenWhich(w => w === 'month' ? null : 'month')} />
      <MiniDropdown value={viewYear} label={toFarsiNum(viewYear)}
       options={years.map(y => ({ value: y, label: toFarsiNum(y) }))}
       onSelect={v => { setViewYear(v); setOpenWhich(null) }}
       open={openWhich === 'year'} onToggle={() => setOpenWhich(w => w === 'year' ? null : 'year')} />
     </div>
     <div className="flex items-center justify-between mb-2 px-0.5">
      <button type="button" onClick={prevMonth} className="w-7 h-7 flex items-center justify-center text-soot hover:text-ink hover:bg-gray-50 rounded-lg transition-colors">›</button>
      <span className="text-xs font-medium text-ink">{PERSIAN_MONTHS[viewMonth - 1]} {toFarsiNum(viewYear)}</span>
      <button type="button" onClick={nextMonth} className="w-7 h-7 flex items-center justify-center text-soot hover:text-ink hover:bg-gray-50 rounded-lg transition-colors">‹</button>
     </div>
     <div className="grid grid-cols-7 gap-1 mb-1">
      {PERSIAN_WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] text-soot py-1">{w}</div>)}
     </div>
     <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
       const isSelected = selY === viewYear && selM === viewMonth && selD === d
       return (
        <button key={d} type="button" onClick={() => selectDay(d)}
         className={`h-8 rounded-lg text-xs transition-colors ${isSelected ? 'bg-ink text-white font-medium' : 'text-soot hover:bg-sand'}`}>
         {toFarsiNum(d)}
        </button>
       )
      })}
     </div>
    </div>
   )}
  </div>
 )
}

function StepBar({ current }: { current: number }) {
 const steps = ['نوع جلسه','اطلاعات','پرداخت']
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
// صفحه‌ی پرداختِ کارت‌به‌کارتِ مصاحبه‌ی اولیه
function InterviewPayScreen({ amount, cards, loaded, loading, onPay, paymentMethods, slug, caseNumber, phone, stageId, resourceId }: {
 amount: number; cards: PaymentCardInfo[]; loaded: boolean; loading: boolean; onPay: (ref: string, discountCode?: string) => void
 paymentMethods?: PaymentMethods; slug: string; caseNumber: string; phone: string; stageId: string; resourceId?: string
}) {
 const [ref, setRef] = useState('')
 const online = !!paymentMethods?.online
 const cardToCard = paymentMethods ? paymentMethods.card_to_card : true
 const [method, setMethod] = useState<'online' | 'card'>(online ? 'online' : 'card')
 const [onlineLoading, setOnlineLoading] = useState(false)
 const [onlineError, setOnlineError] = useState('')

 // کدِ تخفیف — اختیاری، فقط اگر دکتر چیزی به مراجع گفته باشد
 const [showDiscount, setShowDiscount] = useState(false)
 const [discountCode, setDiscountCode] = useState('')
 const [discountChecking, setDiscountChecking] = useState(false)
 const [discountResult, setDiscountResult] = useState<{ ok: true; discountedAmount: number; discountAmount: number } | { ok: false; error: string } | null>(null)
 const finalAmount = discountResult?.ok ? discountResult.discountedAmount : amount

 async function checkDiscount() {
  if (!discountCode.trim() || !resourceId) return
  setDiscountChecking(true)
  try {
   const res = await fetch(`/api/t/${slug}/psy/discount-check?resource_id=${resourceId}&code=${encodeURIComponent(discountCode.trim())}&amount=${amount}`)
   const d = await res.json()
   setDiscountResult(d)
  } catch { setDiscountResult({ ok: false, error: 'خطا در بررسیِ کد' }) }
  setDiscountChecking(false)
 }

 async function payOnline() {
  setOnlineLoading(true); setOnlineError('')
  try {
   const res = await fetch(`/api/t/${slug}/psy/pay-online`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_number: caseNumber, phone, purpose: 'stage', ref_id: stageId, discount_code: discountResult?.ok ? discountCode.trim() : undefined }),
   })
   const data = await res.json()
   if (data.url) window.location.href = data.url
   else { setOnlineError(data.error || 'خطا در اتصال به درگاه'); setOnlineLoading(false) }
  } catch { setOnlineError('خطا در ارتباط با سرور'); setOnlineLoading(false) }
 }

 return (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
   <DialogHost />
   <div className="max-w-sm w-full bg-white rounded-2xl border border-sand p-6">
    <div className="text-center mb-4">
     <div className="w-16 h-16 rounded-full bg-sand flex items-center justify-center mx-auto mb-3 text-3xl">💳</div>
     <h1 className="text-lg font-display font-medium text-ink">پرداختِ هزینه‌ی مصاحبه</h1>
    </div>

    <div className="bg-sand border border-sand rounded-xl p-4 mb-3">
     <div className="flex items-center justify-between">
      <span className="text-xs text-soot">مبلغ قابل پرداخت</span>
      <span className="text-base font-bold text-ink">
       {discountResult?.ok && <span className="text-soot line-through text-xs ml-1.5">{amount.toLocaleString()}</span>}
       {finalAmount.toLocaleString()} تومان
      </span>
     </div>
    </div>

    {resourceId && (
     <div className="mb-3">
      {!showDiscount ? (
       <button onClick={() => setShowDiscount(true)} className="text-xs text-soot underline">کدِ تخفیف دارید؟</button>
      ) : (
       <div className="flex gap-2">
        <input value={discountCode} onChange={e => { setDiscountCode(e.target.value.toUpperCase()); setDiscountResult(null) }}
         dir="ltr" placeholder="کدِ تخفیف" className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
        <button onClick={checkDiscount} disabled={discountChecking || !discountCode.trim()}
         className="px-3 py-2 border border-sand rounded-lg text-xs text-ink disabled:opacity-50">
         {discountChecking ? '...' : 'اعمال'}
        </button>
       </div>
      )}
      {discountResult && (
       <p className={`text-xs mt-1.5 ${discountResult.ok ? 'text-emerald-700' : 'text-red-600'}`}>
        {discountResult.ok ? `کد اعمال شد — ${discountResult.discountAmount.toLocaleString()} تومان تخفیف` : discountResult.error}
       </p>
      )}
     </div>
    )}

    {online && cardToCard && (
     <div className="grid grid-cols-2 gap-2 mb-3 p-1 bg-gray-100 rounded-xl">
      <button onClick={() => setMethod('online')}
       className={`py-2 rounded-lg text-xs font-medium transition-colors ${method === 'online' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
       پرداختِ آنلاین
      </button>
      <button onClick={() => setMethod('card')}
       className={`py-2 rounded-lg text-xs font-medium transition-colors ${method === 'card' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
       کارت‌به‌کارت
      </button>
     </div>
    )}

    {method === 'online' && online ? (
     <>
      <p className="text-xs text-soot mb-3 text-center">بعدِ پرداخت بلافاصله می‌توانید وقتِ مصاحبه را بگیرید.</p>
      {onlineError && <div className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 mb-3 text-center">{onlineError}</div>}
      <button onClick={payOnline} disabled={onlineLoading}
       className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
       {onlineLoading ? 'در حال اتصال به درگاه...' : 'پرداختِ آنلاین'}
      </button>
     </>
    ) : (
     <>
      <p className="text-xs text-soot mb-3">مبلغ را کارت‌به‌کارت کنید و سپس «پرداخت کردم» را بزنید.</p>
      <div className="bg-sand border border-sand rounded-xl p-3 mb-3">
       <CardChooser cards={cards} loaded={loaded} />
      </div>
      <label className="text-xs text-soot mb-1 block">متن فیش واریزی <span className="text-red-500">*</span></label>
      <textarea value={ref} onChange={e => setRef(e.target.value)} rows={3} placeholder="اطلاعات فیش واریزی را وارد کنید (کد پیگیری، شماره کارت مبدأ، تاریخ و ساعت واریز...)"
       className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl focus:outline-none focus:border-ink mb-3 resize-none" />
      <button onClick={() => onPay(ref.trim(), discountResult?.ok ? discountCode.trim() : undefined)} disabled={loading || !ref.trim()}
       className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
       {loading ? 'در حال ثبت...' : 'پرداخت کردم'}
      </button>
      <p className="text-[11px] text-soot mt-2 text-center">پس از تأیید پرداخت، از پنل مراجع وقتِ مصاحبه را می‌گیرید.</p>
     </>
    )}
   </div>
  </div>
 )
}