'use client'
// ─────────────────────────────────────────────────────────────────────────────
// «نوبت‌های من» — پنلِ مینیمالِ مراجع: ورود با OTP، لیستِ نوبت‌ها، لغوِ آینده‌ها
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { toFarsiNum, toLatinNum, PERSIAN_MONTHS } from '@/lib/calendar'
import { BOOKING_STATUS_LABEL } from '@/lib/config'

type Booking = {
  id: string; booking_date: string; booking_time: string; booking_ts: number
  status: string; price_snapshot: number; payment_ref: string | null
  services: { name: string; mode: string; duration_minutes: number } | null
}

const STATUS_STYLE: Record<string, string> = {
  pending_payment: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  completed: 'bg-sand text-soot border-sand',
  no_show: 'bg-red-50 text-red-600 border-red-200',
}

function fmtDate(dateStr: string): string {
  const [y, m, d] = toLatinNum(dateStr).split('/').map(Number)
  return `${toFarsiNum(d)} ${PERSIAN_MONTHS[m - 1]} ${toFarsiNum(y)}`
}

function MyBookings() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const { uiAlert, uiConfirm } = useDialog()

  const [authed, setAuthed] = useState<boolean | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [phone, setPhone] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [devCode, setDevCode] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/t/${slug}/my`)
    if (r.status === 401) { setAuthed(false); return }
    if (!r.ok) { setAuthed(false); return }
    const d = await r.json()
    setBookings(d.bookings || []); setAuthed(true)
  }, [slug])

  useEffect(() => { load() }, [load])

  async function sendOtp() {
    setBusy(true)
    const r = await fetch(`/api/t/${slug}/otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { uiAlert(d.error || 'خطا'); return }
    setOtpSent(true); setDevCode(d.dev_code || '')
  }

  async function verify() {
    setBusy(true)
    const r = await fetch(`/api/t/${slug}/otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { uiAlert(d.error || 'کد نادرست است'); return }
    load()
  }

  async function cancel(b: Booking) {
    if (!await uiConfirm('این نوبت لغو شود؟')) return
    const r = await fetch(`/api/t/${slug}/my`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: b.id }),
    })
    const d = await r.json()
    if (!r.ok) { uiAlert(d.error || 'لغو انجام نشد'); return }
    load()
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-md mx-auto px-5 py-6 pb-24">
        <button onClick={() => router.push(`/${slug}`)} className="text-xs text-soot mb-4">‹ بازگشت</button>
        <h1 className="text-xl font-extrabold mb-5">نوبت‌های من</h1>

        {authed === null && <div className="text-sm text-soot">در حالِ بارگذاری…</div>}

        {authed === false && (
          <div className="space-y-3">
            <p className="text-sm text-soot">برای دیدنِ نوبت‌ها، شماره‌ی موبایلی که با آن رزرو کرده‌اید را تایید کنید.</p>
            <input value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" inputMode="tel"
              placeholder="0912…" className="w-full p-3 rounded-xl border border-sand bg-white text-sm tnum" />
            {!otpSent ? (
              <button onClick={sendOtp} disabled={busy}
                className="w-full py-3 rounded-2xl bg-accent text-white font-medium disabled:opacity-50">
                دریافتِ کدِ تایید
              </button>
            ) : (
              <>
                {devCode && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    کدِ تست (تا اتصالِ پیامک): <strong className="tnum">{devCode}</strong>
                  </div>
                )}
                <input value={code} onChange={e => setCode(e.target.value)} dir="ltr" inputMode="numeric"
                  placeholder="کدِ ۴ رقمی" className="w-full p-3 rounded-xl border border-sand bg-white text-sm tnum text-center" />
                <button onClick={verify} disabled={busy}
                  className="w-full py-3 rounded-2xl bg-accent text-white font-medium disabled:opacity-50">
                  ورود
                </button>
              </>
            )}
          </div>
        )}

        {authed && bookings.length === 0 && (
          <div className="rounded-2xl border border-sand bg-white p-6 text-center text-sm text-soot">
            هنوز نوبتی ندارید.
          </div>
        )}

        {authed && bookings.length > 0 && (
          <div className="space-y-3">
            {bookings.map(b => {
              const future = b.booking_ts > Date.now()
              const cancellable = future && ['pending_payment', 'payment_submitted', 'confirmed'].includes(b.status)
              return (
                <div key={b.id} className="rounded-2xl border border-sand bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-sm">{b.services?.name || 'جلسه'}</div>
                      <div className="mt-1 text-xs text-soot">
                        {fmtDate(b.booking_date)} · ساعتِ <span className="tnum">{toFarsiNum(b.booking_time)}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${STATUS_STYLE[b.status] || ''}`}>
                      {BOOKING_STATUS_LABEL[b.status] || b.status}
                    </span>
                  </div>
                  {b.status === 'pending_payment' && future && (
                    <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2.5 leading-relaxed">
                      این نوبت هنوز پرداخت نشده و قطعی نیست.
                    </p>
                  )}
                  {cancellable && (
                    <button onClick={() => cancel(b)}
                      className="mt-3 w-full py-2 rounded-xl border border-red-200 text-red-600 text-xs">
                      لغوِ نوبت
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

export default function Page() {
  return <DialogProvider><MyBookings /></DialogProvider>
}
