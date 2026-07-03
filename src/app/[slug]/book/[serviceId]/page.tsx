'use client'
// ─────────────────────────────────────────────────────────────────────────────
// فلوی رزرو — تک‌صفحه، سه گام:
// ۱) انتخابِ روز (تقویمِ جلالی؛ روزها بی‌درنگ، دسترس‌پذیری آسنکرون) و ساعت
// ۲) شماره‌ی موبایل + OTP + نام (ورود و رزرو یکی می‌شوند)
// ۳) کارت‌به‌کارت و اعلامِ پرداخت
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import MonthCalendar from '@/components/MonthCalendar'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { getCurrentJalali, jalaliKey, toFarsiNum, toLatinNum, PERSIAN_MONTHS } from '@/lib/calendar'
import { MODE_LABEL } from '@/lib/config'

type Service = { id: string; name: string; duration_minutes: number; price: number; mode: string }
type Profile = { display_name: string; theme_color: string }
type Resource = { id: string; name: string; title: string; avatar_url: string | null; is_selectable: boolean }
type Labels = { client: string; resource: string; booking: string }

function fmtDate(dateStr: string): string {
  const [y, m, d] = toLatinNum(dateStr).split('/').map(Number)
  return `${toFarsiNum(d)} ${PERSIAN_MONTHS[m - 1]} ${toFarsiNum(y)}`
}

