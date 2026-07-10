'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { PERSIAN_MONTHS, PERSIAN_WEEKDAYS, toFarsiNum, getCurrentJalali, getDaysInJalaliMonth, jalaliDateTimeToTimestamp } from '@/lib/calendar'
import { PSY_PRICING as PRICING, DEFAULT_CANCELLATION_POLICY } from '@/lib/psy'
import { usePublicClinic, usePatientFeatures, CardChooser } from '@/components/PsyPublic'
import { STAGE_TYPE_LABEL } from '@/lib/flow'
import { DialogHost, uiAlert, uiConfirm } from '@/components/ui/Dialog'
import { useResendCooldown } from '@/lib/useResendCooldown'

type CaseStage = {
 id: string; case_number: string
 stage_type: 'interview' | 'assessment'
 status: 'awaiting_payment' | 'payment_submitted' | 'awaiting_booking' | 'booked'
 price: number; paid: boolean; payment_submitted?: boolean; payment_ref?: string
 session_date?: string; session_time?: string; held?: boolean
 cancel_notice?: string; payment_reject_reason?: string; meet_link?: string; resource_id?: string | null; created_at: string
 delay_minutes?: number | null
}

type Booking = {
 id: string; case_number: string; client_name: string; birth_date: string
 grade: string; contact_name: string; contact2_name: string
 contact_phone: string; contact2_phone: string; status: string
 reject_reason?: string
 current_stage_id?: string | null
 resource_id?: string | null
 session_type?: 'online' | 'offline'; office_location?: string
}
type Package = {
 id: string; case_number: string; month: string; year: string
 primary_sessions: number; secondary_sessions: number
 primary_session_type: string; secondary_session_type: string
 notes: string; paid: boolean; payment_submitted?: boolean; status: string
 price?: number; payment_reject_reason?: string
 resource_id?: string | null
}
type Session = {
 id: string; package_id: string; session_number: number; title?: string
 session_date: string; session_time: string; session_type: string
 attendee: string; status: string; doctor_note_for_patient: string
 paid: boolean; payment_submitted?: boolean
 price?: number; payment_reject_reason?: string; meet_link?: string
 refund_percent?: number; refund_status?: string; refund_card?: string
 resource_id?: string | null
 delay_minutes?: number | null
}

type Step = 'login' | 'otp' | 'panel'

