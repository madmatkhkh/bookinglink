'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { PERSIAN_MONTHS, PERSIAN_WEEKDAYS, toFarsiNum, getCurrentJalali, getDaysInJalaliMonth, jalaliDateTimeToTimestamp } from '@/lib/calendar'
import { PSY_PRICING as PRICING, DEFAULT_CANCELLATION_POLICY } from '@/lib/psy'
import { usePublicClinic, usePatientFeatures, CardChooser } from '@/components/PsyPublic'
import { STAGE_TYPE_LABEL } from '@/lib/flow'
import { DialogHost, uiAlert, uiConfirm } from '@/components/ui/Dialog'

type CaseStage = {
  id: string; case_number: string
  stage_type: 'interview' | 'assessment'
  status: 'awaiting_payment' | 'payment_submitted' | 'awaiting_booking' | 'booked'
  price: number; paid: boolean; payment_submitted?: boolean; payment_ref?: string
  session_date?: string; session_time?: string; held?: boolean
  cancel_notice?: string; resource_id?: string | null; created_at: string
}

type Booking = {
  id: string; case_number: string; child_name: string; birth_date: string
  grade: string; father_name: string; mother_name: string
  father_phone: string; mother_phone: string; status: string
  reject_reason?: string
  current_stage_id?: string | null
  resource_id?: string | null
}
type Package = {
  id: string; case_number: string; month: string; year: string
  child_sessions: number; parent_sessions: number
  child_session_type: string; parent_session_type: string
  notes: string; paid: boolean; payment_submitted?: boolean; status: string
  resource_id?: string | null
}
type Session = {
  id: string; package_id: string; session_number: number; title?: string
  session_date: string; session_time: string; session_type: string
  attendee: string; status: string; doctor_note_for_patient: string
  paid: boolean; payment_submitted?: boolean
  refund_percent?: number; refund_status?: string; refund_card?: string
  resource_id?: string | null
}

type Step = 'login' | 'otp' | 'panel'

