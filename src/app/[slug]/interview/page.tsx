'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { PERSIAN_MONTHS, PERSIAN_WEEKDAYS, toFarsiNum, getCurrentJalali, getDaysInJalaliMonth } from '@/lib/calendar'
import { PSY_PRICING as PRICING } from '@/lib/psy'
import { usePublicClinic, CardChooser } from '@/components/PsyPublic'
import { onlineAvailable, offlineAvailable } from '@/lib/psy'
import type { PaymentCardInfo } from '@/lib/psy'
import { DialogHost, uiAlert, uiConfirm, uiPrompt } from '@/components/ui/Dialog'

type Step = 1 | 2 | 3 | 'pay' | 'done'

const CHILD_CONDITIONS = [
  'لکنت','اختلال گویایی','اختلال شنوایی','اختلال بینایی',
  'زودرنجی','حسادت','لج‌بازی','نافرمانی',
  'ناخن جویدن','استرس و اضطراب','وسواس','شب‌ادراری',
  'وابستگی','ترس از پدر یا مادر','عدم اعتماد به نفس'
]

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
  const [form, setForm] = useState({
    parentName: '', phone: '', childName: '', birthDate: '', grade: '',
    fatherName: '', fatherEducation: '', fatherJob: '', fatherPhone: '',
    motherName: '', motherEducation: '', motherJob: '', motherPhone: '',
    homeAddress: '',
    hasSiblings: '', siblingsInfo: '',
    otherResidents: '', otherResidentsInfo: '',
    familyStatus: [] as string[],
    childConditions: [] as string[],
    pregnancyAge: '', pregnancyCount: '', pregnancyStress: '', pregnancyDepression: '', pregnancyIssues: '', pregnancyAbortion: '', pregnancyNone: '',
    birthType: '', birthWeight: '',
    growthCrawl: '', growthCrawlDuration: '', growthWalk4: '', growthWalk4Duration: '', growthWalkAge: '', growthTalkAge: '', growthIssues: '',
    seizureHistory: '', currentMeds: '',
    schoolName: '', schoolInstitute: '', schoolGrade: '', schoolPhone: '',
    sportsActivity: '', sportsLimit: '',
    fatherBehavior: '', motherBehavior: '', mainSupervisor: '',
    extraNotes: '', reason: '', prevVisit: ''
  })

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

  function toggleCondition(c: string) {
    setForm(f => {
      if (c === 'هیچ‌کدام') return { ...f, childConditions: f.childConditions.includes('هیچ‌کدام') ? [] : ['هیچ‌کدام'] }
      const base = f.childConditions.filter(x => x !== 'هیچ‌کدام')
      return { ...f, childConditions: base.includes(c) ? base.filter(x => x !== c) : [...base, c] }
    })
  }

  function toggleFamilyStatus(c: string) {
    setForm(f => {
      if (c === 'هیچ‌کدام') return { ...f, familyStatus: f.familyStatus.includes('هیچ‌کدام') ? [] : ['هیچ‌کدام'] }
      const base = f.familyStatus.filter(x => x !== 'هیچ‌کدام')
      return { ...f, familyStatus: base.includes(c) ? base.filter(x => x !== c) : [...base, c] }
    })
  }

  // اعتبارسنجی: همه‌ی موارد الزامی هستند (به‌جز «مواردِ دیگر» که اختیاری است)
  function missingFields(): string[] {
    const f: any = form
    const miss: string[] = []
    const reqText: [string, string][] = [
      ['childName', 'نام کودک'], ['birthDate', 'تاریخ تولد'], ['grade', 'پایه تحصیلی'], ['reason', 'دلیل مراجعه'],
      ['fatherName', 'نام پدر'], ['fatherPhone', 'تماس پدر'], ['fatherEducation', 'تحصیلات پدر'], ['fatherJob', 'شغل پدر'],
      ['motherName', 'نام مادر'], ['motherPhone', 'تماس مادر'], ['motherEducation', 'تحصیلات مادر'], ['motherJob', 'شغل مادر'],
      ['homeAddress', 'آدرس خانه'],
      ['pregnancyAge', 'سن مادر هنگام بارداری'], ['pregnancyCount', 'تعداد بارداری'], ['birthWeight', 'وزن تولد'],
      ['growthWalkAge', 'سن راه رفتن'], ['growthTalkAge', 'سن اولین کلمه'], ['growthIssues', 'مشکل مراحل رشد'],
      ['currentMeds', 'داروهای مصرفی'], ['sportsActivity', 'فعالیت ورزشی'], ['sportsLimit', 'محدودیت ورزشی'],
      ['fatherBehavior', 'رفتار پدر'], ['motherBehavior', 'رفتار مادر'], ['mainSupervisor', 'نظارت‌کننده'],
    ]
    for (const [k, label] of reqText) if (!String(f[k] || '').trim()) miss.push(label)
    const reqSel: [string, string][] = [
      ['prevVisit', 'سابقه مراجعه'], ['birthType', 'نوع زایمان'], ['growthCrawl', 'سینه‌خیز'],
      ['growthWalk4', 'چهار دست و پا'], ['seizureHistory', 'سابقه غش‌وتشنج'],
      ['hasSiblings', 'خواهر/برادر'], ['otherResidents', 'عضو دیگرِ خانواده'],
    ]
    for (const [k, label] of reqSel) if (!f[k]) miss.push(label)
    if (f.hasSiblings === 'بله' && !f.siblingsInfo.trim()) miss.push('سن و تحصیلاتِ خواهر/برادر')
    if (f.otherResidents === 'بله' && !f.otherResidentsInfo.trim()) miss.push('مشخصاتِ عضوِ دیگر')
    if (f.growthCrawl === 'بله' && !f.growthCrawlDuration.trim()) miss.push('مدتِ سینه‌خیز')
    if (f.growthWalk4 === 'بله' && !f.growthWalk4Duration.trim()) miss.push('مدتِ چهار دست و پا')
    if (f.familyStatus.length === 0) miss.push('وضعیت خانوادگی')
    if (f.childConditions.length === 0) miss.push('وضعیت جسمی و روحی')
    if (!(f.pregnancyStress || f.pregnancyDepression || f.pregnancyIssues || f.pregnancyAbortion || f.pregnancyNone))
      miss.push('موارد دوران بارداری')
    return miss
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
        body: JSON.stringify({ ...form, sessionType, officeLocation: officeLoc, resourceId: selectedDoctorId || undefined })
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
        body: JSON.stringify({ case_number: caseNumber, phone: form.fatherPhone || form.motherPhone, stage: 'interview', payment_ref: ref })
      })
      if (res.ok) setStep('done')
      else uiAlert('ثبتِ پرداخت ناموفق بود')
    } catch { uiAlert('خطا در ارتباط با سرور') }
    setLoading(false)
  }

  if (step === 'pay') return <InterviewPayScreen amount={PRICING.interview} cards={settings.cards} loaded={settings.loaded} loading={loading} onPay={submitInterviewPayment} />

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

        {/* Step 3 - فرم کامل */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4 space-y-6">
            {/* خلاصه */}
            <div className="bg-brand-50 rounded-xl p-3 text-sm">
              <div className="flex justify-between text-gray-600 mb-1">
                <span>نوع جلسه</span><span className="font-medium">{sessionType === 'online' ? 'آنلاین 🎥' : `حضوری 🏥${officeLoc ? ` — ${officeLoc}` : ''}`}</span>
              </div>
              <div className="flex justify-between border-t border-brand-100 pt-2 mt-2">
                <span className="font-medium">هزینه‌ی مصاحبه‌ی اولیه</span><span className="font-medium text-brand-600">{PRICING.interview.toLocaleString()} تومان</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 text-center">
              لطفاً همه‌ی موارد را کامل کنید — همه‌ی فیلدها الزامی هستند.
            </div>

            {/* اطلاعات دانش‌آموز */}
            <Section title="اطلاعات کودک">
              <div className="grid grid-cols-2 gap-3">
                <Field label="نام و نام خانوادگی *" value={form.childName} onChange={v => setForm({...form, childName: v})} placeholder="آرین رضایی" />
                <Field label="تاریخ تولد" value={form.birthDate} onChange={v => setForm({...form, birthDate: v})} placeholder="۱۳۹۷/۰۴/۱۵" />
                <Field label="پایه تحصیلی" value={form.grade} onChange={v => setForm({...form, grade: v})} placeholder="پیش‌دبستانی" />
                <Field label="دلیل مراجعه *" value={form.reason} onChange={v => setForm({...form, reason: v})} placeholder="به طور مختصر..." />
              </div>
              <div className="mt-3">
                <label className="text-xs text-gray-500 mb-1 block">سابقه مراجعه قبلی</label>
                <select value={form.prevVisit} onChange={e => setForm({...form, prevVisit: e.target.value})}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white">
                  <option value="">انتخاب کنید</option>
                  <option>خیر، اولین بار است</option>
                  <option>بله، قبلاً مراجعه داشتم</option>
                </select>
              </div>
            </Section>

            {/* اطلاعات والدین */}
            <Section title="اطلاعات والدین">
              <p className="text-xs text-gray-400 mb-3">پدر</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Field label="نام *" value={form.fatherName} onChange={v => setForm({...form, fatherName: v})} placeholder="علی" />
                <Field label="شماره تماس *" value={form.fatherPhone} onChange={v => setForm({...form, fatherPhone: v})} placeholder="۰۹۱۲..." dir="ltr" />
                <Field label="تحصیلات" value={form.fatherEducation} onChange={v => setForm({...form, fatherEducation: v})} placeholder="لیسانس" />
                <Field label="شغل" value={form.fatherJob} onChange={v => setForm({...form, fatherJob: v})} placeholder="مهندس" />
              </div>
              <p className="text-xs text-gray-400 mb-3">مادر</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="نام *" value={form.motherName} onChange={v => setForm({...form, motherName: v})} placeholder="مریم" />
                <Field label="شماره تماس *" value={form.motherPhone} onChange={v => setForm({...form, motherPhone: v})} placeholder="۰۹۱۲..." dir="ltr" />
                <Field label="تحصیلات" value={form.motherEducation} onChange={v => setForm({...form, motherEducation: v})} placeholder="دیپلم" />
                <Field label="شغل" value={form.motherJob} onChange={v => setForm({...form, motherJob: v})} placeholder="خانه‌دار" />
              </div>
            </Section>

            {/* خواهر/برادر و محل زندگی */}
            <Section title="خواهر/برادر و محل زندگی">
              <label className="text-xs text-gray-500 mb-1 block">آیا خواهر یا برادر دارد؟ *</label>
              <div className="flex gap-2 mb-3">
                {['بله','خیر'].map(v => (
                  <button key={v} type="button" onClick={() => setForm({...form, hasSiblings: v, siblingsInfo: v === 'خیر' ? '' : form.siblingsInfo})}
                    className={`px-4 py-1.5 text-sm rounded-lg border ${form.hasSiblings === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>{v}</button>
                ))}
              </div>
              {form.hasSiblings === 'بله' && (
                <Field label="سن و تحصیلاتِ هر خواهر/برادر *" value={form.siblingsInfo} onChange={v => setForm({...form, siblingsInfo: v})} placeholder="مثلاً: خواهر ۱۰ ساله کلاس چهارم، برادر ۵ ساله مهدکودک" textarea />
              )}

              <label className="text-xs text-gray-500 mb-1 block mt-4">آیا عضو دیگری به‌جز اعضای اصلیِ خانواده با شما زندگی می‌کند؟ *</label>
              <div className="flex gap-2 mb-3">
                {['بله','خیر'].map(v => (
                  <button key={v} type="button" onClick={() => setForm({...form, otherResidents: v, otherResidentsInfo: v === 'خیر' ? '' : form.otherResidentsInfo})}
                    className={`px-4 py-1.5 text-sm rounded-lg border ${form.otherResidents === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>{v}</button>
                ))}
              </div>
              {form.otherResidents === 'بله' && (
                <Field label="چه کسی؟ (مثلاً پدربزرگ، مادربزرگ) *" value={form.otherResidentsInfo} onChange={v => setForm({...form, otherResidentsInfo: v})} placeholder="مثلاً: پدربزرگ" />
              )}

              <div className="mt-4">
                <Field label="آدرس خانه *" value={form.homeAddress} onChange={v => setForm({...form, homeAddress: v})} placeholder="آدرس کامل محل سکونت..." textarea />
              </div>
            </Section>

            {/* وضعیت خانوادگی */}
            <Section title="وضعیت خانوادگی">
              <div className="flex flex-wrap gap-2">
                {['فوت پدر','فوت مادر','طلاق','ازدواج مجدد پدر','ازدواج مجدد مادر','بیماری جسمی در خانواده','هیچ‌کدام'].map(c => (
                  <button key={c} type="button" onClick={() => toggleFamilyStatus(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${form.familyStatus.includes(c) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </Section>

            {/* وضعیت جسمی و روحی */}
            <Section title="وضعیت جسمی و روحی کودک">
              <p className="text-xs text-gray-400 mb-3">موارد موجود را انتخاب کنید</p>
              <div className="flex flex-wrap gap-2">
                {[...CHILD_CONDITIONS, 'هیچ‌کدام'].map(c => (
                  <button key={c} type="button" onClick={() => toggleCondition(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${form.childConditions.includes(c) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </Section>

            {/* اطلاعات بارداری */}
            <Section title="دوران بارداری مادر">
              <div className="grid grid-cols-2 gap-3">
                <Field label="سن مادر هنگام بارداری" value={form.pregnancyAge} onChange={v => setForm({...form, pregnancyAge: v})} placeholder="۲۸" />
                <Field label="تعداد دفعات بارداری" value={form.pregnancyCount} onChange={v => setForm({...form, pregnancyCount: v})} placeholder="۲" />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {['استرس','افسردگی','مشکلات خانوادگی','سابقه سقط'].map(c => (
                  <button key={c} type="button"
                    onClick={() => {
                      const key = c === 'استرس' ? 'pregnancyStress' : c === 'افسردگی' ? 'pregnancyDepression' : c === 'مشکلات خانوادگی' ? 'pregnancyIssues' : 'pregnancyAbortion'
                      setForm(f => ({...f, pregnancyNone: '', [key]: f[key as keyof typeof f] ? '' : c}))
                    }}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      (c === 'استرس' && form.pregnancyStress) || (c === 'افسردگی' && form.pregnancyDepression) ||
                      (c === 'مشکلات خانوادگی' && form.pregnancyIssues) || (c === 'سابقه سقط' && form.pregnancyAbortion)
                        ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>
                    {c}
                  </button>
                ))}
                <button type="button"
                  onClick={() => setForm(f => ({...f, pregnancyStress: '', pregnancyDepression: '', pregnancyIssues: '', pregnancyAbortion: '', pregnancyNone: f.pregnancyNone ? '' : 'هیچ‌کدام'}))}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${form.pregnancyNone ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>
                  هیچ‌کدام
                </button>
              </div>
            </Section>

            {/* زایمان */}
            <Section title="زایمان و تولد">
              <div className="flex gap-2 mb-3">
                {['طبیعی','سزارین'].map(t => (
                  <button key={t} type="button" onClick={() => setForm({...form, birthType: t})}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-all ${form.birthType === t ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>
                    {t}
                  </button>
                ))}
              </div>
              <Field label="وزن هنگام تولد (گرم)" value={form.birthWeight} onChange={v => setForm({...form, birthWeight: v})} placeholder="۳۲۰۰" />
            </Section>

            {/* مراحل رشد */}
            <Section title="مراحل رشد کودک">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-32">سینه‌خیز رفته؟</span>
                  <div className="flex gap-2">
                    {['بله','خیر'].map(v => (
                      <button key={v} type="button" onClick={() => setForm({...form, growthCrawl: v})}
                        className={`px-3 py-1 text-xs rounded-lg border ${form.growthCrawl === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>{v}</button>
                    ))}
                  </div>
                  {form.growthCrawl === 'بله' && (
                    <Field label="" value={form.growthCrawlDuration} onChange={v => setForm({...form, growthCrawlDuration: v})} placeholder="چه مدت؟" />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-32">چهار دست و پا؟</span>
                  <div className="flex gap-2">
                    {['بله','خیر'].map(v => (
                      <button key={v} type="button" onClick={() => setForm({...form, growthWalk4: v})}
                        className={`px-3 py-1 text-xs rounded-lg border ${form.growthWalk4 === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>{v}</button>
                    ))}
                  </div>
                  {form.growthWalk4 === 'بله' && (
                    <Field label="" value={form.growthWalk4Duration} onChange={v => setForm({...form, growthWalk4Duration: v})} placeholder="چه مدت؟" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="سن راه رفتن" value={form.growthWalkAge} onChange={v => setForm({...form, growthWalkAge: v})} placeholder="۱۲ ماه" />
                  <Field label="سن اولین کلمه" value={form.growthTalkAge} onChange={v => setForm({...form, growthTalkAge: v})} placeholder="۱۸ ماه" />
                </div>
                <Field label="مشکل خاص در مراحل رشد" value={form.growthIssues} onChange={v => setForm({...form, growthIssues: v})} placeholder="در صورت وجود توضیح دهید..." />
              </div>
            </Section>

            {/* اطلاعات پزشکی */}
            <Section title="اطلاعات پزشکی">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">سابقه غش‌تشنج؟</span>
                  <div className="flex gap-2">
                    {['بله','خیر'].map(v => (
                      <button key={v} type="button" onClick={() => setForm({...form, seizureHistory: v})}
                        className={`px-3 py-1 text-xs rounded-lg border ${form.seizureHistory === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500'}`}>{v}</button>
                    ))}
                  </div>
                </div>
                <Field label="داروهای در حال مصرف" value={form.currentMeds} onChange={v => setForm({...form, currentMeds: v})} placeholder="نام دارو و دوز..." />
              </div>
            </Section>



            {/* ورزش */}
            <Section title="فعالیت ورزشی">
              <div className="grid grid-cols-2 gap-3">
                <Field label="نوع و زمان فعالیت" value={form.sportsActivity} onChange={v => setForm({...form, sportsActivity: v})} placeholder="فوتبال، ۲ روز در هفته" />
                <Field label="محدودیت ورزشی" value={form.sportsLimit} onChange={v => setForm({...form, sportsLimit: v})} placeholder="در صورت وجود..." />
              </div>
            </Section>

            {/* رفتار والدین */}
            <Section title="رفتار والدین با فرزند">
              <div className="space-y-3">
                <Field label="رفتار پدر با فرزند" value={form.fatherBehavior} onChange={v => setForm({...form, fatherBehavior: v})} placeholder="توضیح دهید..." />
                <Field label="رفتار مادر با فرزند" value={form.motherBehavior} onChange={v => setForm({...form, motherBehavior: v})} placeholder="توضیح دهید..." />
                <Field label="چه کسی بیشتر نظارت دارد؟" value={form.mainSupervisor} onChange={v => setForm({...form, mainSupervisor: v})} placeholder="پدر / مادر / پدربزرگ..." />
              </div>
            </Section>

            {/* توضیحات */}
            <Section title="موارد دیگر">
              <Field label="مواردی که می‌خواهید دکتر بداند" value={form.extraNotes} onChange={v => setForm({...form, extraNotes: v})} placeholder="هر نکته‌ای که فکر می‌کنید مهم است..." textarea />
            </Section>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(1)} className="px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">برگشت</button>
              <button
                disabled={loading || missingFields().length > 0}
                onClick={handleSubmit}
                className="flex-1 py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-brand-800 transition-colors">
                {loading ? 'در حال ثبت...' : 'ادامه به پرداخت ←'}
              </button>
            </div>
          </div>
        )}
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
function InterviewPayScreen({ amount, cards, loaded, loading, onPay }: { amount: number; cards: PaymentCardInfo[]; loaded: boolean; loading: boolean; onPay: (ref: string) => void }) {
  const [ref, setRef] = useState('')
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <DialogHost />
      <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-100 p-6">
        <div className="text-center mb-4">
          <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3 text-3xl">💳</div>
          <h1 className="text-lg font-medium text-gray-900">پرداختِ هزینه‌ی مصاحبه</h1>
          <p className="text-xs text-gray-500 mt-1">مبلغ را کارت‌به‌کارت کنید و سپس «پرداخت کردم» را بزنید.</p>
        </div>

        <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">مبلغ قابل پرداخت</span>
            <span className="text-base font-bold text-brand-700">{amount.toLocaleString()} تومان</span>
          </div>
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
      </div>
    </div>
  )
}