'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { PERSIAN_MONTHS, PERSIAN_WEEKDAYS, toFarsiNum, getCurrentJalali, getDaysInJalaliMonth } from '@/lib/calendar'
import { PSY_PRICING as PRICING } from '@/lib/psy'
import { usePublicClinic, CardChooser } from '@/components/PsyPublic'
import { onlineAvailable, offlineAvailable, fieldVisible, missingIntakeFields } from '@/lib/psy'
import type { PaymentCardInfo, IntakeForm, FormField, PaymentMethods } from '@/lib/psy'
import { DialogHost, uiAlert, uiConfirm, uiPrompt } from '@/components/ui/Dialog'

type Step = 1 | 2 | 3 | 'pay' | 'done'

export default function InterviewPage() {
  const { slug } = useParams<{ slug: string }>()
  const today = getCurrentJalali()
  const settings = usePublicClinic(slug)
  const [step, setStep] = useState<Step>(1)
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [sessionType, setSessionType] = useState<'online'|'offline'|''>('')
  const [officeLoc, setOfficeLoc] = useState('')   // عنوانِ مکانِ حضوریِ انتخاب‌شده
  const [selKey, setSelKey] = useState('')         // کلیدِ گزینه‌ی انتخاب‌شده (برای های‌لایت)
  const [curMonth, setCurMonth] = useState(today.month)
  const [curYear, setCurYear] = useState(today.year)
  const [selectedDay, setSelectedDay] = useState<number|null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [caseNumber, setCaseNumber] = useState('')
  // برنامه‌ی واقعی دکتر از دیتابیس — کلید: شماره روز، مقدار: ساعت‌های خالی
  const [schedule, setSchedule] = useState<Record<string, string[]>>({})
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  // نام و شماره‌تماس همیشه ثابت‌اند (برای OTP لازم‌اند)؛ بقیه‌ی سوال‌ها کاملاً
  // دیتایی‌اند و از فرمِ تنظیم‌شده‌ی همین دکتر می‌آیند.
  const [childName, setChildName] = useState('')
  const [fatherPhone, setFatherPhone] = useState('')
  const [intakeForm, setIntakeForm] = useState<IntakeForm>({ sections: [] })
  const [intakeLoaded, setIntakeLoaded] = useState(false)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const setAnswer = (id: string, v: any) => setAnswers(a => ({ ...a, [id]: v }))
  // فرمِ درازِ قدیمی به یک ویزاردِ چندمرحله‌ای تبدیل شد — مرحله‌ی ۰ = مشخصاتِ تماس، بقیه = هر بخش یک صفحه
  const [pageIdx, setPageIdx] = useState(0)

  const price = sessionType === 'online' ? '۸۵۰,۰۰۰' : '۱,۲۰۰,۰۰۰'
  const daysInMonth = getDaysInJalaliMonth(curYear, curMonth)
  const startDay = 2
  const availDays = Object.keys(schedule).filter(d => schedule[d].length > 0).map(Number)

  // هر بار ماه/سال عوض شد، برنامه‌ی واقعی اون ماه رو از دیتابیس بخون
  useEffect(() => {
    let cancelled = false
    setLoadingSchedule(true)
    fetch(`/api/t/${slug}/psy/schedule?year=${curYear}&month=${curMonth + 1}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const map: Record<string, string[]> = {}
        for (const s of d.schedules || []) {
          const day = parseInt(s.date.split('/')[2])
          map[String(day)] = s.available_times || []
        }
        setSchedule(map)
      })
      .catch(() => { if (!cancelled) setSchedule({}) })
      .finally(() => { if (!cancelled) setLoadingSchedule(false) })
    return () => { cancelled = true }
  }, [curMonth, curYear])

  // گزینه‌های نوعِ جلسه: آنلاین (در صورتِ فعال‌بودن) + یک کارت به‌ازای هر مکانِ حضوری
  const sessionOptions = useMemo(() => {
    const opts: { key: string; type: 'online' | 'offline'; loc: string; icon: string; label: string; desc: string; price: string }[] = []
    if (onlineAvailable(settings.session_modes)) {
      opts.push({ key: 'online', type: 'online', loc: '', icon: '🎥', label: 'آنلاین', desc: 'تماس تصویری', price: '۸۵۰,۰۰۰' })
    }
    if (offlineAvailable(settings.session_modes)) {
      for (const l of settings.office_locations) {
        opts.push({ key: `offline:${l.id}`, type: 'offline', loc: l.title, icon: '🏥', label: l.title || 'حضوری', desc: l.address || 'جلسه‌ی حضوری', price: '۱,۲۰۰,۰۰۰' })
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

  function changeMonth(dir: number) {
    let m = curMonth + dir, y = curYear
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setCurMonth(m); setCurYear(y)
    setSelectedDay(null); setSelectedSlot('')
  }

  // toggle عمومی برای فیلدهای چندگزینه‌ای — همان رفتارِ «هیچ‌کدام» منحصربه‌فرد
  function toggleMulti(fieldId: string, option: string) {
    setAnswers(a => {
      const cur: string[] = Array.isArray(a[fieldId]) ? a[fieldId] : []
      if (option === 'هیچ‌کدام') return { ...a, [fieldId]: cur.includes('هیچ‌کدام') ? [] : ['هیچ‌کدام'] }
      const base = cur.filter(x => x !== 'هیچ‌کدام')
      return { ...a, [fieldId]: base.includes(option) ? base.filter(x => x !== option) : [...base, option] }
    })
  }

  // اعتبارسنجی: نام/تماس همیشه اجباری + هرچه در فرمِ این دکتر اجباری علامت خورده
  // (طبقِ همان تابعِ مشترکی که سمتِ سرور هم استفاده می‌شود — فیلدهای مخفیِ شرطی حساب نمی‌شوند)
  function missingFields(): string[] {
    const miss: string[] = []
    if (!childName.trim()) miss.push('نام')
    if (!fatherPhone.trim()) miss.push('شماره تماس')
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
      if (data.caseNumber) { setCaseNumber(data.caseNumber); setStep('pay') }
      else uiAlert(data.error || 'خطا در ثبت اطلاعات')
    } catch { uiAlert('خطا در ارتباط با سرور') }
    setLoading(false)
  }

  // پرداختِ کارت‌به‌کارتِ مصاحبه (پس از ثبت فرم)
  async function submitInterviewPayment(ref: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/t/${slug}/psy/stage-pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_number: caseNumber, phone: fatherPhone, stage: 'interview', payment_ref: ref })
      })
      if (res.ok) setStep('done')
      else uiAlert('ثبتِ پرداخت ناموفق بود')
    } catch { uiAlert('خطا در ارتباط با سرور') }
    setLoading(false)
  }

  if (step === 'pay') return <InterviewPayScreen amount={PRICING.interview} cards={settings.cards} loaded={settings.loaded} loading={loading}
    onPay={submitInterviewPayment} paymentMethods={displayDoctor?.payment_methods} slug={slug} caseNumber={caseNumber} phone={fatherPhone} />

  if (step === 'done') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <DialogHost />
      <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4 text-3xl">✅</div>
        <h1 className="text-xl font-medium text-gray-900 mb-2">پرداخت شما ثبت شد!</h1>
        {caseNumber && (
          <div className="bg-brand-50 rounded-xl p-3 mb-4">
            <p className="text-xs text-gray-500 mb-1">شماره پرونده شما</p>
            <p className="text-2xl font-bold text-brand-600 tracking-widest">{caseNumber}</p>
            <p className="text-xs text-gray-400 mt-1">این شماره را نزد خود نگه دارید</p>
          </div>
        )}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
          پرداختِ شما در انتظار <b>تأیید</b> است. پس از تأیید، از پنل مراجع می‌توانید <b>وقتِ مصاحبه</b> را انتخاب کنید.
        </div>
        <a href={`/${slug}/my`} className="block mt-3 w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-800 transition-colors">ورود به پنل مراجع</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <DialogHost />
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-3 text-2xl overflow-hidden">
            {!settings.loaded
              ? <div className="w-full h-full bg-gray-100 animate-pulse" />
              : displayDoctor?.avatar_url
                ? <img src={displayDoctor.avatar_url} alt={displayDoctor.name} className="w-full h-full object-cover" />
                : '👩‍⚕️'}
          </div>
          {settings.loaded ? (
            <>
              <h1 className="text-xl font-medium text-gray-900 mb-1">{needsDoctorPick && !selectedDoctorId ? 'مصاحبه‌ی اولیه' : (displayDoctor?.name || settings.doctor_name)}</h1>
              <p className="text-sm text-gray-500">مصاحبه‌ی اولیه با والدین</p>
              <div className="flex gap-2 justify-center mt-3 flex-wrap">
                {(displayDoctor?.badges || settings.badges).map((b, i) => (
                  <span key={i} className="text-xs px-3 py-1 bg-white border border-gray-200 rounded-lg text-gray-500">{b}</span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="h-6 w-44 mx-auto bg-gray-100 rounded animate-pulse mb-2" />
              <p className="text-sm text-gray-500">مصاحبه‌ی اولیه با والدین</p>
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
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            {!settings.loaded ? (
              <div className="text-center py-10 text-gray-400 text-sm">در حال بارگذاری...</div>
            ) : (
              <>
                {needsDoctorPick && (
                  <div className="mb-5">
                    <h2 className="text-base font-medium mb-4 text-gray-800">با کدام دکتر مصاحبه می‌خواهید؟</h2>
                    <div className="grid grid-cols-2 gap-3">
                      {settings.doctors.map(d => (
                        <div key={d.id} onClick={() => setSelectedDoctorId(d.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all text-center ${selectedDoctorId === d.id ? 'border-brand-600 border-2 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                          <div className="w-12 h-12 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-2 text-xl overflow-hidden">
                            {d.avatar_url ? <img src={d.avatar_url} alt={d.name} className="w-full h-full object-cover" /> : '👩‍⚕️'}
                          </div>
                          <div className="font-medium text-gray-800 text-sm">{d.name}</div>
                          {d.title && <div className="text-xs text-gray-500">{d.title}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <h2 className="text-base font-medium mb-4 text-gray-800">نوع جلسه را انتخاب کنید</h2>
                <div className={`grid gap-3 mb-5 ${sessionOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {sessionOptions.map(o => (
                    <div key={o.key} onClick={() => { setSelKey(o.key); setSessionType(o.type); setOfficeLoc(o.loc) }}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${selKey === o.key ? 'border-brand-600 border-2 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className="text-2xl mb-2">{o.icon}</div>
                      <div className="font-medium text-gray-800 text-sm">{o.label}</div>
                      <div className="text-xs text-gray-500 mb-2">{o.desc}</div>
                      <div className="text-sm font-medium text-brand-600">{o.price} تومان</div>
                    </div>
                  ))}
                </div>
                <button disabled={!selKey || (needsDoctorPick && !selectedDoctorId)} onClick={() => setStep(3)}
                  className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-800 transition-colors">
                  ادامه ←
                </button>
              </>
            )}
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => changeMonth(-1)} className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">›</button>
              <h2 className="text-base font-medium text-gray-800">{PERSIAN_MONTHS[curMonth]} {toFarsiNum(curYear)}</h2>
              <button onClick={() => changeMonth(1)} className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">‹</button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {PERSIAN_WEEKDAYS.map(d => <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-5">
              {Array(startDay).fill(null).map((_,i) => <div key={i} />)}
              {Array(daysInMonth).fill(null).map((_,i) => {
                const d = i + 1
                const isPast = curYear === today.year && curMonth === today.month && d <= today.day
                const hasSlot = availDays.includes(d)
                const isSelected = selectedDay === d
                return (
                  <div key={d} onClick={() => { if(!isPast && hasSlot){ setSelectedDay(d); setSelectedSlot('') }}}
                    className={`text-center py-2 rounded-lg text-sm transition-all relative
                      ${isPast ? 'text-gray-300 cursor-default' : ''}
                      ${hasSlot && !isPast ? 'cursor-pointer hover:bg-brand-50' : ''}
                      ${isSelected ? 'bg-brand-50 text-brand-800 font-medium' : ''}
                      ${!isPast && !hasSlot ? 'text-gray-400 cursor-default' : ''}
                    `}>
                    {toFarsiNum(d)}
                    {hasSlot && !isPast && <span className="block w-1 h-1 rounded-full bg-brand-400 mx-auto mt-0.5" />}
                  </div>
                )
              })}
            </div>
            {loadingSchedule && (
              <p className="text-center text-xs text-gray-400 mb-4">در حال بارگذاری برنامه...</p>
            )}
            {!loadingSchedule && availDays.length === 0 && (
              <p className="text-center text-xs text-gray-400 mb-4">برای این ماه نوبتی تعریف نشده است.</p>
            )}
            {selectedDay && (
              <div className="mb-5">
                <h3 className="text-sm font-medium text-gray-700 mb-3">ساعت‌های خالی — {toFarsiNum(selectedDay)} {PERSIAN_MONTHS[curMonth]}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(schedule[String(selectedDay)] || []).map(s => (
                    <div key={s} onClick={() => setSelectedSlot(s)}
                      className={`text-center py-2 border rounded-lg text-sm cursor-pointer transition-all
                        ${selectedSlot === s ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 text-gray-500'}`}>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">برگشت</button>
              <button disabled={!selectedDay || !selectedSlot} onClick={() => setStep(3)}
                className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-800 transition-colors">
                مشخصات مراجع ←
              </button>
            </div>
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
              return miss
            }
            if (!currentSection) return []
            const miss: string[] = []
            for (const f of currentSection.fields) {
              if (!f.required) continue
              const v = answers[f.id]
              const empty = f.type === 'multiselect' ? !Array.isArray(v) || v.length === 0 : !String(v ?? '').trim()
              if (empty) miss.push(f.label)
            }
            return miss
          }

          function goNext() {
            const miss = missingOnThisPage()
            if (miss.length) { uiAlert('لطفاً این موارد را کامل کنید:\n• ' + miss.join('\n• ')); return }
            if (safeIdx === totalPages - 1) handleSubmit()
            else setPageIdx(safeIdx + 1)
          }
          function goBack() {
            if (safeIdx === 0) setStep(1)
            else setPageIdx(safeIdx - 1)
          }

          return (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
              {/* خلاصه — فقط صفحه‌ی اول */}
              {safeIdx === 0 && (
                <div className="bg-brand-50 rounded-xl p-3 text-sm mb-5">
                  <div className="flex justify-between text-gray-600 mb-1">
                    <span>نوع جلسه</span><span className="font-medium">{sessionType === 'online' ? 'آنلاین 🎥' : `حضوری 🏥${officeLoc ? ` — ${officeLoc}` : ''}`}</span>
                  </div>
                  <div className="flex justify-between border-t border-brand-100 pt-2 mt-2">
                    <span className="font-medium">هزینه‌ی مصاحبه‌ی اولیه</span><span className="font-medium text-brand-600">{PRICING.interview.toLocaleString()} تومان</span>
                  </div>
                </div>
              )}

              {!intakeLoaded ? (
                <div className="text-center py-10 text-gray-400 text-sm">در حال بارگذاری فرم...</div>
              ) : (
                <>
                  {/* نوارِ پیشرفت */}
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-400">{safeIdx === 0 ? 'مشخصاتِ تماس' : currentSection?.title}</span>
                      <span className="text-[11px] text-gray-400">{toFarsiNum(safeIdx + 1)} از {toFarsiNum(totalPages)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${((safeIdx + 1) / totalPages) * 100}%` }} />
                    </div>
                  </div>

                  {safeIdx === 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="نام و نام خانوادگی *" value={childName} onChange={setChildName} placeholder="آرین رضایی" />
                      <Field label="شماره تماس *" value={fatherPhone} onChange={setFatherPhone} placeholder="۰۹۱۲..." dir="ltr" />
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
                <button onClick={goBack} className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">برگشت</button>
                <button disabled={loading || !intakeLoaded} onClick={goNext}
                  className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-800 transition-colors">
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
      <h3 className="text-sm font-medium text-gray-800 mb-3 pb-2 border-b border-gray-100">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, dir, textarea }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; dir?: string; textarea?: boolean
}) {
  const cls = "w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400"
  return (
    <div>
      {label && <label className="text-xs text-gray-500 mb-1 block">{label}</label>}
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
  if (field.type === 'select') return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <div className="flex gap-2 flex-wrap">
        {(field.options || []).map(o => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={`px-4 py-1.5 text-sm rounded-lg border ${value === o ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>
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
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <div className="flex flex-wrap gap-2">
        {(field.options || []).map(o => (
          <button key={o} type="button" onClick={() => onToggle(o)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-all ${selected.includes(o) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

function StepBar({ current }: { current: number }) {
  const steps = ['نوع جلسه','اطلاعات','پرداخت']
  return (
    <div className="flex items-center mb-6">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center flex-1 last:flex-none">
          <div className={`flex items-center gap-1.5 text-xs ${current === i+1 ? 'text-brand-600 font-medium' : current > i+1 ? 'text-gray-400' : 'text-gray-300'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs border
              ${current === i+1 ? 'border-brand-600 bg-brand-50 text-brand-600' : current > i+1 ? 'border-gray-300 bg-gray-100 text-gray-400' : 'border-gray-200 text-gray-300'}`}>
              {toFarsiNum(i+1)}
            </div>
            <span className="hidden sm:inline">{s}</span>
          </div>
          {i < steps.length-1 && <div className="flex-1 h-px bg-gray-200 mx-2" />}
        </div>
      ))}
    </div>
  )
}
// صفحه‌ی پرداختِ کارت‌به‌کارتِ مصاحبه‌ی اولیه
function InterviewPayScreen({ amount, cards, loaded, loading, onPay, paymentMethods, slug, caseNumber, phone }: {
  amount: number; cards: PaymentCardInfo[]; loaded: boolean; loading: boolean; onPay: (ref: string) => void
  paymentMethods?: PaymentMethods; slug: string; caseNumber: string; phone: string
}) {
  const [ref, setRef] = useState('')
  const online = !!paymentMethods?.online
  const cardToCard = paymentMethods ? paymentMethods.card_to_card : true
  const [method, setMethod] = useState<'online' | 'card'>(online ? 'online' : 'card')
  const [onlineLoading, setOnlineLoading] = useState(false)
  const [onlineError, setOnlineError] = useState('')

  async function payOnline() {
    setOnlineLoading(true); setOnlineError('')
    try {
      const res = await fetch(`/api/t/${slug}/psy/pay-online`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_number: caseNumber, phone, purpose: 'interview' }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else { setOnlineError(data.error || 'خطا در اتصال به درگاه'); setOnlineLoading(false) }
    } catch { setOnlineError('خطا در ارتباط با سرور'); setOnlineLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <DialogHost />
      <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-100 p-6">
        <div className="text-center mb-4">
          <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3 text-3xl">💳</div>
          <h1 className="text-lg font-medium text-gray-900">پرداختِ هزینه‌ی مصاحبه</h1>
        </div>

        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">مبلغ قابل پرداخت</span>
            <span className="text-base font-bold text-brand-700">{amount.toLocaleString()} تومان</span>
          </div>
        </div>

        {online && cardToCard && (
          <div className="grid grid-cols-2 gap-2 mb-3 p-1 bg-gray-100 rounded-xl">
            <button onClick={() => setMethod('online')}
              className={`py-2 rounded-lg text-xs font-medium transition-colors ${method === 'online' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              🌐 پرداختِ آنلاین
            </button>
            <button onClick={() => setMethod('card')}
              className={`py-2 rounded-lg text-xs font-medium transition-colors ${method === 'card' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              💳 کارت‌به‌کارت
            </button>
          </div>
        )}

        {method === 'online' && online ? (
          <>
            <p className="text-xs text-gray-500 mb-3 text-center">بعدِ پرداخت بلافاصله می‌توانید وقتِ مصاحبه را بگیرید.</p>
            {onlineError && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5 mb-3 text-center">{onlineError}</div>}
            <button onClick={payOnline} disabled={onlineLoading}
              className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
              {onlineLoading ? 'در حال اتصال به درگاه...' : '🌐 پرداختِ آنلاین'}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-3">مبلغ را کارت‌به‌کارت کنید و سپس «پرداخت کردم» را بزنید.</p>
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 mb-3">
              <CardChooser cards={cards} loaded={loaded} />
            </div>
            <label className="text-xs text-gray-500 mb-1 block">متن فیش واریزی <span className="text-red-500">*</span></label>
            <textarea value={ref} onChange={e => setRef(e.target.value)} rows={3} placeholder="اطلاعات فیش واریزی را وارد کنید (کد پیگیری، شماره کارت مبدأ، تاریخ و ساعت واریز...)"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-brand-400 mb-3 resize-none" />
            <button onClick={() => onPay(ref.trim())} disabled={loading || !ref.trim()}
              className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
              {loading ? 'در حال ثبت...' : '✅ پرداخت کردم'}
            </button>
            <p className="text-[11px] text-gray-400 mt-2 text-center">پس از تأیید پرداخت، از پنل مراجع وقتِ مصاحبه را می‌گیرید.</p>
          </>
        )}
      </div>
    </div>
  )
}