export default function PatientPanel() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const paymentHandled = useRef(false)
  const settings = usePublicClinic(slug)
  const [step, setStep] = useState<Step>('login')
  const [restoring, setRestoring] = useState(true)  // تا وقتی localStorage چک شود، به‌جای لاگین اسپلش نشان بده
  const [phone, setPhone] = useState('')
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

  async function sendOtp() {
    if (!phone || phone.length < 10) { setError('شماره موبایل درست نیست'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/t/${slug}/psy/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) })
    const data = await res.json()
    if (data.success) { setDevCode(data.dev_code); setStep('otp') }
    else setError(data.error || 'خطا')
    setLoading(false)
  }

  async function verifyOtp() {
    setLoading(true); setError('')
    const res = await fetch(`/api/t/${slug}/psy/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code: otpCode }) })
    const data = await res.json()
    if (data.success) {
      setBooking(data.booking)
      await loadData(data.booking.case_number, phone)
      try { localStorage.setItem('pb_phone', phone); localStorage.setItem('pb_case', data.booking.case_number) } catch {}
      setStep('panel')
    }
    else setError(data.error || 'کد اشتباه است')
    setLoading(false)
  }

  // نگه‌داشتنِ ورود پس از ریلود
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

  // نتیجه‌ی برگشت از درگاهِ پرداختِ آنلاین (زیبال) — یک بار toast بزن، دیتا را
  // تازه کن، و پارامترها را از URL پاک کن تا با رفرش دوباره تکرار نشود.
  useEffect(() => {
    if (paymentHandled.current) return
    if (step !== 'panel' || !booking) return
    const result = searchParams.get('payment')
    if (!result) return
    paymentHandled.current = true
    if (result === 'success') uiAlert('✅ پرداخت با موفقیت انجام شد.')
    else if (result === 'cancelled') uiAlert('پرداخت لغو شد.')
    else if (result === 'failed') uiAlert('پرداخت تایید نشد. دوباره تلاش کنید یا از کارت‌به‌کارت استفاده کنید.')
    else uiAlert('خطایی در پردازشِ پرداخت رخ داد.')
    loadData(booking.case_number)
    router.replace(`/${slug}/my`)
  }, [step, booking, searchParams, slug])

  function logout() {
    try { localStorage.removeItem('pb_phone'); localStorage.removeItem('pb_case') } catch {}
    setStep('login'); setBooking(null); setPhone('')
  }

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
    (p.child_sessions * (p.child_session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline)) +
    (p.parent_sessions * (p.parent_session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline))

  const pkgSessions = (pkgId: string) => sessions.filter(s => s.package_id === pkgId)

  if (restoring) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <DialogHost />
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3 text-2xl animate-pulse">🩺</div>
        <p className="text-sm text-gray-400">در حال بارگذاری...</p>
      </div>
    </div>
  )

  if (step === 'login') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <DialogHost />
      <div className="bg-white rounded-2xl border border-gray-100 p-8 w-full max-w-sm shadow-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3 text-2xl">🩺</div>
          <h1 className="text-lg font-semibold text-gray-900">پنل مراجع</h1>
          {settings.loaded
            ? <p className="text-xs text-gray-400 mt-1">مطبِ {settings.doctor_name}</p>
            : <div className="h-3.5 w-32 mx-auto bg-gray-100 rounded animate-pulse mt-2" />}
        </div>
        <div className="mb-4">
          <label className="text-xs text-gray-500 mb-1.5 block">شماره موبایل</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendOtp()}
            placeholder="۰۹۱۲۳۴۵۶۷۸۹" dir="ltr"
            className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-xl text-center tracking-widest focus:outline-none focus:border-brand-400" />
        </div>
        {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
        <button onClick={sendOtp} disabled={loading}
          className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
          {loading ? 'در حال ارسال...' : 'دریافت کد تایید'}
        </button>
      </div>
    </div>
  )

  if (step === 'otp') return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <DialogHost />
      <div className="bg-white rounded-2xl border border-gray-100 p-8 w-full max-w-sm shadow-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-3 text-2xl">📱</div>
          <h1 className="text-lg font-semibold text-gray-900">کد تایید</h1>
          <p className="text-xs text-gray-400 mt-1">کد ارسال شده به {phone} را وارد کنید</p>
          {devCode && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700">کد تست: <strong className="font-mono text-base">{devCode}</strong></p>
            </div>
          )}
        </div>
        <input value={otpCode} onChange={e => setOtpCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && verifyOtp()}
          placeholder="۱۲۳۴" dir="ltr" maxLength={4}
          className="w-full text-xl px-3 py-3 border border-gray-200 rounded-xl text-center tracking-[0.5em] focus:outline-none focus:border-brand-400 mb-3" />
        {error && <p className="text-xs text-red-500 mb-3 text-center">{error}</p>}
        <button onClick={verifyOtp} disabled={loading || otpCode.length < 4}
          className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
          {loading ? 'در حال بررسی...' : 'ورود به پنل'}
        </button>
        <button onClick={() => { setStep('login'); setError(''); setOtpCode('') }}
          className="w-full py-2 mt-2 text-sm text-gray-400">تغییر شماره</button>
      </div>
    </div>
  )

  if (!booking) return null

  // مراجعی که هنوز وارد مرحله‌ی درمان نشده، وضعیت مرحله‌ی فعلی‌اش را می‌بیند.
  // مرحله‌ی جاری (اگر باشد) از current_stage_id پیدا می‌شود؛ اگر نبود یعنی یا
  // منتظرِ تصمیمِ دکتر برای مرحله‌ی بعد است، یا وارد فازِ پروتکلِ درمان شده.
  const currentStage = stages.find(s => s.id === booking.current_stage_id) || null
  const isRejected = booking.status === 'cancelled' && !!booking.reject_reason
  const inTreatment = !currentStage && packages.length > 0

  if (!inTreatment) return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <DialogHost />
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">{booking.child_name}</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">پرونده:</span>
              <span className="text-xs font-mono text-brand-600 bg-brand-50 px-2 py-0.5 rounded">{booking.case_number}</span>
            </div>
          </div>
          <button onClick={logout}
            className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5">خروج</button>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-3">
        {/* نوارِ پیشرفتِ مراحل */}
        <StageProgress stages={stages} inTreatment={inTreatment} />

        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          {isRejected ? (
            <>
              <StageHero icon="❌" title="تأیید نشد" desc="متأسفانه پس از بررسی، امکان ادامه‌ی فرایند درمان فراهم نشد." red />
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600 text-right">
                <span className="font-medium">دلیل: </span>{booking.reject_reason}
              </div>
            </>
          ) : !currentStage ? (
            <StageWaiting title="منتظرِ تعیینِ مرحله‌ی بعد" desc="دکتر به‌زودی مرحله‌ی بعدِ روندِ درمان را برای شما مشخص می‌کند." />
          ) : currentStage.status === 'awaiting_payment' ? (
            <StagePayment
              icon={currentStage.stage_type === 'assessment' ? '🧩' : '🩺'}
              title={`هزینه‌ی ${STAGE_TYPE_LABEL[currentStage.stage_type] || ''}`}
              desc="برای ادامه، هزینه‌ی این مرحله را پرداخت کنید. پس از تأیید پرداخت، می‌توانید وقت بگیرید."
              amount={currentStage.price || (currentStage.stage_type === 'assessment' ? PRICING.assessment : PRICING.interview)}
              resourceId={booking.resource_id} caseNumber={booking.case_number} phone={phone} stageId={currentStage.id}
              onPaid={async (ref) => {
                const res = await fetch(`/api/t/${slug}/psy/pay`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ case_number: booking.case_number, phone, stage_id: currentStage.id, payment_ref: ref })
                })
                return res.ok
              }}
              onDone={() => loadData(booking.case_number)} />
          ) : currentStage.status === 'payment_submitted' ? (
            <StageWaiting title="در انتظار تأیید پرداخت" desc="پرداخت شما ثبت شد و در حالِ بررسی است. پس از تأیید، اینجا می‌توانید وقت بگیرید." />
          ) : currentStage.status === 'awaiting_booking' ? (
            <>
              {currentStage.cancel_notice && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 text-right mb-3">
                  ⚠️ {currentStage.cancel_notice}
                </div>
              )}
              <StageHero icon="✅" title={currentStage.cancel_notice ? 'انتخاب زمانِ جدید' : 'پرداخت تأیید شد!'}
                desc={`می‌توانید وقتِ ${STAGE_TYPE_LABEL[currentStage.stage_type] || ''} را انتخاب کنید.`} />
              <button onClick={() => setShowSlotPicker(true)}
                className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-800">
                📅 گرفتن وقت
              </button>
            </>
          ) : (
            <StageInfo icon="📅" title="وقت ثبت شد"
              desc="منتظرِ برگزاری باشید. پس از آن، دکتر مرحله‌ی بعد را مشخص می‌کند."
              date={currentStage.session_date} time={currentStage.session_time}
              label={`وقتِ ${STAGE_TYPE_LABEL[currentStage.stage_type] || ''}`} />
          )}

          <button onClick={() => loadData(booking.case_number)}
            className="mt-5 text-xs text-brand-600 border border-brand-200 rounded-lg px-4 py-2">🔄 بررسی مجدد وضعیت</button>
        </div>
      </div>

      {showSlotPicker && currentStage && (
        <SlotPicker phone={phone} caseNumber={booking.case_number}
          title={`انتخاب وقتِ ${STAGE_TYPE_LABEL[currentStage.stage_type] || ''}`} resourceId={booking.resource_id}
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
      <div className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">{booking.child_name}</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">پرونده:</span>
              <span className="text-xs font-mono text-brand-600 bg-brand-50 px-2 py-0.5 rounded">{booking.case_number}</span>
            </div>
          </div>
          <button onClick={logout}
            className="text-xs text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5">خروج</button>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4">
        <div className="flex bg-white rounded-xl border border-gray-100 p-1 mb-4">
          {(['packages', 'sessions', 'info'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${activeTab === t ? 'bg-brand-600 text-white' : 'text-gray-500'}`}>
              {t === 'packages' ? '📦 پروتکل‌های درمان' : t === 'sessions' ? '📅 جلسات' : '📋 اطلاعات'}
            </button>
          ))}
        </div>

        {/* PACKAGES TAB */}
        {activeTab === 'packages' && (
          <div className="space-y-3">
            {packages.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-100 text-gray-400">
                <div className="text-3xl mb-2">📦</div>
                <p className="text-sm">هنوز پروتکلی تعریف نشده</p>
                <p className="text-xs mt-1">دکتر به زودی پروتکل درمانی شما را تنظیم می‌کند</p>
              </div>
            ) : packages.map(pkg => {
              const total = pkgPrice(pkg)
              const booked = pkgSessions(pkg.id).length
              const total_sessions = pkg.child_sessions + pkg.parent_sessions
              return (
                <div key={pkg.id} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{PERSIAN_MONTHS[parseInt(pkg.month) - 1]} {pkg.year}</h3>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {pkg.child_sessions} جلسه کودک + {pkg.parent_sessions} جلسه والدین
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-brand-600">{total.toLocaleString()} تومان</div>
                      <div className={`text-xs mt-0.5 ${pkg.paid ? 'text-green-600' : pkg.payment_submitted ? 'text-blue-600' : 'text-amber-600'}`}>
                        {pkg.paid ? '✅ پرداخت تأیید شد' : pkg.payment_submitted ? '⏳ در انتظار تأیید' : '💳 در انتظار پرداخت'}
                      </div>
                    </div>
                  </div>

                  {pkg.notes && (
                    <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100 mb-3">
                      <p className="text-xs text-blue-500 mb-0.5">پروتکل درمانی:</p>
                      <p className="text-sm text-gray-700">{pkg.notes}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                    <span>{booked} از {total_sessions} جلسه انتخاب شده</span>
                    <div className="flex-1 mx-3 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-brand-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (booked/total_sessions)*100)}%` }} />
                    </div>
                  </div>

                  {!pkg.paid ? (
                    !pkg.payment_submitted ? (
                      <PayButton pkg={pkg} phone={phone} onSuccess={() => loadData(booking.case_number)} total={total} />
                    ) : (
                      <div className="text-center py-2 text-xs text-blue-600 bg-blue-50 rounded-xl border border-blue-100">⏳ پرداخت ثبت شد — در انتظار تأیید</div>
                    )
                  ) : booked < total_sessions ? (
                    <button onClick={() => { setSelectedPkg(pkg); setScheduleView(true) }}
                      className="w-full py-2.5 border-2 border-brand-600 text-brand-600 rounded-xl text-sm font-medium hover:bg-brand-50">
                      📅 انتخاب روزهای جلسات ({toFarsiNum(total_sessions - booked)} باقی‌مانده)
                    </button>
                  ) : (
                    <div className="text-center py-2 text-xs text-green-600 bg-green-50 rounded-xl border border-green-100">✅ همه‌ی جلسات انتخاب شد</div>
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
              <div className="text-center py-12 bg-white rounded-xl border border-gray-100 text-gray-400">
                <div className="text-3xl mb-2">📅</div>
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
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700 pb-2 border-b border-gray-100">اطلاعات پرونده</h3>
            {[
              ['نام کودک', booking.child_name],
              ['تاریخ تولد', booking.birth_date],
              ['پایه تحصیلی', booking.grade],
              ['نام پدر', booking.father_name],
              ['نام مادر', booking.mother_name],
              ['شماره پرونده', booking.case_number],
            ].map(([label, value]) => value ? (
              <div key={label} className="flex justify-between text-sm border-b border-gray-50 pb-2 last:border-0">
                <span className="text-gray-400">{label}</span>
                <span className="text-gray-800 font-medium">{value}</span>
              </div>
            ) : null)}
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

  const sessionPrice = s.session_type === 'online' ? PRICING.sessionOnline : PRICING.sessionOffline

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
    if (!res.ok) { uiAlert('ثبتِ پرداخت ناموفق بود'); return }
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
    confirmed: 'bg-green-50 text-green-700 border-green-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
    forfeited: 'bg-red-50 text-red-700 border-red-200',
    replaced: 'bg-gray-100 text-gray-500 border-gray-200',
    completed: 'bg-blue-50 text-blue-700 border-blue-200',
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    awaiting: 'bg-amber-50 text-amber-700 border-amber-200',
    awaiting_payment: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  const STATUS_LABEL: Record<string, string> = { confirmed: 'تایید شده', cancelled: 'کنسل شده', forfeited: 'سوخت شده', replaced: 'جایگزین شد', completed: 'برگزار شده', pending: 'در انتظار', awaiting: 'منتظر زمان‌بندی', awaiting_payment: 'منتظر پرداخت' }

  // جلسه‌ای که هنوز پرداخت نشده — فارغ از اینکه تاریخ/ساعتش (توسط دکتر) از قبل ثبت شده باشد یا نه
  const needsPayment = s.status === 'confirmed' && !s.paid
  // جلسه‌ی پرداخت‌شده ولی بدون تاریخ = منتظر انتخابِ زمان توسط مراجع
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
      uiAlert(`برای بازگشتِ ${toFarsiNum(refundPercent)}٪ مبلغ، شماره کارتِ ۱۶ رقمی را کامل وارد کنید.`)
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
      uiAlert(`جلسه کنسل شد. ${toFarsiNum(data.refund_percent ?? refundPercent)}٪ مبلغ (${refundAmount.toLocaleString()} تومان) پس از بررسی به کارتِ شما بازگردانده می‌شود.`)
    else
      uiAlert('جلسه کنسل شد و کلِ مبلغ آن سوخت. می‌توانید جلسه‌ی جدیدی خریداری کنید.')
    onUpdate()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{s.title || (num ? `جلسه ${toFarsiNum(num)}` : 'جلسه‌ی سوخته')}</span>
            <span className={`text-xs px-2 py-0.5 rounded border ${s.attendee === 'child' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'}`}>
              {s.attendee === 'child' ? 'کودک' : 'والدین'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLOR[displayStatus] || STATUS_COLOR.pending}`}>{STATUS_LABEL[displayStatus] || displayStatus}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {isAwaiting
              ? <span className="text-amber-600">منتظر انتخاب زمان</span>
              : (s.status === 'forfeited' || s.status === 'replaced')
                ? (s.refund_percent && s.refund_percent > 0
                    ? <span className="text-amber-600">{toFarsiNum(s.refund_percent || 0)}٪ بازپرداخت {s.refund_status === 'done' ? '— واریز شد ✅' : '— در انتظارِ بازپرداخت'}</span>
                    : <span className="text-red-500">سوخت شد — مبلغ برنگشت</span>)
                : <>{s.session_date} — {s.session_time}</>}
            {' | '}{s.session_type === 'online' ? '🎥 آنلاین' : '🏥 حضوری'}
          </div>
        </div>
        {canCancel && (
          <button onClick={() => setShowConfirm(true)}
            className="text-xs px-2.5 py-1 border border-red-200 text-red-500 rounded-lg hover:bg-red-50">
            کنسل
          </button>
        )}
      </div>

      {s.doctor_note_for_patient && (
        <div className="bg-blue-50 rounded-lg p-2.5 border border-blue-100 mt-2">
          <p className="text-xs text-blue-500 mb-0.5">یادداشت دکتر:</p>
          <p className="text-sm text-gray-700">{s.doctor_note_for_patient}</p>
        </div>
      )}

      {/* اقدامات بر اساس وضعیت */}
      {needsScheduling && (
        <button onClick={() => setShowSlot(true)}
          className="w-full mt-3 py-2.5 border-2 border-brand-600 text-brand-600 rounded-xl text-sm font-medium hover:bg-brand-50">
          📅 انتخاب زمان جلسه
        </button>
      )}
      {needsPayment && s.payment_submitted && (
        <div className="w-full mt-3 py-2.5 text-center text-xs text-blue-600 bg-blue-50 rounded-xl border border-blue-100">⏳ پرداخت ثبت شد — در انتظار تأیید</div>
      )}
      {needsPayment && !s.payment_submitted && (() => {
        const pm = settings.doctors.find(d => d.id === s.resource_id)?.payment_methods
        const onlineOn = !!pm?.online
        const cardOn = pm ? pm.card_to_card : true
        return !payOpen ? (
          <div className="mt-3 flex gap-2">
            {onlineOn && (
              <button onClick={paySessionOnline} disabled={onlineLoading}
                className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
                {onlineLoading ? 'در حال اتصال...' : `🌐 پرداختِ آنلاین ${sessionPrice.toLocaleString()}`}
              </button>
            )}
            {cardOn && (
              <button onClick={() => setPayOpen(true)}
                className={`py-2.5 rounded-xl text-sm font-medium ${onlineOn ? 'flex-1 border border-gray-300 text-gray-600' : 'w-full bg-brand-600 text-white'}`}>
                💳 {onlineOn ? 'کارت‌به‌کارت' : `پرداختِ کارت‌به‌کارت ${sessionPrice.toLocaleString()} تومان`}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-3 text-right">
            <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 mb-2">
              <CardChooser cards={settings.cards} loaded={settings.loaded} />
            </div>
            <label className="text-xs text-gray-500 mb-1 block">متن فیش واریزی <span className="text-red-500">*</span></label>
            <textarea value={payRef} onChange={e => setPayRef(e.target.value)} rows={2} placeholder="اطلاعات فیش واریزی..."
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-brand-400 mb-2 resize-none" />
            <button onClick={paySession} disabled={paying || !payRef.trim()}
              className="w-full py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
              {paying ? 'در حال ثبت...' : '✅ پرداخت کردم'}
            </button>
          </div>
        )
      })()}
      {s.status === 'forfeited' && features.patient_buy_extra_session && (
        <button onClick={buyReplacement} disabled={buying}
          className="w-full mt-3 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
          {buying ? 'در حال ساخت...' : '🔄 خرید جلسه‌ی جایگزین'}
        </button>
      )}

      {showSlot && (
        <SlotPicker session={s} phone={phone} caseNumber={caseNumber} resourceId={s.resource_id}
          onClose={() => setShowSlot(false)}
          onDone={() => { setShowSlot(false); onUpdate() }} />
      )}

      {/* Cancel Confirm */}
      {showConfirm && (
        <div className="mt-3 bg-red-50 rounded-xl border border-red-100 p-3">
          <p className="text-sm text-red-700 mb-1 font-medium">شرایط کنسل را بخوانید</p>
          {!s.paid ? (
            <p className="text-xs text-gray-600 mb-3">
              این جلسه هنوز پرداخت نشده؛ با کنسل‌کردن فقط زمانش آزاد می‌شود و مبلغی کسر نمی‌شود.
            </p>
          ) : needsRefundCard ? (
            <>
              <p className="text-xs text-gray-600 mb-3">
                {isPartial ? <>بیشتر از {toFarsiNum(policy.threshold_hours)} ساعت تا جلسه مانده.</> : <>کمتر از {toFarsiNum(policy.threshold_hours)} ساعت تا جلسه مانده.</>} با کنسل‌کردن{' '}
                <strong>{toFarsiNum(refundPercent)}٪ مبلغ ({refundAmount.toLocaleString()} تومان)</strong> پس از بررسی به کارتِ شما بازگردانده می‌شود.
              </p>
              <label className="text-xs text-gray-500 mb-1 block">شماره کارت برای واریزِ بازپرداخت <span className="text-red-500">*</span></label>
              <input value={refundCard} onChange={e => setRefundCard(e.target.value)} dir="ltr"
                placeholder="6037-0000-0000-0000" inputMode="numeric"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg font-mono tracking-wider focus:outline-none focus:border-brand-400 mb-3" />
            </>
          ) : (
            <p className="text-xs text-red-500 mb-3">
              {isPartial ? <>بیشتر از {toFarsiNum(policy.threshold_hours)} ساعت تا جلسه مانده، ولی</> : <>چون کمتر از {toFarsiNum(policy.threshold_hours)} ساعت تا جلسه مانده،</>} با کنسل‌کردن{' '}
              <strong>کل مبلغ این جلسه سوخت می‌شود</strong> و برنمی‌گردد. می‌توانید بعداً جلسه‌ی جدیدی خریداری کنید. مطمئنید؟
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowConfirm(false)}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-xs text-gray-500">انصراف</button>
            <button onClick={cancelSession} disabled={cancelling}
              className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs disabled:opacity-40">
              {cancelling ? 'در حال کنسل...' : !s.paid ? '✅ تایید کنسل' : needsRefundCard ? `✅ تایید و کنسل (${toFarsiNum(refundPercent)}٪ بازپرداخت)` : '✅ تایید و سوختِ مبلغ'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== PAY BUTTON (کارت‌به‌کارتِ پروتکل درمان) ====================
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
    if (!res.ok) { uiAlert('ثبتِ پرداخت ناموفق بود'); return }
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
          className="flex-1 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
          {onlineLoading ? 'در حال اتصال...' : `🌐 پرداختِ آنلاین ${total.toLocaleString()}`}
        </button>
      )}
      {cardOn && (
        <button onClick={() => setOpen(true)}
          className={`py-2.5 rounded-xl text-sm font-medium ${onlineOn ? 'flex-1 border border-gray-300 text-gray-600' : 'w-full bg-brand-600 text-white'}`}>
          💳 {onlineOn ? 'کارت‌به‌کارت' : `پرداختِ کارت‌به‌کارت ${total.toLocaleString()} تومان`}
        </button>
      )}
    </div>
  )

  return (
    <div className="text-right">
      <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 mb-2">
        <CardChooser cards={settings.cards} loaded={settings.loaded} />
      </div>
      <label className="text-xs text-gray-500 mb-1 block">متن فیش واریزی <span className="text-red-500">*</span></label>
      <textarea value={ref} onChange={e => setRef(e.target.value)} rows={3} placeholder="اطلاعات فیش واریزی را وارد کنید..."
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-brand-400 mb-2 resize-none" />
      <button onClick={pay} disabled={paying || !ref.trim()}
        className="w-full py-2.5 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
        {paying ? 'در حال ثبت...' : '✅ پرداخت کردم'}
      </button>
      <p className="text-[11px] text-gray-400 mt-1.5 text-center">پس از واریز، متنِ فیش را وارد و «پرداخت کردم» را بزنید تا بررسی و تأیید شود.</p>
    </div>
  )
}

// ==================== SLOT PICKER (تک‌جلسه‌ای) ====================
function SlotPicker({ session, phone, caseNumber, onClose, onDone, title = 'انتخاب زمان جلسه', onConfirm, resourceId }: {
  session?: Session; phone: string; caseNumber: string; onClose: () => void; onDone: () => void
  title?: string; onConfirm?: (date: string, time: string) => Promise<{ ok: boolean; error?: string }>
  resourceId?: string | null
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
    const want = session?.session_type // 'online' | 'offline' | undefined
    return base.filter(t => {
      const ts = jalaliDateTimeToTimestamp(`${curYear}/${curMonth + 1}/${d}`, t)
      if (!(ts === null || ts > Date.now())) return false
      // اسلاتِ بدونِ نوع برای هر دو آزاد است؛ در غیرِ این صورت باید با نوعِ جلسه بخواند
      const st = dayTypes[t]
      return !want || !st || st === want
    })
  }
  const availDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    .filter(d => !isPastDay(d) && slotsForDay(d).length > 0)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4" dir="rtl">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 text-lg leading-none">✕</button>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => changeMonth(-1)} className="w-8 h-8 border border-gray-200 rounded-lg text-gray-500">›</button>
            <span className="text-sm font-medium text-gray-800">{PERSIAN_MONTHS[curMonth]} {toFarsiNum(curYear)}</span>
            <button onClick={() => changeMonth(1)} className="w-8 h-8 border border-gray-200 rounded-lg text-gray-500">‹</button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {PERSIAN_WEEKDAYS.map(d => <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 mb-4">
            {Array(startDay).fill(null).map((_, i) => <div key={i} />)}
            {Array(daysInMonth).fill(null).map((_, i) => {
              const d = i + 1
              const hasSlot = !loadingSched && availDays.includes(d)
              const isSel = selectedDay === d
              return (
                <div key={d} onClick={() => { if (hasSlot) { setSelectedDay(d); setSelectedSlot('') } }}
                  className={`text-center py-2 rounded-lg text-sm ${hasSlot ? 'cursor-pointer hover:bg-brand-50' : 'text-gray-300'} ${isSel ? 'bg-brand-50 text-brand-800 font-medium' : 'text-gray-700'}`}>
                  {toFarsiNum(d)}
                  {hasSlot && <span className="block w-1 h-1 rounded-full bg-brand-400 mx-auto mt-0.5" />}
                </div>
              )
            })}
          </div>
          {loadingSched && (
            <p className="text-center text-xs text-gray-400 mb-4">در حال بارگذاری برنامه...</p>
          )}
          {!loadingSched && availDays.length === 0 && (
            <p className="text-center text-xs text-gray-400 mb-4">برای این ماه ساعت آزادی موجود نیست.</p>
          )}
          {selectedDay && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {slotsForDay(selectedDay).map(slot => (
                <div key={slot} onClick={() => setSelectedSlot(slot)}
                  className={`text-center py-2 border rounded-lg text-sm cursor-pointer ${selectedSlot === slot ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 text-gray-500'}`}>
                  {slot}
                </div>
              ))}
            </div>
          )}
          <button onClick={confirm} disabled={!selectedDay || !selectedSlot || saving}
            className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
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

  const totalNeeded = pkg.child_sessions + pkg.parent_sessions
  const alreadyBooked = existingSessions.length
  const remaining = totalNeeded - alreadyBooked
  const totalSelected = Object.values(selectedSlots).reduce((a, b) => a + b.length, 0)

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
      setSelectedSlots(prev => ({ ...prev, [day]: [...current, slot] }))
      const defaultAttendee = Object.values(attendeeMap).filter(v => v === 'child').length < pkg.child_sessions ? 'child' : 'parent'
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
          session_type: pkg.child_session_type,
          attendee: attendeeMap[`${day}-${slot}`] || 'child',
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
      uiAlert(data.error || 'ثبت جلسه ناموفق بود. لطفاً دوباره تلاش کنید.')
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
    const wanted = new Set([pkg.child_session_type, pkg.parent_session_type])
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
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">انتخاب روزهای جلسه</h2>
            <p className="text-xs text-gray-400 mt-0.5">{totalSelected} از {remaining} جلسه انتخاب شده</p>
          </div>
          <button onClick={onClose} className="text-gray-400 text-2xl w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="p-4">
          {/* Progress */}
          <div className="bg-gray-100 rounded-full h-2 mb-4">
            <div className="bg-brand-600 h-2 rounded-full transition-all" style={{ width: `${(totalSelected / remaining) * 100}%` }} />
          </div>

          {/* Calendar */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => changeMonth(-1)} className="w-8 h-8 border border-gray-200 rounded-lg text-gray-500 flex items-center justify-center">›</button>
            <h3 className="text-sm font-medium">{PERSIAN_MONTHS[curMonth]} {toFarsiNum(curYear)}</h3>
            <button onClick={() => changeMonth(1)} className="w-8 h-8 border border-gray-200 rounded-lg text-gray-500 flex items-center justify-center">‹</button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {PERSIAN_WEEKDAYS.map(d => <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>)}
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
                    ${isPast || !hasSlots ? 'text-gray-300 cursor-default' : 'cursor-pointer hover:bg-brand-50'}
                    ${isSelected ? 'bg-brand-50 text-brand-800 font-medium ring-1 ring-brand-400' : ''}
                  `}>
                  {toFarsiNum(d)}
                  {hasSlots && !isPast && <span className="block w-1 h-1 rounded-full bg-brand-400 mx-auto mt-0.5" />}
                  {daySelections > 0 && (
                    <span className="absolute -top-1 -left-1 w-4 h-4 bg-brand-600 text-white text-xs rounded-full flex items-center justify-center">
                      {daySelections}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {loadingSched && (
            <p className="text-center text-xs text-gray-400 mb-4">در حال بارگذاری برنامه...</p>
          )}

          {/* Time Slots */}
          {selectedDay && availableSlots.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-medium text-gray-600 mb-2">{toFarsiNum(selectedDay)} {PERSIAN_MONTHS[curMonth]} — ساعت‌های خالی:</h4>
              <div className="grid grid-cols-3 gap-2">
                {availableSlots.map(slot => {
                  const key = `${selectedDay}-${slot}`
                  const isChosen = (selectedSlots[selectedDay] || []).includes(slot)
                  const attendee = attendeeMap[key]
                  return (
                    <div key={slot}>
                      <div onClick={() => selectSlot(selectedDay, slot)}
                        className={`text-center py-2 border rounded-lg text-sm cursor-pointer transition-all ${isChosen ? 'border-brand-600 bg-brand-50 text-brand-800 font-medium' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                        {slot}
                      </div>
                      {isChosen && pkg.parent_sessions > 0 && (
                        <div className="flex mt-1 gap-1">
                          {['child', 'parent'].map(a => (
                            <button key={a} onClick={() => setAttendeeMap(prev => ({ ...prev, [key]: a }))}
                              className={`flex-1 text-xs py-0.5 rounded border transition-all ${attendee === a ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-400'}`}>
                              {a === 'child' ? 'کودک' : 'والدین'}
                            </button>
                          ))}
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
              <h4 className="text-xs font-medium text-gray-600 mb-2">جلسات انتخاب شده:</h4>
              {Object.entries(selectedSlots).filter(([, slots]) => slots.length > 0).map(([day, slots]) =>
                slots.map(slot => (
                  <div key={`${day}-${slot}`} className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{toFarsiNum(parseInt(day))} {PERSIAN_MONTHS[curMonth]} — {slot}</span>
                    <span className={attendeeMap[`${day}-${slot}`] === 'child' ? 'text-blue-600' : 'text-purple-600'}>
                      {attendeeMap[`${day}-${slot}`] === 'child' ? 'کودک' : 'والدین'}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          <button onClick={confirmSessions} disabled={totalSelected < remaining || saving}
            className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
            {saving ? 'در حال ثبت...' : totalSelected < remaining ? `${remaining - totalSelected} جلسه دیگر انتخاب کنید` : '✅ ثبت روزهای جلسات'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== STAGE HELPERS (مراحلِ پیش‌از‌درمان) ====================
function StageHero({ icon, title, desc, red }: { icon: string; title: string; desc: string; red?: boolean }) {
  return (
    <>
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl ${red ? 'bg-red-50' : 'bg-brand-50'}`}>{icon}</div>
      <h2 className="text-base font-medium text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-500 mb-4">{desc}</p>
    </>
  )
}

function StageWaiting({ title, desc }: { title: string; desc: string }) {
  return (
    <>
      <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4 text-3xl">⏳</div>
      <h2 className="text-base font-medium text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-500">{desc}</p>
    </>
  )
}

function StageInfo({ icon, title, desc, date, time, label }: { icon: string; title: string; desc: string; date?: string; time?: string; label: string }) {
  return (
    <>
      <StageHero icon={icon} title={title} desc={desc} />
      {date && (
        <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
          {label}: {date} — {time}
        </div>
      )}
    </>
  )
}

// کارتِ پرداختِ کارت‌به‌کارت — شماره کارت + کد رهگیریِ اختیاری + دکمه‌ی «پرداخت کردم»
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
    if (!ok) { uiAlert('ثبتِ پرداخت ناموفق بود. دوباره تلاش کنید.'); return }
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
        <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4 text-3xl">{icon}</div>
        <h2 className="text-base font-medium text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-4">{desc}</p>
      </div>

      <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">مبلغ قابل پرداخت</span>
          <span className="text-base font-bold text-brand-700">{amount.toLocaleString()} تومان</span>
        </div>
      </div>

      {onlineOn && cardOn && (
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

      {method === 'online' && onlineOn ? (
        <>
          <p className="text-xs text-gray-500 mb-3 text-center">بعدِ پرداخت بلافاصله می‌توانید ادامه دهید.</p>
          <button onClick={payOnline} disabled={onlineLoading}
            className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
            {onlineLoading ? 'در حال اتصال به درگاه...' : '🌐 پرداختِ آنلاین'}
          </button>
        </>
      ) : (
        <>
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-3 mb-3">
            <CardChooser cards={settings.cards} loaded={settings.loaded} />
          </div>
          <label className="text-xs text-gray-500 mb-1 block">متن فیش واریزی <span className="text-red-500">*</span></label>
          <textarea value={ref} onChange={e => setRef(e.target.value)} rows={3} placeholder="اطلاعات فیش واریزی را وارد کنید (کد پیگیری، شماره کارت مبدأ، تاریخ و ساعت واریز...)"
            className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-brand-400 mb-3 resize-none" />
          <button onClick={submit} disabled={submitting || !ref.trim()}
            className="w-full py-3 bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">
            {submitting ? 'در حال ثبت...' : '✅ پرداخت کردم'}
          </button>
          <p className="text-[11px] text-gray-400 mt-2 text-center">پس از واریز، متنِ فیش را وارد و «پرداخت کردم» را بزنید تا بررسی و تأیید شود.</p>
        </>
      )}
    </div>
  )
}

// نوارِ پیشرفتِ مراحل — حالا طولش متغیر است (هر تعداد مصاحبه/ارزیابی که واقعاً وجود دارد) + درمان در انتها
function StageProgress({ stages, inTreatment }: { stages: CaseStage[]; inTreatment: boolean }) {
  const items = stages.map(s => ({
    icon: s.stage_type === 'assessment' ? '🧩' : '🩺',
    label: STAGE_TYPE_LABEL[s.stage_type] || s.stage_type,
    done: s.status === 'booked' && !!s.held,
    current: !(s.status === 'booked' && !!s.held),
  }))
  items.push({ icon: '📦', label: 'درمان', done: inTreatment, current: false })
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center justify-between overflow-x-auto">
      {items.map((it, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium
              ${it.done ? 'bg-green-500 text-white' : it.current ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
              {it.done ? '✓' : it.icon}
            </div>
            <span className={`text-[11px] whitespace-nowrap ${it.current ? 'text-brand-700 font-medium' : 'text-gray-400'}`}>{it.label}</span>
          </div>
          {i < items.length - 1 && <div className={`flex-1 h-px mx-2 ${it.done ? 'bg-green-400' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  )
}