function BookingFlow() {
  const { slug, serviceId } = useParams<{ slug: string; serviceId: string }>()
  const router = useRouter()
  const { uiAlert } = useDialog()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [service, setService] = useState<Service | null>(null)
  const [resources, setResources] = useState<Resource[]>([])
  const [labels, setLabels] = useState<Labels>({ client: 'مراجع', resource: 'ارائه‌دهنده', booking: 'نوبت' })
  const [pickedResource, setPickedResource] = useState<string | null>(null) // null = هر کسی که آزاد بود
  const [loadErr, setLoadErr] = useState(false)

  // گام ۱
  const now = getCurrentJalali()
  const [calY, setCalY] = useState(now.year)
  const [calM, setCalM] = useState(now.month)
  const [monthAvail, setMonthAvail] = useState<Record<number, number>>({})
  const [pickedDate, setPickedDate] = useState('')
  const [daySlots, setDaySlots] = useState<string[] | null>(null)
  const [pickedTime, setPickedTime] = useState('')

  // گام ۲
  const [step, setStep] = useState(1)
  const [phone, setPhone] = useState('')
  const [devCode, setDevCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [code, setCode] = useState('')
  const [verified, setVerified] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // گام ۳
  const [payInfo, setPayInfo] = useState<{ booking_id: string; amount: number; card_number: string; card_holder_name: string } | null>(null)
  const [payRef, setPayRef] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/t/${slug}/public`).then(r => r.json()).then(d => {
      if (!d.profile) { setLoadErr(true); return }
      setProfile(d.profile)
      if (d.labels) setLabels(d.labels)
      setResources(d.resources || [])
      const s = (d.services || []).find((x: Service) => x.id === serviceId)
      if (!s) { setLoadErr(true); return }
      setService(s)
    }).catch(() => setLoadErr(true))
  }, [slug, serviceId])

  const loadMonth = useCallback(async (y: number, m: number) => {
    setMonthAvail({})
    const rp = pickedResource ? `&resource=${pickedResource}` : ''
    const r = await fetch(`/api/t/${slug}/availability?service=${serviceId}&month=${y}/${m}${rp}`)
    const d = await r.json()
    if (d.days) setMonthAvail(d.days)
  }, [slug, serviceId, pickedResource])

  useEffect(() => { loadMonth(calY, calM) }, [calY, calM, loadMonth])

  async function pickDay(day: number) {
    const dateStr = jalaliKey(calY, calM, day)
    setPickedDate(dateStr); setPickedTime(''); setDaySlots(null)
    const rp = pickedResource ? `&resource=${pickedResource}` : ''
    const r = await fetch(`/api/t/${slug}/availability?service=${serviceId}&date=${dateStr}${rp}`)
    const d = await r.json()
    setDaySlots(d.slots || [])
  }

  function prevMonth() { if (calM === 1) { setCalM(12); setCalY(calY - 1) } else setCalM(calM - 1); setPickedDate(''); setDaySlots(null); setPickedTime('') }
  function nextMonth() { if (calM === 12) { setCalM(1); setCalY(calY + 1) } else setCalM(calM + 1); setPickedDate(''); setDaySlots(null); setPickedTime('') }

  async function sendOtp() {
    setBusy(true)
    const r = await fetch(`/api/t/${slug}/otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { uiAlert(d.error || 'خطا در ارسالِ کد'); return }
    setOtpSent(true); setDevCode(d.dev_code || '')
  }

  async function verifyCode() {
    setBusy(true)
    const r = await fetch(`/api/t/${slug}/otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { uiAlert(d.error || 'کد نادرست است'); return }
    setVerified(true)
  }

  async function submitBooking() {
    if (!name.trim()) { uiAlert('نامِ خود را بنویسید'); return }
    setBusy(true)
    const r = await fetch(`/api/t/${slug}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: serviceId, resource_id: pickedResource, date: pickedDate, time: pickedTime, client_name: name, client_note: note }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) {
      uiAlert(d.error || 'خطا در ثبتِ رزرو')
      if (r.status === 409) { setStep(1); setPickedTime(''); pickDay(parseInt(toLatinNum(pickedDate).split('/')[2])) }
      return
    }
    setPayInfo(d); setStep(3)
  }

  async function submitPayment() {
    if (!payInfo) return
    setBusy(true)
    const r = await fetch(`/api/t/${slug}/pay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: payInfo.booking_id, payment_ref: payRef }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { uiAlert(d.error || 'خطا در ثبت'); return }
    setDone(true)
  }

  if (loadErr) return <main className="min-h-screen flex items-center justify-center p-6 text-sm text-soot">صفحه یافت نشد.</main>
  if (!service || !profile) return <main className="min-h-screen flex items-center justify-center p-6 text-sm text-soot">در حالِ بارگذاری…</main>

  const steps = ['زمان', 'مشخصات', 'پرداخت']

  return (
    <main className="min-h-screen" style={{ ['--brand' as any]: profile.theme_color }}>
      <div className="max-w-md mx-auto px-5 py-6 pb-24">
        {/* سربرگ */}
        <button onClick={() => router.push(`/${slug}`)} className="text-xs text-soot mb-4">‹ بازگشت به صفحه‌ی {profile.display_name}</button>
        <div className="rounded-2xl border border-sand bg-white p-4 mb-5">
          <div className="font-bold">{service.name}</div>
          <div className="mt-1 text-xs text-soot">
            {toFarsiNum(service.duration_minutes)} دقیقه · {MODE_LABEL[service.mode] || service.mode} · <span className="tnum">{toFarsiNum(service.price.toLocaleString('en-US'))}</span> تومان
          </div>
        </div>

        {/* ریلِ گام‌ها */}
        <div className="flex items-center gap-2 mb-6">
          {steps.map((label, i) => (
            <div key={label} className="flex-1 text-center">
              <div className={`h-1.5 rounded-full ${i + 1 <= step ? 'bg-accent' : 'bg-sand'}`} />
              <div className={`mt-1.5 text-[11px] ${i + 1 === step ? 'text-ink font-bold' : 'text-soot'}`}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── گام ۱: تقویم و ساعت ── */}
        {step === 1 && (
          <div>
            {/* انتخابِ پرسنل — فقط اگر بیش از یک منبعِ انتخاب‌شدنی باشد */}
            {resources.length > 1 && (
              <div className="mb-5">
                <div className="text-xs font-bold text-soot mb-2">انتخابِ {labels.resource}</div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { setPickedResource(null); setPickedDate(''); setDaySlots(null); setPickedTime('') }}
                    className={`px-4 py-2.5 rounded-xl text-sm border ${pickedResource === null ? 'bg-accent text-white border-accent font-bold' : 'bg-white border-sand text-soot'}`}>
                    هر کسی که آزاد بود
                  </button>
                  {resources.map(r => (
                    <button key={r.id} onClick={() => { setPickedResource(r.id); setPickedDate(''); setDaySlots(null); setPickedTime('') }}
                      className={`px-4 py-2.5 rounded-xl text-sm border ${pickedResource === r.id ? 'bg-accent text-white border-accent font-bold' : 'bg-white border-sand text-soot'}`}>
                      {r.name}{r.title ? ` · ${r.title}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <MonthCalendar year={calY} month={calM} onPrev={prevMonth} onNext={nextMonth}
              renderDay={day => {
                const dateStr = jalaliKey(calY, calM, day)
                const avail = monthAvail[day]
                const hasFree = (avail ?? 0) > 0
                const isPicked = pickedDate === dateStr
                return (
                  <button onClick={() => hasFree && pickDay(day)} disabled={!hasFree}
                    className={`w-full aspect-square rounded-xl text-sm transition-colors
                      ${isPicked ? 'bg-accent text-white font-bold'
                        : hasFree ? 'bg-white border border-sand hover:border-accent'
                        : 'text-soot/40'}`}>
                    {toFarsiNum(day)}
                  </button>
                )
              }} />

            {pickedDate && (
              <div className="mt-5">
                <div className="text-xs font-bold text-soot mb-2">ساعت‌های خالیِ {fmtDate(pickedDate)}</div>
                {daySlots === null ? (
                  <div className="text-xs text-soot">در حالِ بارگذاری…</div>
                ) : daySlots.length === 0 ? (
                  <div className="text-xs text-soot">این روز ساعتِ خالی ندارد.</div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {daySlots.map(t => (
                      <button key={t} onClick={() => setPickedTime(t)}
                        className={`py-2.5 rounded-xl text-sm tnum border
                          ${pickedTime === t ? 'bg-accent text-white border-accent font-bold' : 'bg-white border-sand'}`}>
                        {toFarsiNum(t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setStep(2)} disabled={!pickedDate || !pickedTime}
              className="w-full mt-6 py-3 rounded-2xl bg-accent text-white font-medium disabled:opacity-30">
              ادامه
            </button>
          </div>
        )}

        {/* ── گام ۲: شماره + OTP + نام ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-sand bg-white p-4 text-sm">
              🗓 {fmtDate(pickedDate)} · ساعتِ <span className="tnum">{toFarsiNum(pickedTime)}</span>
              <button onClick={() => setStep(1)} className="text-accent text-xs mr-2 underline underline-offset-4">تغییر</button>
            </div>

            {!verified ? (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-soot">شماره‌ی موبایل</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" inputMode="tel"
                  placeholder="0912…" className="w-full p-3 rounded-xl border border-sand bg-white text-sm tnum" />
                {!otpSent ? (
                  <button onClick={sendOtp} disabled={busy}
                    className="w-full py-3 rounded-2xl bg-accent text-white font-medium disabled:opacity-50">
                    {busy ? 'در حالِ ارسال…' : 'دریافتِ کدِ تایید'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    {devCode && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                        کدِ تست (تا اتصالِ پیامک): <strong className="tnum">{devCode}</strong>
                      </div>
                    )}
                    <input value={code} onChange={e => setCode(e.target.value)} dir="ltr" inputMode="numeric"
                      placeholder="کدِ ۴ رقمی" className="w-full p-3 rounded-xl border border-sand bg-white text-sm tnum text-center" />
                    <button onClick={verifyCode} disabled={busy}
                      className="w-full py-3 rounded-2xl bg-accent text-white font-medium disabled:opacity-50">
                      تاییدِ کد
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
                  ✓ شماره‌ی <span className="tnum">{toFarsiNum(phone)}</span> تایید شد
                </div>
                <label className="block text-xs font-bold text-soot">نام و نام‌خانوادگی</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  className="w-full p-3 rounded-xl border border-sand bg-white text-sm" />
                <label className="block text-xs font-bold text-soot">توضیح برای متخصص (اختیاری)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  className="w-full p-3 rounded-xl border border-sand bg-white text-sm" />
                <button onClick={submitBooking} disabled={busy}
                  className="w-full py-3 rounded-2xl bg-accent text-white font-medium disabled:opacity-50">
                  {busy ? 'در حالِ ثبت…' : 'ثبتِ نوبت و رفتن به پرداخت'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── گام ۳: پرداخت ── */}
        {step === 3 && payInfo && !done && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-sand bg-white p-5">
              <div className="text-xs text-soot mb-1">مبلغِ قابلِ پرداخت</div>
              <div className="text-2xl font-extrabold tnum">{toFarsiNum(payInfo.amount.toLocaleString('en-US'))} <span className="text-sm font-normal">تومان</span></div>
              <div className="mt-4 pt-4 border-t border-sand">
                <div className="text-xs text-soot mb-1">کارت‌به‌کارت به</div>
                <div className="text-lg font-bold tnum tracking-wider" dir="ltr">
                  {toFarsiNum((payInfo.card_number || '').replace(/(\d{4})(?=\d)/g, '$1-'))}
                </div>
                <div className="text-xs text-soot mt-1">به نامِ {payInfo.card_holder_name}</div>
              </div>
            </div>
            <label className="block text-xs font-bold text-soot">شماره‌ی پیگیری یا ۴ رقمِ آخرِ کارتِ خودتان</label>
            <input value={payRef} onChange={e => setPayRef(e.target.value)} dir="ltr"
              className="w-full p-3 rounded-xl border border-sand bg-white text-sm tnum" />
            <button onClick={submitPayment} disabled={busy || !payRef.trim()}
              className="w-full py-3 rounded-2xl bg-accent text-white font-medium disabled:opacity-30">
              {busy ? 'در حالِ ثبت…' : 'پرداخت کردم — ثبتِ نهایی'}
            </button>
            <p className="text-[11px] text-soot leading-relaxed">
              پس از تاییدِ پرداخت توسطِ {profile.display_name}، نوبتِ شما قطعی می‌شود. وضعیت را از «نوبت‌های من» دنبال کنید.
            </p>
          </div>
        )}

        {/* ── پایان ── */}
        {done && (
          <div className="text-center py-10">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="font-extrabold text-lg mb-2">پرداختِ شما ثبت شد</h2>
            <p className="text-sm text-soot leading-relaxed mb-6">
              نوبتِ {fmtDate(pickedDate)} ساعتِ <span className="tnum">{toFarsiNum(pickedTime)}</span> پس از تاییدِ پرداخت قطعی می‌شود.
            </p>
            <button onClick={() => router.push(`/${slug}/my`)}
              className="w-full py-3 rounded-2xl bg-accent text-white font-medium">
              مشاهده‌ی نوبت‌های من
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function Page() {
  return <DialogProvider><BookingFlow /></DialogProvider>
}