export default function PatientPanel() {
 const { slug } = useParams<{ slug: string }>()
 const router = useRouter()
 const searchParams = useSearchParams()
 const paymentHandled = useRef(false)
 const settings = usePublicClinic(slug)
 const [step, setStep] = useState<Step>('login')
 const [restoring, setRestoring] = useState(true) // تا وقتی localStorage چک شود، به‌جای لاگین اسپلش نشان بده
 const [phone, setPhone] = useState('')
 const [loginMode, setLoginMode] = useState<'phone' | 'email'>('phone')
 const [emailInput, setEmailInput] = useState('')
 const [otpCode, setOtpCode] = useState('')
 const [devCode, setDevCode] = useState('')
 const [loading, setLoading] = useState(false)
 const [error, setError] = useState('')
 const [booking, setBooking] = useState<Booking | null>(null)
 const [packages, setPackages] = useState<Package[]>([])
 const [sessions, setSessions] = useState<Session[]>([])
 const [stages, setStages] = useState<CaseStage[]>([])
 const [activeTab, setActiveTab] = useState<'packages' | 'sessions' | 'info'>('packages')
 const [selectedPkg, setSelectedPkg] = useState<Package | null>(null)
 const [scheduleView, setScheduleView] = useState(false)
 const [showSlotPicker, setShowSlotPicker] = useState(false)
 const resend = useResendCooldown()

 async function sendOtp() {
  if (loginMode === 'email') {
   if (!emailInput || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())) { setError('ایمیل درست نیست'); return }
  } else if (!phone || phone.length < 10) { setError('شماره موبایل درست نیست'); return }
  setLoading(true); setError('')
  const body = loginMode === 'email' ? { email: emailInput.trim() } : { phone }
  const res = await fetch(`/api/t/${slug}/psy/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (data.success) { setDevCode(data.dev_code); setStep('otp'); resend.start() }
  else setError(data.error || 'خطا')
  setLoading(false)
 }

 async function verifyOtp() {
  setLoading(true); setError('')
  const identity = loginMode === 'email' ? emailInput.trim() : phone
  const body = loginMode === 'email' ? { email: identity, code: otpCode } : { phone: identity, code: otpCode }
  const res = await fetch(`/api/t/${slug}/psy/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (data.success) {
   setBooking(data.booking)
   setPhone(identity) // ذخیره‌ی هویت نهایی (شماره یا ایمیل) برای درخواست‌های بعدی — نام state تاریخی است
   await loadData(data.booking.case_number, identity)
   try { localStorage.setItem('pb_phone', identity); localStorage.setItem('pb_case', data.booking.case_number) } catch {}
   setStep('panel')
  }
  else setError(data.error || 'کد اشتباه است')
  setLoading(false)
 }

 // نگه‌داشتن ورود پس از ریلود
 useEffect(() => {
  try {
   const savedPhone = localStorage.getItem('pb_phone')
   const savedCase = localStorage.getItem('pb_case')
   if (!savedPhone || !savedCase) { setRestoring(false); return }
   ;(async () => {
    try {
     const res = await fetch(`/api/t/${slug}/psy/data?case_number=${savedCase}&phone=${savedPhone}`, { cache: 'no-store' })
     if (!res.ok) { try { localStorage.removeItem('pb_phone'); localStorage.removeItem('pb_case') } catch {}; return }
     const data = await res.json()
     if (data.booking) {
      setPhone(savedPhone)
      setBooking(data.booking)
      setPackages(data.packages || [])
      setSessions(data.sessions || [])
      setStages(data.stages || [])
      setStep('panel')
     }
    } finally {
     setRestoring(false)
    }
   })()
  } catch { setRestoring(false) }
 }, [])

 // نتیجه‌ی برگشت از درگاه پرداخت آنلاین (زیبال) — یک بار toast بزن، دیتا را
 // تازه کن، و پارامترها را از URL پاک کن تا با رفرش دوباره تکرار نشود.
 useEffect(() => {
  if (paymentHandled.current) return
  if (step !== 'panel' || !booking) return
  const result = searchParams.get('payment')
  if (!result) return
  paymentHandled.current = true
  if (result === 'success') uiAlert('پرداخت با موفقیت انجام شد.')
  else if (result === 'cancelled') uiAlert('پرداخت لغو شد.')
  else if (result === 'failed') uiAlert('پرداخت تایید نشد. دوباره تلاش کنید یا از کارت‌به‌کارت استفاده کنید.')
  else uiAlert('خطایی در پردازش پرداخت رخ داد.')
  loadData(booking.case_number)
  router.replace(`/${slug}/my`)
 }, [step, booking, searchParams, slug])

 function logout() {
  try { localStorage.removeItem('pb_phone'); localStorage.removeItem('pb_case') } catch {}
  setStep('login'); setBooking(null); setPhone('')
 }

 // اگر این صفحه از bfcache (کش برگشت/جلوی مرورگر) برگردد، React remount
 // نمی‌شود و state دقیقا همان لحظه‌ی خروج «منجمد» می‌ماند. باگ قبلی: دیتا را
 // بی‌سروصدا در پس‌زمینه دوباره می‌خواندیم درحالی‌که همان محتوای منجمد روی
 // صفحه می‌ماند و بعد یهو با دیتای تازه جایگزین می‌شد. فیکس: همان اسپلش
 // «در حال بارگذاری» (restoring) را دوباره نشان می‌دهیم تا این پرش دیده نشود.
 useEffect(() => {
  function onPageShow(e: PageTransitionEvent) {
   if (e.persisted && booking) { setRestoring(true); loadData(booking.case_number).finally(() => setRestoring(false)) }
  }
  window.addEventListener('pageshow', onPageShow)
  return () => window.removeEventListener('pageshow', onPageShow)
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [booking?.case_number])

 async function loadData(case_number: string, phoneNum?: string) {
  const p = phoneNum || phone
  const res = await fetch(`/api/t/${slug}/psy/data?case_number=${case_number}&phone=${p}`, { cache: 'no-store' })
  const data = await res.json()
  if (data.booking) setBooking(data.booking)
  setPackages(data.packages || [])
  setSessions(data.sessions || [])
  setStages(data.stages || [])
 }

 const pkgPrice = (p: Package) =>
  p.price || ((p.primary_sessions * (p.primary_session_type === 'online' ? PRICING.online : PRICING.offline)) +
  (p.secondary_sessions * (p.secondary_session_type === 'online' ? PRICING.online : PRICING.offline)))

 const pkgSessions = (pkgId: string) => sessions.filter(s => s.package_id === pkgId)

 if (restoring) return (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
   <DialogHost />
   <div className="text-center">
    <div className="w-12 h-12 rounded-full bg-sand flex items-center justify-center mx-auto mb-3 text-2xl animate-pulse"></div>
    <p className="text-sm text-soot">در حال بارگذاری...</p>
   </div>
  </div>
 )

 if (step === 'login') return (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
   <DialogHost />
   <div className="bg-white rounded-2xl border border-sand p-8 w-full max-w-sm shadow-sm">
    <div className="text-center mb-6">
     <div className="w-14 h-14 rounded-full bg-sand flex items-center justify-center mx-auto mb-3 text-2xl">🩺</div>
     <h1 className="text-lg font-display font-semibold text-ink">پنل مراجع</h1>
     {settings.loaded
      ? <p className="text-xs text-soot mt-1">مطب {settings.doctor_name}</p>
      : <div className="h-3.5 w-32 mx-auto bg-gray-100 rounded animate-pulse mt-2" />}
    </div>
    <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
     {(['phone', 'email'] as const).map(m => (
      <button key={m} onClick={() => { setLoginMode(m); setError('') }}
       className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${loginMode === m ? 'bg-white text-ink shadow-sm' : 'text-soot'}`}>
       {m === 'phone' ? 'شماره موبایل' : 'ایمیل'}
      </button>
     ))}
    </div>
    <div className="mb-4">
     {loginMode === 'phone' ? (
      <>
       <label className="text-xs text-soot mb-1.5 block">شماره موبایل</label>
       <input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendOtp()}
        placeholder="09123456789" dir="ltr"
        className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl text-center tracking-widest focus:outline-none focus:border-ink" />
      </>
     ) : (
      <>
       <label className="text-xs text-soot mb-1.5 block">ایمیل</label>
       <input value={emailInput} onChange={e => setEmailInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendOtp()}
        placeholder="example@gmail.com" dir="ltr"
        className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl text-center focus:outline-none focus:border-ink" />
       <p className="text-[11px] text-soot mt-1.5">برای مراجعین خارج از ایران — اگر ایمیلت را موقع ثبت‌نام داده باشی.</p>
      </>
     )}
    </div>
    {error && <p className="text-xs text-red-600 mb-3 text-center">{error}</p>}
    <button onClick={sendOtp} disabled={loading}
     className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
     {loading ? 'در حال ارسال...' : 'دریافت کد تایید'}
    </button>
   </div>
  </div>
 )

 if (step === 'otp') return (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
   <DialogHost />
   <div className="bg-white rounded-2xl border border-sand p-8 w-full max-w-sm shadow-sm">
    <div className="text-center mb-6">
     <div className="w-14 h-14 rounded-full bg-sand flex items-center justify-center mx-auto mb-3 text-2xl">📱</div>
     <h1 className="text-lg font-display font-semibold text-ink">کد تایید</h1>
     <p className="text-xs text-soot mt-1">کد ارسال شده به {loginMode === 'email' ? emailInput : phone} را وارد کنید</p>
     {devCode && (
      <div className="mt-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
       <p className="text-xs text-amber-700">کد تست: <strong className="font-mono text-base">{devCode}</strong></p>
      </div>
     )}
    </div>
    <input value={otpCode} onChange={e => setOtpCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && verifyOtp()}
     placeholder="12345" dir="ltr" maxLength={5}
     className="w-full text-xl px-3 py-3 border border-sand rounded-xl text-center tracking-[0.5em] focus:outline-none focus:border-ink mb-3" />
    {error && <p className="text-xs text-red-600 mb-3 text-center">{error}</p>}
    <button onClick={verifyOtp} disabled={loading || otpCode.length < 5}
     className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
     {loading ? 'در حال بررسی...' : 'ورود به پنل'}
    </button>
    <div className="text-center mt-3">
     {resend.canResend ? (
      <button onClick={sendOtp} disabled={loading} className="text-sm text-ink font-medium hover:underline disabled:opacity-40">
       ارسال دوباره‌ی کد
      </button>
     ) : (
      <p className="text-xs text-soot">کد نیامد؟ تا <span className="tnum font-medium text-ink">{toFarsiNum(resend.secondsLeft)}</span> ثانیه‌ی دیگر می‌توانی دوباره درخواست کنی</p>
     )}
    </div>
    <button onClick={() => { setStep('login'); setError(''); setOtpCode('') }}
     className="w-full py-2 mt-1 text-sm text-soot">تغییر شماره</button>
   </div>
  </div>
 )

 if (!booking) return null

 // مراجعی که هنوز وارد مرحله‌ی درمان نشده، وضعیت مرحله‌ی فعلی‌اش را می‌بیند.
 // مرحله‌ی جاری (اگر باشد) از current_stage_id پیدا می‌شود؛ اگر نبود یعنی یا
 // منتظر تصمیم دکتر برای مرحله‌ی بعد است، یا وارد فاز پروتکل درمان شده.
 const currentStage = stages.find(s => s.id === booking.current_stage_id) || null
 const isRejected = booking.status === 'cancelled' && !!booking.reject_reason
 const inTreatment = !currentStage && packages.length > 0

 if (!inTreatment) return (
  <div className="min-h-screen bg-gray-50" dir="rtl">
   <DialogHost />
   <div className="bg-white border-b border-sand px-4 py-3 sticky top-0 z-10">
    <div className="max-w-lg mx-auto flex items-center justify-between">
     <div>
      <h1 className="text-sm font-display font-semibold text-ink">{booking.client_name}</h1>
      <div className="flex items-center gap-2 flex-wrap">
       <span className="text-xs text-soot">پرونده:</span>
       <span className="text-xs font-mono text-ink bg-sand px-2 py-0.5 rounded">{booking.case_number}</span>
       {booking.session_type && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-soot">
         {booking.session_type === 'online' ? '🎥 آنلاین' : `🏥 حضوری${booking.office_location ? ` — ${booking.office_location}` : ''}`}
        </span>
       )}
      </div>
     </div>
     <button onClick={logout}
      className="text-xs text-soot border border-sand rounded-lg px-3 py-1.5">خروج</button>
    </div>
   </div>

   <div className="max-w-lg mx-auto p-4 space-y-3">
    {/* نوار پیشرفت مراحل */}
    <StageProgress stages={stages} inTreatment={inTreatment} />

    <div className="bg-white rounded-2xl border border-sand p-6 text-center">
     {isRejected ? (
      <>
       <StageHero icon="❌" title="تأیید نشد" desc="متأسفانه پس از بررسی، امکان ادامه‌ی فرایند درمان فراهم نشد." red />
       <div className="bg-gray-100 border border-sand rounded-xl p-3 text-sm text-ink text-right">
        <span className="font-medium">دلیل: </span>{booking.reject_reason}
       </div>
      </>
     ) : !currentStage ? (
      <StageWaiting title="منتظر تعیین مرحله‌ی بعد" desc="دکتر به‌زودی مرحله‌ی بعد روند درمان را برای شما مشخص می‌کند." />
     ) : currentStage.status === 'awaiting_payment' ? (
      <>
       {currentStage.payment_reject_reason && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-700 text-right mb-3">
         <span className="font-medium">پرداخت قبلی تأیید نشد — </span>{currentStage.payment_reject_reason}
        </div>
       )}
       <StagePayment
        icon={currentStage.stage_type === 'assessment' ? '' : ''}
        title={`هزینه‌ی ${STAGE_TYPE_LABEL[currentStage.stage_type] || ''}`}
        desc="برای ادامه، هزینه‌ی این مرحله را پرداخت کنید. پس از تأیید پرداخت، می‌توانید وقت بگیرید."
        amount={currentStage.price || (booking.session_type === 'online' ? PRICING.online : PRICING.offline)}
        resourceId={booking.resource_id} caseNumber={booking.case_number} phone={phone} stageId={currentStage.id}
        onPaid={async (ref) => {
         const res = await fetch(`/api/t/${slug}/psy/pay`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ case_number: booking.case_number, phone, stage_id: currentStage.id, payment_ref: ref })
         })
         return res.ok
        }}
        onDone={() => loadData(booking.case_number)} />
      </>
     ) : currentStage.status === 'payment_submitted' ? (
      <StageWaiting title="در انتظار تأیید پرداخت" desc="پرداخت شما ثبت شد و در حال بررسی است. پس از تأیید، اینجا می‌توانید وقت بگیرید." />
     ) : currentStage.status === 'awaiting_booking' ? (
      <>
       {currentStage.cancel_notice && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-700 text-right mb-3">
         ⚠️ {currentStage.cancel_notice}
        </div>
       )}
       <StageHero icon={currentStage.cancel_notice ? '🗓' : '✅'} title={currentStage.cancel_notice ? 'انتخاب زمان جدید' : 'پرداخت تأیید شد!'}
        desc={`می‌توانید وقت ${STAGE_TYPE_LABEL[currentStage.stage_type] || ''} را انتخاب کنید.`} />
       <button onClick={() => setShowSlotPicker(true)}
        className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium hover:bg-ink/90">
        گرفتن وقت
       </button>
      </>
     ) : (
      <StageInfo icon="📅" title="وقت ثبت شد"
       desc="منتظر برگزاری باشید. پس از آن، دکتر مرحله‌ی بعد را مشخص می‌کند."
       date={currentStage.session_date} time={currentStage.session_time}
       label={`وقت ${STAGE_TYPE_LABEL[currentStage.stage_type] || ''}`}
       delayMinutes={currentStage.delay_minutes}
       meetLink={booking.session_type === 'online' ? (currentStage.meet_link || settings.doctors.find(d => d.id === booking.resource_id)?.meet_link) : undefined} />
     )}

     <button onClick={() => loadData(booking.case_number)}
      className="mt-5 text-xs text-ink border border-sand rounded-lg px-4 py-2">بررسی مجدد وضعیت</button>
    </div>
   </div>

   {showSlotPicker && currentStage && (
    <SlotPicker phone={phone} caseNumber={booking.case_number}
     title={`انتخاب وقت ${STAGE_TYPE_LABEL[currentStage.stage_type] || ''}`} resourceId={booking.resource_id}
     sessionType={booking.session_type} officeLocation={booking.office_location}
     onClose={() => setShowSlotPicker(false)}
     onDone={() => { setShowSlotPicker(false); loadData(booking.case_number) }}
     onConfirm={async (date: string, time: string) => {
      const res = await fetch(`/api/t/${slug}/psy/stage-book`, {
       method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ case_number: booking.case_number, phone, stage_id: currentStage.id, session_date: date, session_time: time })
      })
      const d = await res.json().catch(() => ({}))
      return { ok: res.ok, error: d.error as string | undefined }
     }} />
   )}
  </div>
 )

 return (
  <div className="min-h-screen bg-gray-50" dir="rtl">
   <DialogHost />
   <div className="bg-white border-b border-sand px-4 py-3 sticky top-0 z-10">
    <div className="max-w-lg mx-auto flex items-center justify-between">
     <div>
      <h1 className="text-sm font-display font-semibold text-ink">{booking.client_name}</h1>
      <div className="flex items-center gap-2">
       <span className="text-xs text-soot">پرونده:</span>
       <span className="text-xs font-mono text-ink bg-sand px-2 py-0.5 rounded">{booking.case_number}</span>
      </div>
     </div>
     <button onClick={logout}
      className="text-xs text-soot border border-sand rounded-lg px-3 py-1.5">خروج</button>
    </div>
   </div>

   <div className="max-w-lg mx-auto p-4">
    <div className="flex bg-white rounded-xl border border-sand p-1 mb-4">
     {(['packages', 'sessions', 'info'] as const).map(t => (
      <button key={t} onClick={() => setActiveTab(t)}
       className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${activeTab === t ? 'bg-ink text-white' : 'text-soot'}`}>
       {t === 'packages' ? 'پروتکل‌های درمان' : t === 'sessions' ? 'جلسات' : 'اطلاعات'}
      </button>
     ))}
    </div>

    {/* PACKAGES TAB */}
    {activeTab === 'packages' && (
     <div className="space-y-3">
      {packages.length === 0 ? (
       <div className="text-center py-12 bg-white rounded-xl border border-sand text-soot">
        <div className="text-3xl mb-2">📦</div>
        <p className="text-sm">هنوز پروتکلی تعریف نشده</p>
        <p className="text-xs mt-1">دکتر به زودی پروتکل درمانی شما را تنظیم می‌کند</p>
       </div>
      ) : packages.map(pkg => {
       const total = pkgPrice(pkg)
       const booked = pkgSessions(pkg.id).length
       const total_sessions = pkg.primary_sessions + pkg.secondary_sessions
       return (
        <div key={pkg.id} className="bg-white rounded-xl border border-sand p-4">
         <div className="flex items-start justify-between mb-3">
          <div>
           <h3 className="font-display font-semibold text-ink">{PERSIAN_MONTHS[parseInt(pkg.month) - 1]} {pkg.year}</h3>
           <div className="text-xs text-soot mt-0.5">
            {pkg.primary_sessions} جلسه‌ی مراجع{pkg.secondary_sessions > 0 && ` + ${pkg.secondary_sessions} جلسه‌ی ${settings.doctors.find(d => d.id === booking.resource_id)?.companion_label || 'همراه'}`}
           </div>
          </div>
          <div className="text-left">
           <div className="text-sm font-bold text-ink">{total.toLocaleString()} تومان</div>
           <div className={`text-xs mt-0.5 font-medium ${pkg.paid ? 'text-emerald-600' : 'text-amber-600'}`}>
            {pkg.paid ? '✓ پرداخت تأیید شد' : pkg.payment_submitted ? 'در انتظار تأیید' : 'در انتظار پرداخت'}
           </div>
          </div>
         </div>

         {pkg.notes && (
          <div className="bg-gray-100 rounded-lg p-2.5 border border-sand mb-3">
           <p className="text-xs text-soot mb-0.5">پروتکل درمانی:</p>
           <p className="text-sm text-ink">{pkg.notes}</p>
          </div>
         )}

         {!pkg.paid && pkg.payment_reject_reason && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 mb-3 text-right">
           <p className="text-xs text-red-700"><span className="font-medium">پرداخت قبلی تأیید نشد — </span>{pkg.payment_reject_reason}</p>
          </div>
         )}

         <div className="flex items-center justify-between text-xs text-soot mb-3">
          <span>{booked} از {total_sessions} جلسه انتخاب شده</span>
          <div className="flex-1 mx-3 bg-gray-100 rounded-full h-1.5">
           <div className="bg-ink h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (booked/total_sessions)*100)}%` }} />
          </div>
         </div>

         {!pkg.paid ? (
          !pkg.payment_submitted ? (
           <PayButton pkg={pkg} phone={phone} onSuccess={() => loadData(booking.case_number)} total={total} />
          ) : (
           <div className="text-center py-2 text-xs text-amber-600 bg-amber-500/10 rounded-xl border border-amber-500/20">پرداخت ثبت شد — در انتظار تأیید</div>
          )
         ) : booked < total_sessions ? (
          <button onClick={() => { setSelectedPkg(pkg); setScheduleView(true) }}
           className="w-full py-2.5 border-2 border-ink text-ink rounded-xl text-sm font-medium hover:bg-sand">
           انتخاب روزهای جلسات ({toFarsiNum(total_sessions - booked)} باقی‌مانده)
          </button>
         ) : (
          <div className="text-center py-2 text-xs text-emerald-600 bg-emerald-500/10 rounded-xl border border-emerald-500/20">✓ همه‌ی جلسات انتخاب شد</div>
         )}
        </div>
       )
      })}
     </div>
    )}

    {/* SESSIONS TAB */}
    {activeTab === 'sessions' && (
     <div className="space-y-3">
      {sessions.length === 0 ? (
       <div className="text-center py-12 bg-white rounded-xl border border-sand text-soot">
        <div className="text-3xl mb-2">🗓</div>
        <p className="text-sm">هنوز جلسه‌ای ثبت نشده</p>
       </div>
      ) : (() => {
       const sorted = [...sessions].sort((a, b) => (a.session_number || 0) - (b.session_number || 0))
       let n = 0
       return sorted.map((s) => {
        const active = s.status !== 'forfeited' && s.status !== 'replaced' && s.status !== 'cancelled'
        const num = active ? ++n : null
        return <SessionCard key={s.id} session={s} num={num} phone={phone} caseNumber={booking.case_number} onUpdate={() => loadData(booking.case_number)} />
       })
      })()}
     </div>
    )}

    {/* INFO TAB */}
    {activeTab === 'info' && (
     <div className="space-y-3">
      <div className="bg-white rounded-xl border border-sand p-4 space-y-3">
       <h3 className="text-sm font-medium text-ink pb-2 border-b border-sand">اطلاعات پرونده</h3>
       {[
        ['نام مراجع', booking.client_name],
        ['تاریخ تولد', booking.birth_date],
        ['پایه تحصیلی', booking.grade],
        ['نام تماس', booking.contact_name],
        [settings.doctors.find(d => d.id === booking.resource_id)?.companion_label || 'همراه', booking.contact2_name],
        ['شماره پرونده', booking.case_number],
       ].map(([label, value]) => value ? (
        <div key={label} className="flex justify-between text-sm border-b border-sand pb-2 last:border-0">
         <span className="text-soot">{label}</span>
         <span className="text-ink font-medium">{value}</span>
        </div>
       ) : null)}
      </div>
      {booking.resource_id && <ReviewBox resourceId={booking.resource_id} caseNumber={booking.case_number} phone={phone} slug={slug} />}
     </div>
    )}
   </div>

   {/* Schedule Picker Modal */}
   {scheduleView && selectedPkg && (
    <SchedulePicker
     pkg={selectedPkg}
     existingSessions={pkgSessions(selectedPkg.id)}
     phone={phone}
     caseNumber={booking.case_number}
     resourceId={booking.resource_id}
     onClose={() => setScheduleView(false)}
     onDone={() => { setScheduleView(false); loadData(booking.case_number) }}
    />
   )}
  </div>
 )
}

