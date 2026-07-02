'use client'
// ─────────────────────────────────────────────────────────────────────────────
// پنلِ متخصص — چهار تب: نوبت‌ها / تقویم / تنظیمات / لینکِ من
// ورود: OTP به شماره‌ی صاحبِ پنل (شماره هرگز در UI فاش نمی‌شود)
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import MonthCalendar from '@/components/MonthCalendar'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { getCurrentJalali, jalaliKey, toFarsiNum, toLatinNum, PERSIAN_MONTHS, PERSIAN_WEEKDAYS_FULL } from '@/lib/calendar'
import { BOOKING_STATUS_LABEL, MODE_LABEL } from '@/lib/config'

type Booking = {
  id: string; booking_date: string; booking_time: string; booking_ts: number
  client_name: string; client_phone: string; status: string
  payment_ref: string | null; price_snapshot: number; client_note: string
  services: { name: string; mode: string; duration_minutes: number } | null
}
type Service = {
  id: string; name: string; duration_minutes: number; price: number
  mode: string; description: string; is_active: boolean; sort_order: number
}
type WeeklyRow = { weekday: number; start_time: string; end_time: string; mode: string }
type Override = { id: string; date: string; type: string }
type Profile = {
  display_name: string; title: string; bio: string; avatar_url: string | null
  theme_color: string; location_text: string; instagram_handle: string | null
  card_number: string; card_holder_name: string
}

const STATUS_STYLE: Record<string, string> = {
  pending_payment: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  confirmed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  completed: 'bg-sand text-soot border-sand',
  no_show: 'bg-red-50 text-red-600 border-red-200',
}

const THEME_PRESETS: { name: string; rgb: string }[] = [
  { name: 'سبزِ دریایی', rgb: '13 148 136' },
  { name: 'سرمه‌ای', rgb: '30 64 175' },
  { name: 'بنفش', rgb: '124 58 237' },
  { name: 'زرشکی', rgb: '190 24 60' },
  { name: 'نارنجیِ خاکی', rgb: '194 93 44' },
  { name: 'زغالی', rgb: '41 37 36' },
]

function fmtDate(dateStr: string): string {
  const [y, m, d] = toLatinNum(dateStr).split('/').map(Number)
  return `${toFarsiNum(d)} ${PERSIAN_MONTHS[m - 1]}`
}