// ==================== SESSION CARD ====================
function SessionCard({ session: s, num, phone, caseNumber, onUpdate }: {
 session: Session; num: number | null; phone: string; caseNumber: string; onUpdate: () => void
}) {
 const [cancelling, setCancelling] = useState(false)
 const [showConfirm, setShowConfirm] = useState(false)
 const [refundCard, setRefundCard] = useState('')
 const [showSlot, setShowSlot] = useState(false)
 const [buying, setBuying] = useState(false)
 const [paying, setPaying] = useState(false)
 const [payOpen, setPayOpen] = useState(false)
 const [payRef, setPayRef] = useState('')
 const { slug } = useParams<{ slug: string }>()
 const settings = usePublicClinic(slug)

 const doctorForSession = settings.doctors.find(d => d.id === s.resource_id)
 const sessionPrice = doctorForSession
  ? (s.session_type === 'online' ? doctorForSession.pricing.online : doctorForSession.pricing.offline)
  : (s.session_type === 'online' ? PRICING.online : PRICING.offline)

 async function buyReplacement() {
  setBuying(true)
  const res = await fetch(`/api/t/${slug}/psy/buy-session`, {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ case_number: caseNumber, phone, package_id: null, attendee: s.attendee, session_type: s.session_type, replace_session_id: s.id })
  })
  const data = await res.json().catch(() => ({}))
  setBuying(false)
  if (!res.ok) { uiAlert(data.error || 'خطا در ساخت جلسه‌ی جدید'); return }
  uiAlert('جلسه‌ی جدید ساخته شد. حالا هزینه‌ی آن را پرداخت و سپس زمانش را انتخاب کنید.')
  onUpdate()
 }

 async function paySession() {
  setPaying(true)
  const res = await fetch(`/api/t/${slug}/psy/pay`, {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ session_id: s.id, case_number: caseNumber, phone, payment_ref: payRef.trim() })
  })
  setPaying(false)
  if (!res.ok) { uiAlert('ثبت پرداخت ناموفق بود'); return }
  onUpdate()
 }

 const [onlineLoading, setOnlineLoading] = useState(false)
 async function paySessionOnline() {
  setOnlineLoading(true)
  try {
   const res = await fetch(`/api/t/${slug}/psy/pay-online`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_number: caseNumber, phone, purpose: 'session', ref_id: s.id }),
   })
   const data = await res.json()
   if (data.url) window.location.href = data.url
   else { uiAlert(data.error || 'خطا در اتصال به درگاه'); setOnlineLoading(false) }
  } catch { uiAlert('خطا در ارتباط با سرور'); setOnlineLoading(false) }
 }

 const STATUS_COLOR: Record<string, string> = {
  confirmed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  cancelled: 'bg-red-500/10 text-red-600 border-red-500/20',
  forfeited: 'bg-red-500/10 text-red-600 border-red-500/20',
  replaced: 'bg-gray-100 text-soot border-sand',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  awaiting: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  awaiting_payment: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
 }
 const STATUS_LABEL: Record<string, string> = { confirmed: 'تایید شده', cancelled: 'کنسل شده', forfeited: 'سوخت شده', replaced: 'جایگزین شد', completed: 'برگزار شده', pending: 'در انتظار', awaiting: 'منتظر زمان‌بندی', awaiting_payment: 'منتظر پرداخت' }

 // جلسه‌ای که هنوز پرداخت نشده — فارغ از اینکه تاریخ/ساعتش (توسط دکتر) از قبل ثبت شده باشد یا نه
 const needsPayment = s.status === 'confirmed' && !s.paid
 // جلسه‌ی پرداخت‌شده ولی بدون تاریخ = منتظر انتخاب زمان توسط مراجع
 const needsScheduling = s.status === 'confirmed' && s.paid && (!s.session_date || !s.session_time)
 const isAwaiting = needsScheduling
 const displayStatus = needsScheduling ? 'awaiting' : needsPayment ? 'awaiting_payment' : s.status

 // محاسبه ساعت مانده به جلسه
 function hoursUntil(): number | null {
  const ts = jalaliDateTimeToTimestamp(s.session_date, s.session_time)
  if (ts === null) return null
  return (ts - Date.now()) / (1000 * 60 * 60)
 }

 const hours = hoursUntil()
 const features = usePatientFeatures(slug)
 const policy = settings.doctors.find(d => d.id === s.resource_id)?.cancellation_policy || DEFAULT_CANCELLATION_POLICY
 const canCancel = policy.enabled && s.status === 'confirmed' && hours !== null && hours > 0
 // ≥ threshold_hours مانده → early_refund_percent٪ برمی‌گردد؛ کمتر → late_refund_percent٪
 const isPartial = hours !== null && hours >= policy.threshold_hours
 const refundPercent = isPartial ? policy.early_refund_percent : policy.late_refund_percent
 const refundAmount = Math.round(sessionPrice * refundPercent / 100)
 const needsRefundCard = s.paid && refundPercent > 0

 async function cancelSession() {
  if (needsRefundCard && refundCard.replace(/[^0-9]/g, '').length < 16) {
   uiAlert(`برای بازگشت ${toFarsiNum(refundPercent)}٪ مبلغ، شماره کارت 16 رقمی را کامل وارد کنید.`)
   return
  }
  setCancelling(true)
  const res = await fetch(`/api/t/${slug}/psy/cancel`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ session_id: s.id, case_number: caseNumber, phone, refund_card: needsRefundCard ? refundCard.trim() : '' })
  })
  const data = await res.json().catch(() => ({}))
  setCancelling(false)
  setShowConfirm(false)
  if (!res.ok) { uiAlert(data.error || 'کنسل انجام نشد'); return }
  if (data.outcome === 'unpaid_released')
   uiAlert('جلسه کنسل شد. چون هنوز پرداخت نکرده بودید، مبلغی کسر نشد.')
  else if (data.outcome === 'partial_refund')
   uiAlert(`جلسه کنسل شد. ${toFarsiNum(data.refund_percent ?? refundPercent)}٪ مبلغ (${refundAmount.toLocaleString()} تومان) پس از بررسی به کارت شما بازگردانده می‌شود.`)
  else
   uiAlert('جلسه کنسل شد و کل مبلغ آن سوخت. می‌توانید جلسه‌ی جدیدی خریداری کنید.')
  onUpdate()
 }

 return (
  <div className="bg-white rounded-xl border border-sand p-4">
   <div className="flex items-start justify-between mb-2">
    <div>
     <div className="flex items-center gap-2">
      <span className="font-medium text-sm">{s.title || (num ? `جلسه ${toFarsiNum(num)}` : 'جلسه‌ی سوخته')}</span>
      <span className={`text-xs px-2 py-0.5 rounded border ${s.attendee === 'secondary' ? 'bg-gray-100 text-ink border-sand' : 'bg-gray-100 text-ink border-sand'}`}>
       {s.attendee === 'secondary' ? (doctorForSession?.companion_label || 'همراه') : 'مراجع'}
      </span>
      <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLOR[displayStatus] || STATUS_COLOR.pending}`}>{STATUS_LABEL[displayStatus] || displayStatus}</span>
     </div>
     <div className="text-xs text-soot mt-1">
      {isAwaiting
       ? <span className="text-soot">منتظر انتخاب زمان</span>
       : (s.status === 'forfeited' || s.status === 'replaced')
        ? (s.refund_percent && s.refund_percent > 0
          ? <span className="text-soot">{toFarsiNum(s.refund_percent || 0)}٪ بازپرداخت {s.refund_status === 'done' ? '— واریز شد ' : '— در انتظار بازپرداخت'}</span>
          : <span className="text-red-600">سوخت شد — مبلغ برنگشت</span>)
        : <>{s.session_date} — {s.session_time}</>}
      {' | '}{s.session_type === 'online' ? '🎥 آنلاین' : '🏥 حضوری'}
     </div>
     {!!s.delay_minutes && !isAwaiting && s.status !== 'forfeited' && s.status !== 'replaced' && (
      <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1 mt-1.5 inline-block font-medium">
       ⏱ این جلسه با {s.delay_minutes} دقیقه تاخیر برگزار می‌شود.
      </div>
     )}
     {s.session_type === 'online' && !isAwaiting && s.status !== 'forfeited' && s.status !== 'replaced' && s.session_date && (s.meet_link || doctorForSession?.meet_link) && (
      <a href={s.meet_link || doctorForSession?.meet_link} target="_blank" rel="noopener noreferrer"
       className="text-xs text-white bg-ink rounded-lg px-3 py-1.5 mt-1.5 inline-block font-medium hover:opacity-90">
       ورود به جلسه‌ی گوگل‌میت ↗
      </a>
     )}
    </div>
    {canCancel && (
     <button onClick={() => setShowConfirm(true)}
      className="text-xs px-2.5 py-1 border border-sand text-ink rounded-lg hover:bg-gray-100">
      کنسل
     </button>
    )}
   </div>

   {s.doctor_note_for_patient && (
    <div className="bg-gray-100 rounded-lg p-2.5 border border-sand mt-2">
     <p className="text-xs text-soot mb-0.5">یادداشت دکتر:</p>
     <p className="text-sm text-ink">{s.doctor_note_for_patient}</p>
    </div>
   )}

   {/* دلیل رد پرداخت — فقط تا وقتی جلسه هنوز پرداخت‌نشده نمایش داده می‌شود؛
      با تایید نهایی این ستون صفر می‌شود (سرور) و اینجا خودکار ناپدید می‌شود. */}
   {needsPayment && s.payment_reject_reason && (
    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 mt-2 text-right">
     <p className="text-xs text-red-700"><span className="font-medium">پرداخت قبلی تأیید نشد — </span>{s.payment_reject_reason}</p>
    </div>
   )}

   {/* اقدامات بر اساس وضعیت */}
   {needsScheduling && (
    <button onClick={() => setShowSlot(true)}
     className="w-full mt-3 py-2.5 border-2 border-ink text-ink rounded-xl text-sm font-medium hover:bg-sand">
     انتخاب زمان جلسه
    </button>
   )}
   {needsPayment && s.payment_submitted && (
    <div className="w-full mt-3 py-2.5 text-center text-xs text-ink bg-gray-100 rounded-xl border border-sand">پرداخت ثبت شد — در انتظار تأیید</div>
   )}
   {needsPayment && !s.payment_submitted && (() => {
    const pm = settings.doctors.find(d => d.id === s.resource_id)?.payment_methods
    const onlineOn = !!pm?.online
    const cardOn = pm ? pm.card_to_card : true
    return !payOpen ? (
     <div className="mt-3 flex gap-2">
      {onlineOn && (
       <button onClick={paySessionOnline} disabled={onlineLoading}
        className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
        {onlineLoading ? 'در حال اتصال...' : `پرداخت آنلاین ${sessionPrice.toLocaleString()}`}
       </button>
      )}
      {cardOn && (
       <button onClick={() => setPayOpen(true)}
        className={`py-2.5 rounded-xl text-sm font-medium ${onlineOn ? 'flex-1 border border-gray-300 text-soot' : 'w-full bg-ink text-white'}`}>
        {onlineOn ? 'کارت‌به‌کارت' : `پرداخت کارت‌به‌کارت ${sessionPrice.toLocaleString()} تومان`}
       </button>
      )}
     </div>
    ) : (
     <div className="mt-3 text-right">
      <div className="bg-sand border border-sand rounded-xl p-3 mb-2">
       <CardChooser cards={settings.cards} loaded={settings.loaded} />
      </div>
      <label className="text-xs text-soot mb-1 block">متن فیش واریزی <span className="text-red-500">*</span></label>
      <textarea value={payRef} onChange={e => setPayRef(e.target.value)} rows={2} placeholder="اطلاعات فیش واریزی..."
       className="w-full text-sm px-3 py-2 border border-sand rounded-xl focus:outline-none focus:border-ink mb-2 resize-none" />
      <button onClick={paySession} disabled={paying || !payRef.trim()}
       className="w-full py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
       {paying ? 'در حال ثبت...' : 'پرداخت کردم'}
      </button>
     </div>
    )
   })()}
   {s.status === 'forfeited' && features.patient_buy_extra_session && (
    <button onClick={buyReplacement} disabled={buying}
     className="w-full mt-3 py-2.5 border border-gray-300 text-soot rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
     {buying ? 'در حال ساخت...' : 'خرید جلسه‌ی جایگزین'}
    </button>
   )}

   {showSlot && (
    <SlotPicker session={s} phone={phone} caseNumber={caseNumber} resourceId={s.resource_id}
     onClose={() => setShowSlot(false)}
     onDone={() => { setShowSlot(false); onUpdate() }} />
   )}

   {/* Cancel Confirm */}
   {showConfirm && (
    <div className="mt-3 bg-gray-100 rounded-xl border border-sand p-3">
     <p className="text-sm text-ink mb-1 font-medium">شرایط کنسل را بخوانید</p>
     {!s.paid ? (
      <p className="text-xs text-soot mb-3">
       این جلسه هنوز پرداخت نشده؛ با کنسل‌کردن فقط زمانش آزاد می‌شود و مبلغی کسر نمی‌شود.
      </p>
     ) : needsRefundCard ? (
      <>
       <p className="text-xs text-soot mb-3">
        {isPartial ? <>بیشتر از {toFarsiNum(policy.threshold_hours)} ساعت تا جلسه مانده.</> : <>کمتر از {toFarsiNum(policy.threshold_hours)} ساعت تا جلسه مانده.</>} با کنسل‌کردن{' '}
        <strong>{toFarsiNum(refundPercent)}٪ مبلغ ({refundAmount.toLocaleString()} تومان)</strong> پس از بررسی به کارت شما بازگردانده می‌شود.
       </p>
       <label className="text-xs text-soot mb-1 block">شماره کارت برای واریز بازپرداخت <span className="text-red-500">*</span></label>
       <input value={refundCard} onChange={e => setRefundCard(e.target.value)} dir="ltr"
        placeholder="6037-0000-0000-0000" inputMode="numeric"
        className="w-full text-sm px-3 py-2 border border-sand rounded-lg font-mono tracking-wider focus:outline-none focus:border-ink mb-3" />
      </>
     ) : (
      <p className="text-xs text-ink mb-3">
       {isPartial ? <>بیشتر از {toFarsiNum(policy.threshold_hours)} ساعت تا جلسه مانده، ولی</> : <>چون کمتر از {toFarsiNum(policy.threshold_hours)} ساعت تا جلسه مانده،</>} با کنسل‌کردن{' '}
       <strong>کل مبلغ این جلسه سوخت می‌شود</strong> و برنمی‌گردد. می‌توانید بعدا جلسه‌ی جدیدی خریداری کنید. مطمئنید؟
      </p>
     )}
     <div className="flex gap-2">
      <button onClick={() => setShowConfirm(false)}
       className="flex-1 py-2 border border-sand rounded-lg text-xs text-soot">انصراف</button>
      <button onClick={cancelSession} disabled={cancelling}
       className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs disabled:opacity-40">
       {cancelling ? 'در حال کنسل...' : !s.paid ? 'تایید کنسل' : needsRefundCard ? `تایید و کنسل (${toFarsiNum(refundPercent)}٪ بازپرداخت)` : 'تایید و سوخت مبلغ'}
      </button>
     </div>
    </div>
   )}
  </div>
 )
}

// ==================== PAY BUTTON (کارت‌به‌کارت پروتکل درمان) ====================
function PayButton({ pkg, phone, onSuccess, total }: { pkg: Package; phone: string; onSuccess: () => void; total: number }) {
 const [open, setOpen] = useState(false)
 const [paying, setPaying] = useState(false)
 const [ref, setRef] = useState('')
 const [onlineLoading, setOnlineLoading] = useState(false)
 const { slug } = useParams<{ slug: string }>()
 const settings = usePublicClinic(slug)
 const pm = settings.doctors.find(d => d.id === pkg.resource_id)?.payment_methods
 const onlineOn = !!pm?.online
 const cardOn = pm ? pm.card_to_card : true

 async function pay() {
  setPaying(true)
  const res = await fetch(`/api/t/${slug}/psy/pay`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ package_id: pkg.id, case_number: pkg.case_number, phone, payment_ref: ref.trim() })
  })
  setPaying(false)
  if (!res.ok) { uiAlert('ثبت پرداخت ناموفق بود'); return }
  onSuccess()
 }

 async function payOnline() {
  setOnlineLoading(true)
  try {
   const res = await fetch(`/api/t/${slug}/psy/pay-online`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_number: pkg.case_number, phone, purpose: 'package', ref_id: pkg.id }),
   })
   const data = await res.json()
   if (data.url) window.location.href = data.url
   else { uiAlert(data.error || 'خطا در اتصال به درگاه'); setOnlineLoading(false) }
  } catch { uiAlert('خطا در ارتباط با سرور'); setOnlineLoading(false) }
 }

 if (!open) return (
  <div className="flex gap-2">
   {onlineOn && (
    <button onClick={payOnline} disabled={onlineLoading}
     className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
     {onlineLoading ? 'در حال اتصال...' : `پرداخت آنلاین ${total.toLocaleString()}`}
    </button>
   )}
   {cardOn && (
    <button onClick={() => setOpen(true)}
     className={`py-2.5 rounded-xl text-sm font-medium ${onlineOn ? 'flex-1 border border-gray-300 text-soot' : 'w-full bg-ink text-white'}`}>
     {onlineOn ? 'کارت‌به‌کارت' : `پرداخت کارت‌به‌کارت ${total.toLocaleString()} تومان`}
    </button>
   )}
  </div>
 )

 return (
  <div className="text-right">
   <div className="bg-sand border border-sand rounded-xl p-3 mb-2">
    <CardChooser cards={settings.cards} loaded={settings.loaded} />
   </div>
   <label className="text-xs text-soot mb-1 block">متن فیش واریزی <span className="text-red-500">*</span></label>
   <textarea value={ref} onChange={e => setRef(e.target.value)} rows={3} placeholder="اطلاعات فیش واریزی را وارد کنید..."
    className="w-full text-sm px-3 py-2 border border-sand rounded-xl focus:outline-none focus:border-ink mb-2 resize-none" />
   <button onClick={pay} disabled={paying || !ref.trim()}
    className="w-full py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
    {paying ? 'در حال ثبت...' : 'پرداخت کردم'}
   </button>
   <p className="text-[11px] text-soot mt-1.5 text-center">پس از واریز، متن فیش را وارد و «پرداخت کردم» را بزنید تا بررسی و تأیید شود.</p>
  </div>
 )
}

// ==================== SLOT PICKER (تک‌جلسه‌ای) ====================
function SlotPicker({ session, phone, caseNumber, onClose, onDone, title = 'انتخاب زمان جلسه', onConfirm, resourceId, sessionType, officeLocation }: {
 session?: Session; phone: string; caseNumber: string; onClose: () => void; onDone: () => void
 title?: string; onConfirm?: (date: string, time: string) => Promise<{ ok: boolean; error?: string }>
 resourceId?: string | null
 // نوع جلسه (آنلاین/حضوری) وقتی `session` در دست نیست (مثلا مراحل پیش‌ازدرمان) —
 // هم برای فیلترکردن اسلات‌ها هم برای نمایش واضح به مراجع که این وقت مال کدام نوع است
 sessionType?: 'online' | 'offline'
 officeLocation?: string
}) {
 const { slug } = useParams<{ slug: string }>()
 const today = getCurrentJalali()
 const [curMonth, setCurMonth] = useState(today.month)
 const [curYear, setCurYear] = useState(today.year)
 const [schedule, setSchedule] = useState<Record<string, string[]>>({})
 const [slotTypes, setSlotTypes] = useState<Record<string, Record<string, string>>>({})
 const [selectedDay, setSelectedDay] = useState<number | null>(null)
 const [selectedSlot, setSelectedSlot] = useState<string>('')
 const [saving, setSaving] = useState(false)
 const [loadingSched, setLoadingSched] = useState(true)
 const [waitlistJoined, setWaitlistJoined] = useState(false)
 const [waitlistJoining, setWaitlistJoining] = useState(false)

 async function joinWaitlist() {
  if (!resourceId) return
  setWaitlistJoining(true)
  const res = await fetch(`/api/t/${slug}/psy/waitlist`, {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ case_number: caseNumber, resource_id: resourceId, session_type: session?.session_type || sessionType }),
  })
  setWaitlistJoining(false)
  if (res.ok) setWaitlistJoined(true)
  else uiAlert('ثبت در لیست انتظار ناموفق بود')
 }

 useEffect(() => { loadSchedule(curMonth, curYear) }, [curMonth, curYear])

 async function loadSchedule(month: number, year: number) {
  setLoadingSched(true)
  const rq = resourceId ? `&resource_id=${resourceId}` : ''
  const res = await fetch(`/api/t/${slug}/psy/schedule?year=${year}&month=${month + 1}${rq}`, { cache: 'no-store' })
  const data = await res.json()
  const map: Record<string, string[]> = {}
  const types: Record<string, Record<string, string>> = {}
  for (const s of data.schedules || []) {
   const day = parseInt(s.date.split('/')[2]).toString()
   if (!s.is_off && s.available_times?.length > 0) { map[day] = s.available_times; types[day] = s.slot_types || {} }
  }
  setSchedule(map)
  setSlotTypes(types)
  setLoadingSched(false)
 }

 function changeMonth(dir: number) {
  let m = curMonth + dir, y = curYear
  if (m < 0) { m = 11; y-- }
  if (m > 11) { m = 0; y++ }
  setCurMonth(m); setCurYear(y); setSelectedDay(null); setSelectedSlot('')
 }

 async function confirm() {
  if (!selectedDay || !selectedSlot) return
  setSaving(true)
  const date = `${curYear}/${curMonth + 1}/${selectedDay}`
  if (onConfirm) {
   const r = await onConfirm(date, selectedSlot)
   setSaving(false)
   if (!r.ok) { uiAlert(r.error || 'ثبت نشد'); setSelectedSlot(''); loadSchedule(curMonth, curYear); return }
   onDone()
   return
  }
  const res = await fetch(`/api/t/${slug}/psy/schedule-one`, {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
    session_id: session!.id, case_number: caseNumber, phone,
    session_date: date, session_time: selectedSlot
   })
  })
  const data = await res.json().catch(() => ({}))
  setSaving(false)
  if (!res.ok) { uiAlert(data.error || 'ثبت نشد'); setSelectedSlot(''); loadSchedule(curMonth, curYear); return }
  onDone()
 }

 const daysInMonth = getDaysInJalaliMonth(curYear, curMonth)
 const startDay = 2
 const isPastDay = (d: number) =>
  curYear < today.year || (curYear === today.year && (curMonth < today.month || (curMonth === today.month && d <= today.day)))
 const slotsForDay = (d: number) => {
  const base = schedule[String(d)] || []
  const dayTypes = slotTypes[String(d)] || {}
  const want = session?.session_type || sessionType // 'online' | 'offline' | undefined
  return base.filter(t => {
   const ts = jalaliDateTimeToTimestamp(`${curYear}/${curMonth + 1}/${d}`, t)
   if (!(ts === null || ts > Date.now())) return false
   // اسلات بدون نوع برای هر دو آزاد است؛ در غیر این صورت باید با نوع جلسه بخواند
   const st = dayTypes[t]
   return !want || !st || st === want
  })
 }
 const availDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  .filter(d => !isPastDay(d) && slotsForDay(d).length > 0)

 return (
  <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4" dir="rtl">
   <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
    <div className="flex items-center justify-between p-4 border-b border-sand sticky top-0 bg-white">
     <h3 className="text-sm font-display font-semibold text-ink">{title}</h3>
     <button onClick={onClose} className="text-soot text-lg leading-none">✕</button>
    </div>
    {(session?.session_type || sessionType) && (
     <div className="px-4 pt-3 space-y-2">
      <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-sand text-ink border border-sand">
       {(session?.session_type || sessionType) === 'online' ? '🎥 این جلسه آنلاین است' : `🏥 این جلسه حضوری است${officeLocation ? ` — ${officeLocation}` : ''}`}
      </span>
      {(session?.session_type || sessionType) === 'offline' && (
       <p className="text-[11px] text-soot leading-5">
        ⏱ ساعت انتخابی تقریبی است؛ ممکن است جلسه چند دقیقه با تاخیر شروع شود. سعی می‌شود همان سر ساعت اعلام‌شده رعایت شود.
       </p>
      )}
     </div>
    )}
    <div className="p-4">
     <div className="flex items-center justify-between mb-4">
      <button onClick={() => changeMonth(-1)} className="w-8 h-8 border border-sand rounded-lg text-soot">›</button>
      <span className="text-sm font-medium text-ink">{PERSIAN_MONTHS[curMonth]} {toFarsiNum(curYear)}</span>
      <button onClick={() => changeMonth(1)} className="w-8 h-8 border border-sand rounded-lg text-soot">‹</button>
     </div>
     <div className="grid grid-cols-7 gap-1 mb-2">
      {PERSIAN_WEEKDAYS.map(d => <div key={d} className="text-center text-xs text-soot py-1">{d}</div>)}
     </div>
     <div className="grid grid-cols-7 gap-1 mb-4">
      {Array(startDay).fill(null).map((_, i) => <div key={i} />)}
      {Array(daysInMonth).fill(null).map((_, i) => {
       const d = i + 1
       const hasSlot = !loadingSched && availDays.includes(d)
       const isSel = selectedDay === d
       return (
        <div key={d} onClick={() => { if (hasSlot) { setSelectedDay(d); setSelectedSlot('') } }}
         className={`text-center py-2 rounded-lg text-sm ${hasSlot ? 'cursor-pointer hover:bg-sand' : 'text-gray-300'} ${isSel ? 'bg-sand text-ink font-medium' : 'text-ink'}`}>
         {toFarsiNum(d)}
         {hasSlot && <span className="block w-1 h-1 rounded-full bg-emerald-500 mx-auto mt-0.5" />}
        </div>
       )
      })}
     </div>
     {loadingSched && (
      <p className="text-center text-xs text-soot mb-4">در حال بارگذاری برنامه...</p>
     )}
     {!loadingSched && availDays.length === 0 && (
      <div className="text-center mb-4">
       <p className="text-xs text-soot mb-2">برای این ماه ساعت آزادی موجود نیست.</p>
       {resourceId && !waitlistJoined && (
        <button onClick={joinWaitlist} disabled={waitlistJoining}
         className="text-xs px-4 py-2 border border-ink text-ink rounded-lg hover:bg-sand disabled:opacity-40">
         {waitlistJoining ? 'در حال ثبت...' : '+ افزودن به لیست انتظار'}
        </button>
       )}
       {waitlistJoined && <p className="text-xs text-emerald-600">به لیست انتظار اضافه شدید — هروقت ظرفیتی باز شد به شما خبر می‌دهیم.</p>}
      </div>
     )}
     {selectedDay && (
      <div className="grid grid-cols-3 gap-2 mb-4">
       {slotsForDay(selectedDay).map(slot => (
        <div key={slot} onClick={() => setSelectedSlot(slot)}
         className={`text-center py-2 border rounded-lg text-sm cursor-pointer ${selectedSlot === slot ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 font-medium' : 'border-sand text-soot'}`}>
         {selectedSlot === slot && '✓ '}{slot}
        </div>
       ))}
      </div>
     )}
     <button onClick={confirm} disabled={!selectedDay || !selectedSlot || saving}
      className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
      {saving ? 'در حال ثبت...' : 'ثبت زمان جلسه'}
     </button>
    </div>
   </div>
  </div>
 )
}