function Panel() {
  const { slug } = useParams<{ slug: string }>()
  const { uiAlert, uiConfirm } = useDialog()

  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'bookings' | 'calendar' | 'settings' | 'link'>('bookings')

  // ورود
  const [otpSent, setOtpSent] = useState(false)
  const [devCode, setDevCode] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  // داده‌ها
  const [pending, setPending] = useState<Booking[]>([])
  const [upcoming, setUpcoming] = useState<Booking[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [weekly, setWeekly] = useState<WeeklyRow[]>([])
  const [overrides, setOverrides] = useState<Override[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)

  // تقویم
  const now = getCurrentJalali()
  const [calY, setCalY] = useState(now.year)
  const [calM, setCalM] = useState(now.month)
  const [dayDetail, setDayDetail] = useState<{ date: string; bookings: Booking[] } | null>(null)

  // فرمِ سرویس
  const emptyService = { id: '', name: '', duration_minutes: 60, price: 0, mode: 'online', description: '', is_active: true, sort_order: 0 }
  const [editSvc, setEditSvc] = useState<typeof emptyService | null>(null)

  const loadBookings = useCallback(async () => {
    const [p, u] = await Promise.all([
      fetch(`/api/t/${slug}/panel/bookings?scope=pending`).then(r => r.ok ? r.json() : null),
      fetch(`/api/t/${slug}/panel/bookings?scope=upcoming`).then(r => r.ok ? r.json() : null),
    ])
    if (!p) { setAuthed(false); return }
    setPending(p.bookings || []); setUpcoming(u?.bookings || []); setAuthed(true)
  }, [slug])

  const loadSettings = useCallback(async () => {
    const [s, sch, pr] = await Promise.all([
      fetch(`/api/t/${slug}/panel/services`).then(r => r.ok ? r.json() : null),
      fetch(`/api/t/${slug}/panel/schedule`).then(r => r.ok ? r.json() : null),
      fetch(`/api/t/${slug}/panel/profile`).then(r => r.ok ? r.json() : null),
    ])
    if (s) setServices(s.services || [])
    if (sch) { setWeekly(sch.weekly || []); setOverrides(sch.overrides || []) }
    if (pr) setProfile(pr.profile)
  }, [slug])

  useEffect(() => { loadBookings() }, [loadBookings])
  useEffect(() => { if (authed && (tab === 'settings' || tab === 'link') && !profile) loadSettings() }, [authed, tab, profile, loadSettings])

  async function sendOtp() {
    setBusy(true)
    const r = await fetch(`/api/t/${slug}/panel/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { uiAlert(d.error || 'خطا'); return }
    setOtpSent(true); setDevCode(d.dev_code || '')
  }

  async function verify() {
    setBusy(true)
    const r = await fetch(`/api/t/${slug}/panel/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { uiAlert(d.error || 'کد نادرست است'); return }
    loadBookings()
  }

  async function bookingAction(b: Booking, action: string, confirmMsg?: string) {
    if (confirmMsg && !await uiConfirm(confirmMsg)) return
    const r = await fetch(`/api/t/${slug}/panel/bookings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id, action }),
    })
    const d = await r.json()
    if (!r.ok) { uiAlert(d.error || 'انجام نشد'); return }
    loadBookings()
    if (dayDetail) openDay(dayDetail.date)
  }

  async function openDay(dateStr: string) {
    const r = await fetch(`/api/t/${slug}/panel/bookings?date=${dateStr}`)
    const d = await r.json()
    setDayDetail({ date: dateStr, bookings: d.bookings || [] })
  }

  async function toggleClosed(dateStr: string) {
    const ov = overrides.find(o => o.date === dateStr && o.type === 'closed')
    if (ov) {
      await fetch(`/api/t/${slug}/panel/schedule`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ov.id }),
      })
    } else {
      if (!await uiConfirm('این روز برای رزروِ جدید بسته شود؟ (نوبت‌های ثبت‌شده سرِ جایشان می‌مانند)')) return
      await fetch(`/api/t/${slug}/panel/schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr }),
      })
    }
    const sch = await fetch(`/api/t/${slug}/panel/schedule`).then(r => r.json())
    setOverrides(sch.overrides || [])
  }

  async function saveService() {
    if (!editSvc) return
    const isNew = !editSvc.id
    const r = await fetch(`/api/t/${slug}/panel/services`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editSvc),
    })
    const d = await r.json()
    if (!r.ok) { uiAlert(d.error || 'ذخیره نشد'); return }
    setEditSvc(null); loadSettings()
  }

  async function deleteService(s: Service) {
    if (!await uiConfirm(`سرویسِ «${s.name}» غیرفعال شود؟ رزروهای قبلی دست‌نخورده می‌مانند.`)) return
    await fetch(`/api/t/${slug}/panel/services`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id }),
    })
    loadSettings()
  }

  async function saveWeekly() {
    const r = await fetch(`/api/t/${slug}/panel/schedule`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekly }),
    })
    const d = await r.json()
    if (!r.ok) { uiAlert(d.error || 'ذخیره نشد'); return }
    uiAlert('برنامه‌ی هفتگی ذخیره شد')
  }

  async function saveProfile() {
    if (!profile) return
    const r = await fetch(`/api/t/${slug}/panel/profile`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    })
    const d = await r.json()
    if (!r.ok) { uiAlert(d.error || 'ذخیره نشد'); return }
    uiAlert('پروفایل ذخیره شد')
  }

  // ── ورود ──────────────────────────────────────────────────────
  if (authed === null) return <main className="min-h-screen flex items-center justify-center text-sm text-soot">در حالِ بارگذاری…</main>
  if (authed === false) return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3">
        <h1 className="text-lg font-extrabold text-center mb-1">ورود به پنل</h1>
        <p className="text-xs text-soot text-center mb-4">کدِ تایید به شماره‌ی ثبت‌شده‌ی صاحبِ این صفحه ارسال می‌شود.</p>
        {!otpSent ? (
          <button onClick={sendOtp} disabled={busy}
            className="w-full py-3 rounded-2xl bg-accent text-white font-medium disabled:opacity-50">
            {busy ? 'در حالِ ارسال…' : 'ارسالِ کدِ ورود'}
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
              className="w-full py-3 rounded-2xl bg-accent text-white font-medium disabled:opacity-50">ورود</button>
          </>
        )}
      </div>
    </main>
  )

  // ── پنل ───────────────────────────────────────────────────────
  const bookingCard = (b: Booking, inPending = false) => (
    <div key={b.id} className="rounded-2xl border border-sand bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-sm">{b.client_name}</div>
          <div className="mt-0.5 text-xs text-soot">
            {b.services?.name} · {fmtDate(b.booking_date)} · <span className="tnum">{toFarsiNum(b.booking_time)}</span>
          </div>
          <div className="mt-0.5 text-xs text-soot tnum" dir="ltr">{toFarsiNum(b.client_phone)}</div>
          {b.client_note && <p className="mt-2 text-xs text-soot bg-paper rounded-lg p-2">{b.client_note}</p>}
        </div>
        <span className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${STATUS_STYLE[b.status] || ''}`}>
          {BOOKING_STATUS_LABEL[b.status] || b.status}
        </span>
      </div>
      {inPending && (
        <div className="mt-3 flex gap-2 text-xs">
          <div className="flex-1 rounded-xl bg-paper p-2.5">
            <span className="text-soot">مبلغ: </span><strong className="tnum">{toFarsiNum(b.price_snapshot.toLocaleString('en-US'))}</strong>
            {b.payment_ref && <><span className="text-soot"> · پیگیری: </span><strong className="tnum" dir="ltr">{toFarsiNum(b.payment_ref)}</strong></>}
          </div>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {b.status === 'payment_submitted' && (
          <>
            <button onClick={() => bookingAction(b, 'confirm')}
              className="flex-1 py-2 rounded-xl bg-green-600 text-white text-xs font-medium">تاییدِ پرداخت</button>
            <button onClick={() => bookingAction(b, 'reject', 'پرداخت رد شود؟ مراجع باید دوباره اعلامِ پرداخت کند.')}
              className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-xs">ردِ پرداخت</button>
          </>
        )}
        {b.status === 'confirmed' && b.booking_ts <= Date.now() && (
          <>
            <button onClick={() => bookingAction(b, 'complete')}
              className="flex-1 py-2 rounded-xl bg-accent text-white text-xs">برگزار شد</button>
            <button onClick={() => bookingAction(b, 'no_show', 'به‌عنوانِ «حاضر نشد» ثبت شود؟')}
              className="flex-1 py-2 rounded-xl border border-sand text-soot text-xs">حاضر نشد</button>
          </>
        )}
        {['pending_payment', 'payment_submitted', 'confirmed'].includes(b.status) && (
          <button onClick={() => bookingAction(b, 'cancel', `نوبتِ ${b.client_name} لغو شود؟`)}
            className="py-2 px-3 rounded-xl border border-sand text-soot text-xs">لغو</button>
        )}
      </div>
    </div>
  )

  return (
    <main className="min-h-screen pb-24">
      <div className="max-w-md mx-auto px-5 py-6">
        <h1 className="text-lg font-extrabold mb-4">پنلِ مدیریت</h1>

        <div className="flex gap-1.5 mb-6 text-xs">
          {([['bookings', 'نوبت‌ها'], ['calendar', 'تقویم'], ['settings', 'تنظیمات'], ['link', 'لینکِ من']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2.5 rounded-xl border font-medium
                ${tab === k ? 'bg-ink text-white border-ink' : 'bg-white border-sand text-soot'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── تب: نوبت‌ها ── */}
        {tab === 'bookings' && (
          <div className="space-y-6">
            <section>
              <h2 className="text-xs font-bold text-soot mb-2">در انتظارِ تاییدِ پرداخت {pending.length > 0 && `(${toFarsiNum(pending.length)})`}</h2>
              {pending.length === 0
                ? <div className="rounded-2xl border border-sand bg-white p-4 text-xs text-soot text-center">پرداختِ منتظری نیست.</div>
                : <div className="space-y-3">{pending.map(b => bookingCard(b, true))}</div>}
            </section>
            <section>
              <h2 className="text-xs font-bold text-soot mb-2">نوبت‌های پیشِ رو</h2>
              {upcoming.length === 0
                ? <div className="rounded-2xl border border-sand bg-white p-4 text-xs text-soot text-center">نوبتِ آینده‌ای ثبت نشده.</div>
                : <div className="space-y-3">{upcoming.map(b => bookingCard(b))}</div>}
            </section>
          </div>
        )}

        {/* ── تب: تقویم ── */}
        {tab === 'calendar' && (
          <div>
            <MonthCalendar year={calY} month={calM}
              onPrev={() => { if (calM === 1) { setCalM(12); setCalY(calY - 1) } else setCalM(calM - 1); setDayDetail(null) }}
              onNext={() => { if (calM === 12) { setCalM(1); setCalY(calY + 1) } else setCalM(calM + 1); setDayDetail(null) }}
              renderDay={day => {
                const dateStr = jalaliKey(calY, calM, day)
                const isClosed = overrides.some(o => o.date === dateStr && o.type === 'closed')
                const isPicked = dayDetail?.date === dateStr
                return (
                  <button onClick={() => openDay(dateStr)}
                    className={`w-full aspect-square rounded-xl text-sm relative
                      ${isPicked ? 'bg-ink text-white font-bold' : isClosed ? 'bg-red-50 text-red-400 line-through' : 'bg-white border border-sand'}`}>
                    {toFarsiNum(day)}
                  </button>
                )
              }} />
            <p className="mt-2 text-[11px] text-soot">روزهای قرمز برای رزروِ جدید بسته‌اند.</p>

            {dayDetail && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">{fmtDate(dayDetail.date)}</h3>
                  <button onClick={() => toggleClosed(dayDetail.date)}
                    className="text-xs px-3 py-1.5 rounded-xl border border-sand text-soot">
                    {overrides.some(o => o.date === dayDetail.date && o.type === 'closed') ? 'بازکردنِ روز' : 'بستنِ روز'}
                  </button>
                </div>
                {dayDetail.bookings.length === 0
                  ? <div className="text-xs text-soot">نوبتی در این روز نیست.</div>
                  : dayDetail.bookings.map(b => bookingCard(b))}
              </div>
            )}
          </div>
        )}

        {/* ── تب: تنظیمات ── */}
        {tab === 'settings' && (
          <div className="space-y-8">
            {/* پروفایل */}
            {profile && (
              <section className="space-y-3">
                <h2 className="text-xs font-bold text-soot">پروفایل و برندینگ</h2>
                <input value={profile.display_name} onChange={e => setProfile({ ...profile, display_name: e.target.value })}
                  placeholder="نامِ نمایشی" className="w-full p-3 rounded-xl border border-sand bg-white text-sm" />
                <input value={profile.title} onChange={e => setProfile({ ...profile, title: e.target.value })}
                  placeholder="عنوان (مثلاً: مربیِ تغذیه)" className="w-full p-3 rounded-xl border border-sand bg-white text-sm" />
                <textarea value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} rows={3}
                  placeholder="معرفیِ کوتاه" className="w-full p-3 rounded-xl border border-sand bg-white text-sm" />
                <input value={profile.avatar_url || ''} onChange={e => setProfile({ ...profile, avatar_url: e.target.value })}
                  placeholder="لینکِ عکسِ پروفایل (URL)" dir="ltr" className="w-full p-3 rounded-xl border border-sand bg-white text-sm" />
                <input value={profile.location_text} onChange={e => setProfile({ ...profile, location_text: e.target.value })}
                  placeholder="موقعیت (مثلاً: آنلاین / تهران)" className="w-full p-3 rounded-xl border border-sand bg-white text-sm" />
                <input value={profile.instagram_handle || ''} onChange={e => setProfile({ ...profile, instagram_handle: e.target.value })}
                  placeholder="آیدیِ اینستاگرام (بدونِ @)" dir="ltr" className="w-full p-3 rounded-xl border border-sand bg-white text-sm" />
                <div>
                  <div className="text-[11px] text-soot mb-1.5">رنگِ برندِ صفحه</div>
                  <div className="flex gap-2 flex-wrap">
                    {THEME_PRESETS.map(p => (
                      <button key={p.rgb} onClick={() => setProfile({ ...profile, theme_color: p.rgb })}
                        title={p.name}
                        className={`w-9 h-9 rounded-full border-2 ${profile.theme_color === p.rgb ? 'border-ink scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: `rgb(${p.rgb})` }} />
                    ))}
                  </div>
                </div>
                <div className="pt-2 border-t border-sand space-y-3">
                  <div className="text-[11px] text-soot">دریافتِ وجه (کارت‌به‌کارت)</div>
                  <input value={profile.card_number} onChange={e => setProfile({ ...profile, card_number: e.target.value })}
                    placeholder="شماره‌ی کارتِ ۱۶ رقمی" dir="ltr" inputMode="numeric"
                    className="w-full p-3 rounded-xl border border-sand bg-white text-sm tnum" />
                  <input value={profile.card_holder_name} onChange={e => setProfile({ ...profile, card_holder_name: e.target.value })}
                    placeholder="نامِ صاحبِ کارت" className="w-full p-3 rounded-xl border border-sand bg-white text-sm" />
                </div>
                <button onClick={saveProfile} className="w-full py-3 rounded-2xl bg-ink text-white text-sm font-medium">ذخیره‌ی پروفایل</button>
              </section>
            )}

            {/* سرویس‌ها */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-soot">سرویس‌ها</h2>
                <button onClick={() => setEditSvc({ ...emptyService })}
                  className="text-xs px-3 py-1.5 rounded-xl bg-ink text-white">+ سرویسِ جدید</button>
              </div>
              {services.filter(s => s.is_active).map(s => (
                <div key={s.id} className="rounded-2xl border border-sand bg-white p-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm">{s.name}</div>
                    <div className="mt-0.5 text-xs text-soot">
                      {toFarsiNum(s.duration_minutes)} دقیقه · {MODE_LABEL[s.mode]} · <span className="tnum">{toFarsiNum(s.price.toLocaleString('en-US'))}</span> تومان
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 text-xs">
                    <button onClick={() => setEditSvc({ ...s })} className="px-3 py-1.5 rounded-xl border border-sand text-soot">ویرایش</button>
                    <button onClick={() => deleteService(s)} className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600">حذف</button>
                  </div>
                </div>
              ))}
              {editSvc && (
                <div className="rounded-2xl border-2 border-ink bg-white p-4 space-y-3">
                  <div className="text-xs font-bold">{editSvc.id ? 'ویرایشِ سرویس' : 'سرویسِ جدید'}</div>
                  <input value={editSvc.name} onChange={e => setEditSvc({ ...editSvc, name: e.target.value })}
                    placeholder="نامِ سرویس" className="w-full p-3 rounded-xl border border-sand text-sm" />
                  <div className="flex gap-2">
                    <input value={editSvc.duration_minutes} onChange={e => setEditSvc({ ...editSvc, duration_minutes: parseInt(toLatinNum(e.target.value)) || 0 })}
                      placeholder="مدت (دقیقه)" dir="ltr" inputMode="numeric" className="flex-1 min-w-0 p-3 rounded-xl border border-sand text-sm tnum" />
                    <input value={editSvc.price} onChange={e => setEditSvc({ ...editSvc, price: parseInt(toLatinNum(e.target.value)) || 0 })}
                      placeholder="قیمت (تومان)" dir="ltr" inputMode="numeric" className="flex-1 min-w-0 p-3 rounded-xl border border-sand text-sm tnum" />
                  </div>
                  <div className="flex gap-1.5 text-xs">
                    {(['online', 'in_person', 'both'] as const).map(m => (
                      <button key={m} onClick={() => setEditSvc({ ...editSvc, mode: m })}
                        className={`flex-1 py-2 rounded-xl border ${editSvc.mode === m ? 'bg-ink text-white border-ink' : 'border-sand text-soot'}`}>
                        {MODE_LABEL[m]}
                      </button>
                    ))}
                  </div>
                  <textarea value={editSvc.description} onChange={e => setEditSvc({ ...editSvc, description: e.target.value })} rows={2}
                    placeholder="توضیح (اختیاری)" className="w-full p-3 rounded-xl border border-sand text-sm" />
                  <div className="flex gap-2">
                    <button onClick={saveService} className="flex-1 py-2.5 rounded-xl bg-ink text-white text-sm">ذخیره</button>
                    <button onClick={() => setEditSvc(null)} className="px-4 py-2.5 rounded-xl border border-sand text-soot text-sm">انصراف</button>
                  </div>
                </div>
              )}
            </section>

            {/* برنامه‌ی هفتگی */}
            <section className="space-y-3">
              <h2 className="text-xs font-bold text-soot">ساعاتِ کاریِ هفتگی</h2>
              {PERSIAN_WEEKDAYS_FULL.map((dayName, wd) => {
                const rows = weekly.map((r, idx) => ({ ...r, idx })).filter(r => r.weekday === wd)
                return (
                  <div key={wd} className="rounded-2xl border border-sand bg-white p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold">{dayName}</span>
                      <button onClick={() => setWeekly([...weekly, { weekday: wd, start_time: '09:00', end_time: '13:00', mode: 'both' }])}
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-sand text-soot">+ بازه</button>
                    </div>
                    {rows.length === 0 && <div className="text-[11px] text-soot">تعطیل</div>}
                    {rows.map(r => (
                      <div key={r.idx} className="flex items-center gap-1.5 mb-1.5 text-xs">
                        <input value={r.start_time} onChange={e => setWeekly(weekly.map((w, i) => i === r.idx ? { ...w, start_time: e.target.value } : w))}
                          dir="ltr" className="w-16 p-2 rounded-lg border border-sand text-center tnum" />
                        <span className="text-soot">تا</span>
                        <input value={r.end_time} onChange={e => setWeekly(weekly.map((w, i) => i === r.idx ? { ...w, end_time: e.target.value } : w))}
                          dir="ltr" className="w-16 p-2 rounded-lg border border-sand text-center tnum" />
                        <select value={r.mode} onChange={e => setWeekly(weekly.map((w, i) => i === r.idx ? { ...w, mode: e.target.value } : w))}
                          className="flex-1 min-w-0 p-2 rounded-lg border border-sand bg-white">
                          <option value="both">هر دو</option>
                          <option value="online">آنلاین</option>
                          <option value="in_person">حضوری</option>
                        </select>
                        <button onClick={() => setWeekly(weekly.filter((_, i) => i !== r.idx))}
                          className="px-2 py-2 rounded-lg border border-red-200 text-red-500">✕</button>
                      </div>
                    ))}
                  </div>
                )
              })}
              <button onClick={saveWeekly} className="w-full py-3 rounded-2xl bg-ink text-white text-sm font-medium">ذخیره‌ی برنامه‌ی هفتگی</button>
            </section>
          </div>
        )}

        {/* ── تب: لینکِ من ── */}
        {tab === 'link' && <LinkTab slug={slug} />}
      </div>
    </main>
  )
}

function LinkTab({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState('')
  useEffect(() => { setUrl(`${window.location.origin}/${slug}`) }, [slug])
  if (!url) return null
  return (
    <div className="text-center space-y-5">
      <p className="text-sm text-soot leading-relaxed">این لینک را در بایوی اینستاگرام یا هرجای دیگری بگذارید؛ مراجعان از همین‌جا نوبت می‌گیرند.</p>
      <div className="rounded-2xl border-2 border-ink bg-white p-4 font-bold tnum break-all" dir="ltr">{url}</div>
      <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
        className="w-full py-3 rounded-2xl bg-ink text-white text-sm font-medium">
        {copied ? '✓ کپی شد' : 'کپیِ لینک'}
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="QR" className="mx-auto rounded-2xl border border-sand bg-white p-3"
        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`} width={200} height={200} />
    </div>
  )
}

export default function Page() {
  return <DialogProvider><Panel /></DialogProvider>
}