// ==================== SCHEDULE PICKER ====================
function SchedulePicker({ pkg, existingSessions, phone, caseNumber, onClose, onDone, resourceId }: {
 pkg: Package; existingSessions: Session[]; phone: string; caseNumber: string; onClose: () => void; onDone: () => void
 resourceId?: string | null
}) {
 const { slug } = useParams<{ slug: string }>()
 const settings = usePublicClinic(slug)
 const companionLabel = settings.doctors.find(d => d.id === resourceId)?.companion_label || 'همراه'
 const today = getCurrentJalali()
 const [curMonth, setCurMonth] = useState(parseInt(pkg.month) - 1)
 const [curYear, setCurYear] = useState(parseInt(pkg.year))
 const [schedule, setSchedule] = useState<Record<string, string[]>>({})
 const [slotTypesS, setSlotTypesS] = useState<Record<string, Record<string, string>>>({})
 const [selectedDay, setSelectedDay] = useState<number | null>(null)
 const [availableSlots, setAvailableSlots] = useState<string[]>([])
 const [selectedSlots, setSelectedSlots] = useState<Record<number, string[]>>({})
 const [saving, setSaving] = useState(false)
 const [attendeeMap, setAttendeeMap] = useState<Record<string, string>>({})
 const [loadingSched, setLoadingSched] = useState(true)

 const totalNeeded = pkg.primary_sessions + pkg.secondary_sessions
 const alreadyBooked = existingSessions.length
 const remaining = totalNeeded - alreadyBooked
 const totalSelected = Object.values(selectedSlots).reduce((a, b) => a + b.length, 0)

 // ⚠️ قانون کلی: ترکیب پروتکل را دکتر تعیین می‌کند (مثلا ۲ جلسه‌ی مراجع + ۱
 // جلسه‌ی همراه) — مراجع فقط می‌تواند دقیقا همین ترکیب را زمان‌بندی کند، نه هر
 // توزیعی. قبلا فقط «مجموع» چک می‌شد و انتخاب attendee برای هر اسلات آزاد بود؛
 // یعنی مراجع می‌توانست هر سه جلسه را «مراجع» انتخاب کند و سهم همراه خالی بماند.
 const bookedPrimary = existingSessions.filter(s => s.attendee === 'primary').length
 const bookedSecondary = existingSessions.filter(s => s.attendee === 'secondary').length
 const selectedPrimary = Object.values(attendeeMap).filter(v => v === 'primary').length
 const selectedSecondary = Object.values(attendeeMap).filter(v => v === 'secondary').length
 const remainingPrimary = Math.max(0, pkg.primary_sessions - bookedPrimary - selectedPrimary)
 const remainingSecondary = Math.max(0, pkg.secondary_sessions - bookedSecondary - selectedSecondary)

 useEffect(() => { loadSchedule(curMonth, curYear) }, [curMonth, curYear])

 async function loadSchedule(month: number, year: number) {
  setLoadingSched(true)
  const rq = resourceId ? `&resource_id=${resourceId}` : ''
  const res = await fetch(`/api/t/${slug}/psy/schedule?year=${year}&month=${month + 1}${rq}`, { cache: 'no-store' })
  const data = await res.json()
  const map: Record<string, string[]> = {}
  const types: Record<string, Record<string, string>> = {}
  for (const s of data.schedules || []) {
   const parts = s.date.split('/')
   const day = parseInt(parts[2]).toString()
   if (!s.is_off && s.available_times?.length > 0) { map[day] = s.available_times; types[day] = s.slot_types || {} }
  }
  setSchedule(map)
  setSlotTypesS(types)
  setLoadingSched(false)
 }

 function changeMonth(dir: number) {
  let m = curMonth + dir, y = curYear
  if (m < 0) { m = 11; y-- } if (m > 11) { m = 0; y++ }
  setCurMonth(m); setCurYear(y); setSelectedDay(null)
 }

 function selectSlot(day: number, slot: string) {
  const current = selectedSlots[day] || []
  const allSelected = Object.values(selectedSlots).reduce((a, b) => a + b.length, 0)
  if (current.includes(slot)) {
   const updated = current.filter(s => s !== slot)
   setSelectedSlots(prev => ({ ...prev, [day]: updated }))
   const newMap = { ...attendeeMap }
   delete newMap[`${day}-${slot}`]
   setAttendeeMap(newMap)
  } else {
   if (allSelected >= remaining) return
   // پیش‌فرض: هر دسته‌ای که هنوز سهم خالی دارد؛ اول مراجع، وگرنه همراه —
   // و اگر هر دو دسته پر شده باشند (نباید پیش بیاید چون totalSelected زیر
   // remaining است) اصلا اسلات اضافه نمی‌شود.
   const defaultAttendee = remainingPrimary > 0 ? 'primary' : remainingSecondary > 0 ? 'secondary' : null
   if (!defaultAttendee) return
   setSelectedSlots(prev => ({ ...prev, [day]: [...current, slot] }))
   setAttendeeMap(prev => ({ ...prev, [`${day}-${slot}`]: defaultAttendee }))
  }
 }

 async function confirmSessions() {
  setSaving(true)
  const sessionsToCreate = []
  for (const [day, slots] of Object.entries(selectedSlots)) {
   for (const slot of slots) {
    sessionsToCreate.push({
     case_number: caseNumber,
     package_id: pkg.id,
     session_date: `${curYear}/${curMonth + 1}/${day}`,
     session_time: slot,
     session_type: pkg.primary_session_type,
     attendee: attendeeMap[`${day}-${slot}`] || 'primary',
    })
   }
  }
  const res = await fetch(`/api/t/${slug}/psy/sessions`, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ sessions: sessionsToCreate, phone })
  })
  const data = await res.json().catch(() => ({}))
  setSaving(false)
  if (!res.ok) {
   // ساعت گرفته‌شده یا خطای دیگر — به مراجع اطلاع بده و انتخاب‌ها را پاک کن
   uiAlert(data.error || 'ثبت جلسه ناموفق بود. لطفا دوباره تلاش کنید.')
   setSelectedSlots({})
   setAttendeeMap({})
   setSelectedDay(null)
   loadSchedule(curMonth, curYear) // ساعت‌های آزاد را تازه‌سازی کن
   return
  }
  onDone()
 }

 const daysInMonth = getDaysInJalaliMonth(curYear, curMonth)
 const freeSlotsS = (d: number) => {
  const base = schedule[String(d)] || []
  const dayTypes = slotTypesS[String(d)] || {}
  const wanted = new Set([pkg.primary_session_type, pkg.secondary_session_type])
  return base.filter(t => {
   const ts = jalaliDateTimeToTimestamp(`${curYear}/${curMonth + 1}/${d}`, t)
   if (!(ts === null || ts > Date.now())) return false
   const st = dayTypes[t]
   return !st || wanted.has(st)
  })
 }

 return (
  <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
   <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl" dir="rtl">
    <div className="sticky top-0 bg-white border-b border-sand p-4 flex items-center justify-between">
     <div>
      <h2 className="font-display font-semibold text-ink">انتخاب روزهای جلسه</h2>
      <p className="text-xs text-soot mt-0.5">
      {totalSelected} از {remaining} جلسه انتخاب شده
      {pkg.secondary_sessions > 0 && ` — مراجع: ${remainingPrimary} باقی، ${companionLabel}: ${remainingSecondary} باقی`}
     </p>
     </div>
     <button onClick={onClose} className="text-soot text-2xl w-8 h-8 flex items-center justify-center">×</button>
    </div>

    {(pkg.primary_session_type === 'offline' || pkg.secondary_session_type === 'offline') && (
     <div className="px-4 pt-3">
      <p className="text-[11px] text-soot leading-5">
       ⏱ ساعت انتخابی برای جلسات حضوری تقریبی است؛ ممکن است چند دقیقه با تاخیر شروع شود. سعی می‌شود همان سر ساعت اعلام‌شده رعایت شود.
      </p>
     </div>
    )}

    <div className="p-4">
     {/* Progress */}
     <div className="bg-gray-100 rounded-full h-2 mb-4">
      <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(totalSelected / remaining) * 100}%` }} />
     </div>

     {/* Calendar */}
     <div className="flex items-center justify-between mb-4">
      <button onClick={() => changeMonth(-1)} className="w-8 h-8 border border-sand rounded-lg text-soot flex items-center justify-center">›</button>
      <h3 className="text-sm font-medium">{PERSIAN_MONTHS[curMonth]} {toFarsiNum(curYear)}</h3>
      <button onClick={() => changeMonth(1)} className="w-8 h-8 border border-sand rounded-lg text-soot flex items-center justify-center">‹</button>
     </div>
     <div className="grid grid-cols-7 gap-1 mb-2">
      {PERSIAN_WEEKDAYS.map(d => <div key={d} className="text-center text-xs text-soot py-1">{d}</div>)}
     </div>
     <div className="grid grid-cols-7 gap-1 mb-4">
      {Array(2).fill(null).map((_, i) => <div key={i} />)}
      {Array(daysInMonth).fill(null).map((_, i) => {
       const d = i + 1
       const isPast = curYear === today.year && curMonth === today.month && d <= today.day
       const hasSlots = !loadingSched && freeSlotsS(d).length > 0
       const isSelected = selectedDay === d
       const daySelections = (selectedSlots[d] || []).length
       return (
        <div key={d} onClick={() => { if (!isPast && hasSlots) { setSelectedDay(d); setAvailableSlots(freeSlotsS(d)) } }}
         className={`relative text-center py-2 rounded-lg text-sm transition-all
          ${isPast || !hasSlots ? 'text-gray-300 cursor-default' : 'cursor-pointer hover:bg-sand'}
          ${isSelected ? 'bg-sand text-ink font-medium ring-1 ring-ink' : ''}
         `}>
         {toFarsiNum(d)}
         {hasSlots && !isPast && <span className="block w-1 h-1 rounded-full bg-emerald-500 mx-auto mt-0.5" />}
         {daySelections > 0 && (
          <span className="absolute -top-1 -left-1 w-4 h-4 bg-emerald-500 text-white text-xs rounded-full flex items-center justify-center">
           {daySelections}
          </span>
         )}
        </div>
       )
      })}
     </div>
     {loadingSched && (
      <p className="text-center text-xs text-soot mb-4">در حال بارگذاری برنامه...</p>
     )}

     {/* Time Slots */}
     {selectedDay && availableSlots.length > 0 && (
      <div className="mb-4">
       <h4 className="text-xs font-medium text-soot mb-2">{toFarsiNum(selectedDay)} {PERSIAN_MONTHS[curMonth]} — ساعت‌های خالی:</h4>
       <div className="grid grid-cols-3 gap-2">
        {availableSlots.map(slot => {
         const key = `${selectedDay}-${slot}`
         const isChosen = (selectedSlots[selectedDay] || []).includes(slot)
         const attendee = attendeeMap[key]
         return (
          <div key={slot}>
           <div onClick={() => selectSlot(selectedDay, slot)}
            className={`text-center py-2 border rounded-lg text-sm cursor-pointer transition-all ${isChosen ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 font-medium' : 'border-sand text-soot hover:border-gray-300'}`}>
            {isChosen && '✓ '}{slot}
           </div>
           {isChosen && pkg.secondary_sessions > 0 && (
            <div className="flex mt-1 gap-1">
             {(['primary', 'secondary'] as const).map(a => {
              // اجازه‌ی سوییچ به دسته‌ی a فقط اگر سهم آن دسته (به‌جز خود همین
              // اسلات) هنوز پر نشده باشد — وگرنه می‌شد ترکیب تعریف‌شده‌ی دکتر
              // (مثلا ۲ مراجع + ۱ همراه) را با سوییچ دستی به‌هم زد.
              const selfIsA = attendee === a
              const otherSelected = (a === 'primary' ? selectedPrimary : selectedSecondary) - (selfIsA ? 1 : 0)
              const bookedA = a === 'primary' ? bookedPrimary : bookedSecondary
              const capA = a === 'primary' ? pkg.primary_sessions : pkg.secondary_sessions
              const canSwitch = selfIsA || (bookedA + otherSelected) < capA
              return (
               <button key={a} disabled={!canSwitch} onClick={() => canSwitch && setAttendeeMap(prev => ({ ...prev, [key]: a }))}
                className={`flex-1 text-xs py-0.5 rounded border transition-all ${attendee === a ? 'bg-ink text-white border-ink' : canSwitch ? 'border-sand text-soot' : 'border-sand text-gray-300 cursor-not-allowed'}`}>
                {a === 'primary' ? 'مراجع' : companionLabel}
               </button>
              )
             })}
            </div>
           )}
          </div>
         )
        })}
       </div>
      </div>
     )}

     {/* Summary */}
     {totalSelected > 0 && (
      <div className="bg-gray-50 rounded-xl p-3 mb-4">
       <h4 className="text-xs font-medium text-soot mb-2">جلسات انتخاب شده:</h4>
       {Object.entries(selectedSlots).filter(([, slots]) => slots.length > 0).map(([day, slots]) =>
        slots.map(slot => (
         <div key={`${day}-${slot}`} className="flex justify-between text-xs text-soot mb-1">
          <span>{toFarsiNum(parseInt(day))} {PERSIAN_MONTHS[curMonth]} — {slot}</span>
          <span className={attendeeMap[`${day}-${slot}`] === 'secondary' ? 'text-ink' : 'text-ink'}>
           {attendeeMap[`${day}-${slot}`] === 'secondary' ? companionLabel : 'مراجع'}
          </span>
         </div>
        ))
       )}
      </div>
     )}

     <button onClick={confirmSessions} disabled={totalSelected < remaining || saving}
      className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
      {saving ? 'در حال ثبت...' : totalSelected < remaining ? `${remaining - totalSelected} جلسه دیگر انتخاب کنید` : 'ثبت روزهای جلسات'}
     </button>
    </div>
   </div>
  </div>
 )
}

// ==================== STAGE HELPERS (مراحل پیش‌از‌درمان) ====================
function StageHero({ icon, title, desc, red }: { icon: string; title: string; desc: string; red?: boolean }) {
 return (
  <>
   <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl ${red ? 'bg-red-500/10' : 'bg-sand'}`}>{icon}</div>
   <h2 className="text-base font-medium text-ink mb-2">{title}</h2>
   <p className="text-sm text-soot mb-4">{desc}</p>
  </>
 )
}

function StageWaiting({ title, desc }: { title: string; desc: string }) {
 return (
  <>
   <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4 text-3xl">⏳</div>
   <h2 className="text-base font-medium text-ink mb-2">{title}</h2>
   <p className="text-sm text-soot">{desc}</p>
  </>
 )
}

function StageInfo({ icon, title, desc, date, time, label, delayMinutes, meetLink }: { icon: string; title: string; desc: string; date?: string; time?: string; label: string; delayMinutes?: number | null; meetLink?: string }) {
 return (
  <>
   <StageHero icon={icon} title={title} desc={desc} />
   {date && (
    <div className="bg-gray-50 rounded-xl p-3 text-sm text-soot">
     {label}: {date} — {time}
    </div>
   )}
   {!!delayMinutes && (
    <div className="bg-gray-100 border border-sand rounded-xl p-3 text-sm text-ink mt-2">
     ⏱ این جلسه با {delayMinutes} دقیقه تاخیر برگزار می‌شود.
    </div>
   )}
   {meetLink && (
    <a href={meetLink} target="_blank" rel="noopener noreferrer"
     className="text-sm text-white bg-ink rounded-xl px-4 py-2.5 mt-2 inline-block font-medium hover:opacity-90">
     ورود به جلسه‌ی گوگل‌میت ↗
    </a>
   )}
  </>
 )
}

// کارت پرداخت کارت‌به‌کارت — شماره کارت + کد رهگیری اختیاری + دکمه‌ی «پرداخت کردم»
function StagePayment({ icon, title, desc, amount, onPaid, onDone, resourceId, caseNumber, phone, stageId }: {
 icon: string; title: string; desc: string; amount: number
 onPaid: (ref: string) => Promise<boolean>; onDone: () => void
 resourceId?: string | null; caseNumber: string; phone: string; stageId: string
}) {
 const [ref, setRef] = useState('')
 const [submitting, setSubmitting] = useState(false)
 const [onlineLoading, setOnlineLoading] = useState(false)
 const { slug } = useParams<{ slug: string }>()
 const settings = usePublicClinic(slug)
 const pm = settings.doctors.find(d => d.id === resourceId)?.payment_methods
 const onlineOn = !!pm?.online
 const cardOn = pm ? pm.card_to_card : true
 const [method, setMethod] = useState<'online' | 'card'>(onlineOn ? 'online' : 'card')

 async function submit() {
  setSubmitting(true)
  const ok = await onPaid(ref.trim())
  setSubmitting(false)
  if (!ok) { uiAlert('ثبت پرداخت ناموفق بود. دوباره تلاش کنید.'); return }
  onDone()
 }

 async function payOnline() {
  setOnlineLoading(true)
  try {
   const res = await fetch(`/api/t/${slug}/psy/pay-online`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ case_number: caseNumber, phone, purpose: 'stage', ref_id: stageId }),
   })
   const data = await res.json()
   if (data.url) window.location.href = data.url
   else { uiAlert(data.error || 'خطا در اتصال به درگاه'); setOnlineLoading(false) }
  } catch { uiAlert('خطا در ارتباط با سرور'); setOnlineLoading(false) }
 }

 return (
  <div className="text-right">
   <div className="text-center">
    <div className="w-16 h-16 rounded-full bg-sand flex items-center justify-center mx-auto mb-4 text-3xl">{icon}</div>
    <h2 className="text-base font-medium text-ink mb-2">{title}</h2>
    <p className="text-sm text-soot mb-4">{desc}</p>
   </div>

   <div className="bg-sand border border-sand rounded-xl p-4 mb-3">
    <div className="flex items-center justify-between">
     <span className="text-xs text-soot">مبلغ قابل پرداخت</span>
     <span className="text-base font-bold text-ink">{amount.toLocaleString()} تومان</span>
    </div>
   </div>

   {onlineOn && cardOn && (
    <div className="grid grid-cols-2 gap-2 mb-3 p-1 bg-gray-100 rounded-xl">
     <button onClick={() => setMethod('online')}
      className={`py-2 rounded-lg text-xs font-medium transition-colors ${method === 'online' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
      پرداخت آنلاین
     </button>
     <button onClick={() => setMethod('card')}
      className={`py-2 rounded-lg text-xs font-medium transition-colors ${method === 'card' ? 'bg-white shadow-sm text-ink' : 'text-soot'}`}>
      کارت‌به‌کارت
     </button>
    </div>
   )}

   {method === 'online' && onlineOn ? (
    <>
     <p className="text-xs text-soot mb-3 text-center">بعد پرداخت بلافاصله می‌توانید ادامه دهید.</p>
     <button onClick={payOnline} disabled={onlineLoading}
      className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
      {onlineLoading ? 'در حال اتصال به درگاه...' : 'پرداخت آنلاین'}
     </button>
    </>
   ) : (
    <>
     <div className="bg-sand border border-sand rounded-xl p-3 mb-3">
      <CardChooser cards={settings.cards} loaded={settings.loaded} />
     </div>
     <label className="text-xs text-soot mb-1 block">متن فیش واریزی <span className="text-red-500">*</span></label>
     <textarea value={ref} onChange={e => setRef(e.target.value)} rows={3} placeholder="اطلاعات فیش واریزی را وارد کنید (کد پیگیری، شماره کارت مبدأ، تاریخ و ساعت واریز...)"
      className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl focus:outline-none focus:border-ink mb-3 resize-none" />
     <button onClick={submit} disabled={submitting || !ref.trim()}
      className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
      {submitting ? 'در حال ثبت...' : 'پرداخت کردم'}
     </button>
     <p className="text-[11px] text-soot mt-2 text-center">پس از واریز، متن فیش را وارد و «پرداخت کردم» را بزنید تا بررسی و تأیید شود.</p>
    </>
   )}
  </div>
 )
}

// نوار پیشرفت مراحل — حالا طولش متغیر است (هر تعداد مصاحبه/ارزیابی که واقعا وجود دارد) + درمان در انتها
function StageProgress({ stages, inTreatment }: { stages: CaseStage[]; inTreatment: boolean }) {
 const items = stages.map(s => ({
  icon: s.stage_type === 'assessment' ? '' : '',
  label: STAGE_TYPE_LABEL[s.stage_type] || s.stage_type,
  done: s.status === 'booked' && !!s.held,
  current: !(s.status === 'booked' && !!s.held),
 }))
 items.push({ icon: '', label: 'درمان', done: inTreatment, current: false })
 return (
  <div className="bg-white rounded-2xl border border-sand p-3 flex items-center justify-between overflow-x-auto">
   {items.map((it, i) => (
    <div key={i} className="flex items-center flex-1 last:flex-none">
     <div className="flex flex-col items-center gap-1 shrink-0">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
       ${it.done ? 'bg-emerald-500 text-white' : it.current ? 'bg-ink text-white' : 'bg-gray-100 text-soot'}`}>
       {it.done ? '✓' : it.icon}
      </div>
      <span className={`text-[11px] whitespace-nowrap ${it.current ? 'text-ink font-medium' : 'text-soot'}`}>{it.label}</span>
     </div>
     {i < items.length - 1 && <div className={`flex-1 h-px mx-2 ${it.done ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
    </div>
   ))}
  </div>
 )
}
// ==================== REVIEW BOX ====================
// نظر/امتیاز واقعی مراجع — سرور خودش چک می‌کند که واقعا جلسه‌ی گذشته‌ای با
// این دکتر داشته؛ اگر نداشته باشد فقط پیام خطا نشان داده می‌شود (فرم اضافه‌ای
// برای «آیا واجد شرایطی» نمی‌سازیم — سرور مرجع نهایی است).
function ReviewBox({ resourceId, caseNumber, phone, slug }: { resourceId: string; caseNumber: string; phone: string; slug: string }) {
 const [rating, setRating] = useState(0)
 const [comment, setComment] = useState('')
 const [submitting, setSubmitting] = useState(false)
 const [done, setDone] = useState(false)
 const [err, setErr] = useState('')

 async function submit() {
  if (!rating) { setErr('لطفا امتیاز را انتخاب کنید'); return }
  setSubmitting(true); setErr('')
  const res = await fetch(`/api/t/${slug}/psy/reviews`, {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ case_number: caseNumber, resource_id: resourceId, rating, comment: comment.trim(), phone }),
  })
  const data = await res.json().catch(() => ({}))
  setSubmitting(false)
  if (!res.ok) { setErr(data.error || 'ثبت ناموفق بود'); return }
  setDone(true)
 }

 if (done) return (
  <div className="bg-white rounded-xl border border-sand p-4 text-center">
   <p className="text-sm text-emerald-600">ممنون از نظرتان! پس از بررسی دکتر منتشر می‌شود.</p>
  </div>
 )

 return (
  <div className="bg-white rounded-xl border border-sand p-4">
   <h3 className="text-sm font-medium text-ink pb-2 border-b border-sand mb-3">نظرتان را ثبت کنید</h3>
   <div className="flex gap-1 mb-3 justify-center text-2xl">
    {[1, 2, 3, 4, 5].map(n => (
     <button key={n} onClick={() => setRating(n)} className={n <= rating ? 'text-amber-500' : 'text-gray-200'}>★</button>
    ))}
   </div>
   <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder="نظر شما (اختیاری)..."
    className="w-full text-sm px-3 py-2 border border-sand rounded-xl focus:outline-none focus:border-ink resize-none mb-2" />
   {err && <p className="text-xs text-red-600 mb-2 text-center">{err}</p>}
   <button onClick={submit} disabled={submitting}
    className="w-full py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
    {submitting ? 'در حال ثبت...' : 'ثبت نظر'}
   </button>
  </div>
 )
}
