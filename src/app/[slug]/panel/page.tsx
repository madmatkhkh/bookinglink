'use client'
// ─────────────────────────────────────────────────────────────────────────────
// پنلِ متخصص — بازطراحی‌شده حولِ سه اصل:
// ۱) سریع: کلِ داده در یک درخواست (/panel/overview) + اسکلتونِ لودینگ
// ۲) واضح: تبِ «خانه» با چک‌لیستِ راه‌اندازی و خلاصه‌ی روز — همیشه معلوم است قدمِ بعدی چیست
// ۳) موبایل‌فرست: ناوبریِ پایینی، تنظیماتِ تفکیک‌شده به زیرصفحه‌ها
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import MonthCalendar from '@/components/MonthCalendar'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { getCurrentJalali, jalaliKey, toFarsiNum, toLatinNum, PERSIAN_MONTHS, PERSIAN_WEEKDAYS_FULL, timeKey } from '@/lib/calendar'
import { BOOKING_STATUS_LABEL, MODE_LABEL } from '@/lib/config'

// ─── تایپ‌ها ──────────────────────────────────────────────────────
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
type Overview = {
  slug: string; profile: Profile; services: Service[]
  weekly: WeeklyRow[]; overrides: Override[]
  pending: Booking[]; upcoming: Booking[]
}

// ─── ثابت‌های نمایشی ─────────────────────────────────────────────
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

// گزینه‌های ساعت برای انتخاب‌گرِ برنامه‌ی هفتگی (۶ صبح تا ۱۲ شب، گام ۳۰ دقیقه)
const TIME_OPTIONS: string[] = []
for (let h = 6; h <= 23; h++) for (const m of ['00', '30'])
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${m}`)

function fmtDate(dateStr: string): string {
  const [, m, d] = toLatinNum(dateStr).split('/').map(Number)
  return `${toFarsiNum(d)} ${PERSIAN_MONTHS[m - 1]}`
}
function fmtPrice(n: number): string { return toFarsiNum(n.toLocaleString('en-US')) }

async function api(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

// ═══ ریشه ════════════════════════════════════════════════════════
type Tab = 'home' | 'bookings' | 'calendar' | 'settings'
type SettingsView = 'menu' | 'profile' | 'services' | 'schedule'

function Panel() {
  const { slug } = useParams<{ slug: string }>()
  const { uiAlert, uiConfirm } = useDialog()

  const [authed, setAuthed] = useState<boolean | null>(null)
  const [ov, setOv] = useState<Overview | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [settingsView, setSettingsView] = useState<SettingsView>('menu')

  const load = useCallback(async () => {
    const r = await api(`/api/t/${slug}/panel/overview`)
    if (!r.ok) { setAuthed(false); return }
    setOv(r.data); setAuthed(true)
  }, [slug])

  useEffect(() => { load() }, [load])

  if (authed === null) return <Skeleton />
  if (authed === false) return <Login slug={slug} onSuccess={load} />
  if (!ov) return <Skeleton />

  const pendingCount = ov.pending.length

  return (
    <main className="min-h-screen pb-28" style={{ ['--brand' as any]: ov.profile.theme_color }}>
      {/* ── سربرگِ برند ── */}
      <div className="bg-accent">
        <div className="max-w-md mx-auto px-5 pt-6 pb-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 overflow-hidden flex items-center justify-center text-xl shrink-0">
            {ov.profile.avatar_url
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={ov.profile.avatar_url} alt="" className="w-full h-full object-cover" />
              : '👤'}
          </div>
          <div className="min-w-0 text-white">
            <div className="font-extrabold truncate">{ov.profile.display_name || 'پنلِ مدیریت'}</div>
            <div className="text-xs opacity-80 tnum" dir="ltr">/{ov.slug}</div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5">
        {tab === 'home' && <HomeTab ov={ov} goTo={(t, sv) => { setTab(t); if (sv) setSettingsView(sv) }} />}
        {tab === 'bookings' && <BookingsTab ov={ov} slug={slug} reload={load} uiAlert={uiAlert} uiConfirm={uiConfirm} />}
        {tab === 'calendar' && <CalendarTab ov={ov} slug={slug} reload={load} uiAlert={uiAlert} uiConfirm={uiConfirm} />}
        {tab === 'settings' && (
          <SettingsTab ov={ov} slug={slug} reload={load} uiAlert={uiAlert} uiConfirm={uiConfirm}
            view={settingsView} setView={setSettingsView} />
        )}
      </div>

      {/* ── ناوبریِ پایینی ── */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-sand" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-md mx-auto grid grid-cols-4">
          {([
            ['home', '🏠', 'خانه'],
            ['bookings', '📋', 'نوبت‌ها'],
            ['calendar', '📅', 'تقویم'],
            ['settings', '⚙️', 'تنظیمات'],
          ] as [Tab, string, string][]).map(([k, icon, label]) => (
            <button key={k} onClick={() => { setTab(k); if (k === 'settings') setSettingsView('menu') }}
              className={`relative py-2.5 flex flex-col items-center gap-0.5 text-[11px]
                ${tab === k ? 'text-ink font-bold' : 'text-soot'}`}>
              <span className="text-lg leading-none">{icon}</span>
              {label}
              {k === 'bookings' && pendingCount > 0 && (
                <span className="absolute top-1.5 left-1/2 -translate-x-4 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center tnum">
                  {toFarsiNum(pendingCount)}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </main>
  )
}

// ═══ اسکلتونِ لودینگ ═════════════════════════════════════════════
function Skeleton() {
  return (
    <main className="min-h-screen">
      <div className="h-24 bg-sand animate-pulse" />
      <div className="max-w-md mx-auto px-5 pt-5 space-y-3">
        {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-sand animate-pulse" />)}
      </div>
    </main>
  )
}

// ═══ ورود ════════════════════════════════════════════════════════
function Login({ slug, onSuccess }: { slug: string; onSuccess: () => void }) {
  const { uiAlert } = useDialog()
  const [otpSent, setOtpSent] = useState(false)
  const [devCode, setDevCode] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function sendOtp() {
    setBusy(true)
    const r = await api(`/api/t/${slug}/panel/login`, 'POST', {})
    setBusy(false)
    if (!r.ok) { uiAlert(r.data.error || 'خطا'); return }
    setOtpSent(true); setDevCode(r.data.dev_code || '')
  }
  async function verify() {
    setBusy(true)
    const r = await api(`/api/t/${slug}/panel/login`, 'POST', { code })
    setBusy(false)
    if (!r.ok) { uiAlert(r.data.error || 'کد نادرست است'); return }
    onSuccess()
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-lg font-extrabold">ورود به پنلِ مدیریت</h1>
          <p className="text-xs text-soot mt-1.5 leading-relaxed">
            کدِ ورود به شماره‌ی موبایلِ ثبت‌شده‌ی صاحبِ این صفحه فرستاده می‌شود.
          </p>
        </div>
        {!otpSent ? (
          <button onClick={sendOtp} disabled={busy}
            className="w-full py-3.5 rounded-2xl bg-ink text-white font-medium disabled:opacity-50">
            {busy ? 'در حالِ ارسال…' : 'ارسالِ کدِ ورود'}
          </button>
        ) : (
          <div className="space-y-3">
            {devCode && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                کدِ تست (تا اتصالِ پیامک): <strong className="tnum text-base">{devCode}</strong>
              </div>
            )}
            <input value={code} onChange={e => setCode(e.target.value)} dir="ltr" inputMode="numeric" autoFocus
              placeholder="کدِ ۴ رقمی"
              className="w-full p-3.5 rounded-2xl border border-sand bg-white text-lg tnum text-center tracking-widest" />
            <button onClick={verify} disabled={busy || code.trim().length < 4}
              className="w-full py-3.5 rounded-2xl bg-ink text-white font-medium disabled:opacity-40">
              ورود
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

// ═══ تبِ خانه ════════════════════════════════════════════════════
function HomeTab({ ov, goTo }: { ov: Overview; goTo: (t: Tab, sv?: SettingsView) => void }) {
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState('')
  useEffect(() => { setUrl(`${window.location.origin}/${ov.slug}`) }, [ov.slug])

  const now = getCurrentJalali()
  const todayKey = jalaliKey(now.year, now.month, now.day)
  const today = ov.upcoming.filter(b => b.booking_date === todayKey && ['confirmed', 'payment_submitted'].includes(b.status))
  const nextUp = ov.upcoming.filter(b => b.status === 'confirmed' && b.booking_date !== todayKey).slice(0, 3)

  // چک‌لیستِ راه‌اندازی — تا کامل نشده، مهم‌ترین چیزِ صفحه است
  const steps = [
    { done: !!ov.profile.display_name && !!ov.profile.title, label: 'نام و عنوانِ خود را بنویسید', view: 'profile' as const },
    { done: (ov.profile.card_number || '').length >= 16, label: 'شماره کارتِ دریافتِ وجه را ثبت کنید', view: 'profile' as const },
    { done: ov.services.some(s => s.is_active), label: 'اولین سرویس را تعریف کنید', view: 'services' as const },
    { done: ov.weekly.length > 0, label: 'ساعاتِ کاریِ هفته را مشخص کنید', view: 'schedule' as const },
  ]
  const remaining = steps.filter(s => !s.done)
  const ready = remaining.length === 0

  return (
    <div className="space-y-4">
      {/* چک‌لیست */}
      {!ready && (
        <section className="rounded-2xl border-2 border-ink bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-extrabold text-sm">راه‌اندازیِ صفحه</h2>
            <span className="text-[11px] text-soot tnum">{toFarsiNum(steps.length - remaining.length)} از {toFarsiNum(steps.length)}</span>
          </div>
          <div className="flex gap-1 mb-4">
            {steps.map((s, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${s.done ? 'bg-accent' : 'bg-sand'}`} />
            ))}
          </div>
          <div className="space-y-2">
            {steps.map((s, i) => (
              <button key={i} onClick={() => !s.done && goTo('settings', s.view)} disabled={s.done}
                className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-right text-sm
                  ${s.done ? 'text-soot/50' : 'bg-paper active:bg-sand'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0
                  ${s.done ? 'bg-accent text-white' : 'border-2 border-sand'}`}>
                  {s.done ? '✓' : ''}
                </span>
                <span className={s.done ? 'line-through' : 'font-medium'}>{s.label}</span>
                {!s.done && <span className="mr-auto text-soot">‹</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* پرداخت‌های منتظر */}
      {ov.pending.length > 0 && (
        <button onClick={() => goTo('bookings')}
          className="w-full rounded-2xl bg-blue-600 text-white p-4 flex items-center justify-between text-right">
          <span>
            <span className="block font-bold text-sm">{toFarsiNum(ov.pending.length)} پرداخت منتظرِ تاییدِ شماست</span>
            <span className="block text-xs opacity-80 mt-0.5">تا تایید نکنید نوبت قطعی نمی‌شود</span>
          </span>
          <span className="text-xl">‹</span>
        </button>
      )}

      {/* امروز */}
      <section className="rounded-2xl border border-sand bg-white p-4">
        <h2 className="text-xs font-bold text-soot mb-3">امروز · {fmtDate(todayKey)}</h2>
        {today.length === 0 ? (
          <p className="text-sm text-soot">امروز نوبتی ندارید.</p>
        ) : (
          <div className="space-y-2.5">
            {today.map(b => (
              <div key={b.id} className="flex items-center gap-3">
                <div className="w-14 py-1.5 rounded-lg bg-paper text-center text-sm font-bold tnum shrink-0">
                  {toFarsiNum(b.booking_time)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{b.client_name}</div>
                  <div className="text-[11px] text-soot truncate">{b.services?.name}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* نوبت‌های بعدی */}
      {nextUp.length > 0 && (
        <section className="rounded-2xl border border-sand bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-soot">نوبت‌های قطعیِ بعدی</h2>
            <button onClick={() => goTo('bookings')} className="text-[11px] text-soot underline underline-offset-4">همه</button>
          </div>
          <div className="space-y-2.5">
            {nextUp.map(b => (
              <div key={b.id} className="flex items-center gap-3">
                <div className="w-20 py-1.5 rounded-lg bg-paper text-center text-[11px] font-bold shrink-0">
                  {fmtDate(b.booking_date)}<br /><span className="tnum">{toFarsiNum(b.booking_time)}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{b.client_name}</div>
                  <div className="text-[11px] text-soot truncate">{b.services?.name}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* لینکِ من */}
      <section className="rounded-2xl bg-ink text-white p-4">
        <h2 className="text-xs font-bold opacity-70 mb-2">لینکِ صفحه‌ی شما</h2>
        <div className="text-sm font-bold tnum break-all mb-3" dir="ltr">{url}</div>
        <div className="flex gap-2">
          <button onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="flex-1 py-2.5 rounded-xl bg-white text-ink text-xs font-bold">
            {copied ? '✓ کپی شد' : 'کپیِ لینک'}
          </button>
          <a href={url} target="_blank" className="flex-1 py-2.5 rounded-xl border border-white/30 text-xs text-center">
            دیدنِ صفحه
          </a>
        </div>
        <p className="text-[11px] opacity-60 mt-3 leading-relaxed">این لینک را در بایوی اینستاگرام بگذارید — مراجعان از همین‌جا نوبت می‌گیرند.</p>
      </section>
    </div>
  )
}

// ═══ کارتِ نوبت (مشترک) ══════════════════════════════════════════
function BookingCard({ b, slug, reload, uiAlert, uiConfirm, showPayment = false }: {
  b: Booking; slug: string; reload: () => void
  uiAlert: (m: string) => Promise<void>; uiConfirm: (m: string) => Promise<boolean>
  showPayment?: boolean
}) {
  const [busy, setBusy] = useState(false)

  async function act(action: string, confirmMsg?: string) {
    if (confirmMsg && !await uiConfirm(confirmMsg)) return
    setBusy(true)
    const r = await api(`/api/t/${slug}/panel/bookings`, 'PATCH', { id: b.id, action })
    setBusy(false)
    if (!r.ok) { uiAlert(r.data.error || 'انجام نشد'); return }
    reload()
  }

  return (
    <div className="rounded-2xl border border-sand bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold text-sm">{b.client_name}</div>
          <div className="mt-1 text-xs text-soot">
            {b.services?.name} · {fmtDate(b.booking_date)} · <span className="tnum">{toFarsiNum(b.booking_time)}</span>
          </div>
          <a href={`tel:${b.client_phone}`} className="mt-0.5 inline-block text-xs text-soot tnum underline underline-offset-4" dir="ltr">
            {toFarsiNum(b.client_phone)}
          </a>
          {b.client_note && <p className="mt-2 text-xs text-soot bg-paper rounded-lg p-2">{b.client_note}</p>}
        </div>
        <span className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${STATUS_STYLE[b.status] || ''}`}>
          {BOOKING_STATUS_LABEL[b.status] || b.status}
        </span>
      </div>

      {showPayment && (
        <div className="mt-3 rounded-xl bg-paper p-2.5 text-xs">
          <span className="text-soot">مبلغ: </span><strong className="tnum">{fmtPrice(b.price_snapshot)} تومان</strong>
          {b.payment_ref && <><span className="text-soot"> · پیگیری: </span><strong className="tnum" dir="ltr">{toFarsiNum(b.payment_ref)}</strong></>}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {b.status === 'payment_submitted' && (
          <>
            <button onClick={() => act('confirm')} disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold disabled:opacity-50">✓ تاییدِ پرداخت</button>
            <button onClick={() => act('reject', 'پرداخت رد شود؟ مراجع باید دوباره اعلامِ پرداخت کند.')} disabled={busy}
              className="py-2.5 px-3 rounded-xl border border-red-200 text-red-600 text-xs disabled:opacity-50">رد</button>
          </>
        )}
        {b.status === 'confirmed' && b.booking_ts <= Date.now() && (
          <>
            <button onClick={() => act('complete')} disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-accent text-white text-xs disabled:opacity-50">برگزار شد</button>
            <button onClick={() => act('no_show', 'به‌عنوانِ «حاضر نشد» ثبت شود؟')} disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-sand text-soot text-xs disabled:opacity-50">حاضر نشد</button>
          </>
        )}
        {['pending_payment', 'payment_submitted', 'confirmed'].includes(b.status) && (
          <button onClick={() => act('cancel', `نوبتِ ${b.client_name} لغو شود؟`)} disabled={busy}
            className="py-2.5 px-3 rounded-xl border border-sand text-soot text-xs disabled:opacity-50">لغو</button>
        )}
      </div>
    </div>
  )
}

// ═══ تبِ نوبت‌ها ═════════════════════════════════════════════════
function BookingsTab({ ov, slug, reload, uiAlert, uiConfirm }: {
  ov: Overview; slug: string; reload: () => void
  uiAlert: (m: string) => Promise<void>; uiConfirm: (m: string) => Promise<boolean>
}) {
  const [seg, setSeg] = useState<'pending' | 'upcoming'>(ov.pending.length > 0 ? 'pending' : 'upcoming')
  const upcoming = ov.upcoming.filter(b => b.booking_ts > Date.now() - 3600 * 1000)

  return (
    <div>
      <div className="flex gap-1.5 mb-4 p-1 rounded-2xl bg-sand">
        <button onClick={() => setSeg('pending')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold ${seg === 'pending' ? 'bg-white shadow-sm' : 'text-soot'}`}>
          منتظرِ تایید {ov.pending.length > 0 && `(${toFarsiNum(ov.pending.length)})`}
        </button>
        <button onClick={() => setSeg('upcoming')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold ${seg === 'upcoming' ? 'bg-white shadow-sm' : 'text-soot'}`}>
          پیشِ رو {upcoming.length > 0 && `(${toFarsiNum(upcoming.length)})`}
        </button>
      </div>

      {seg === 'pending' && (
        ov.pending.length === 0
          ? <Empty icon="✓" text="پرداختِ منتظری نیست — همه‌چیز به‌روز است." />
          : <div className="space-y-3">{ov.pending.map(b =>
              <BookingCard key={b.id} b={b} slug={slug} reload={reload} uiAlert={uiAlert} uiConfirm={uiConfirm} showPayment />)}</div>
      )}
      {seg === 'upcoming' && (
        upcoming.length === 0
          ? <Empty icon="🗓" text="نوبتِ آینده‌ای ثبت نشده. لینکِ صفحه را در بایو بگذارید تا رزروها بیایند." />
          : <div className="space-y-3">{upcoming.map(b =>
              <BookingCard key={b.id} b={b} slug={slug} reload={reload} uiAlert={uiAlert} uiConfirm={uiConfirm} />)}</div>
      )}
    </div>
  )
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="rounded-2xl border border-sand bg-white p-8 text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <p className="text-xs text-soot leading-relaxed">{text}</p>
    </div>
  )
}

// ═══ تبِ تقویم ═══════════════════════════════════════════════════
function CalendarTab({ ov, slug, reload, uiAlert, uiConfirm }: {
  ov: Overview; slug: string; reload: () => void
  uiAlert: (m: string) => Promise<void>; uiConfirm: (m: string) => Promise<boolean>
}) {
  const now = getCurrentJalali()
  const [calY, setCalY] = useState(now.year)
  const [calM, setCalM] = useState(now.month)
  const [detail, setDetail] = useState<{ date: string; bookings: Booking[] } | null>(null)

  // شمارِ نوبت‌های زنده‌ی هر روز از داده‌ی overview (بدونِ درخواستِ اضافه)
  const countByDate = new Map<string, number>()
  for (const b of ov.upcoming) countByDate.set(b.booking_date, (countByDate.get(b.booking_date) || 0) + 1)

  async function openDay(dateStr: string) {
    setDetail({ date: dateStr, bookings: [] })
    const r = await api(`/api/t/${slug}/panel/bookings?date=${dateStr}`)
    if (r.ok) setDetail({ date: dateStr, bookings: r.data.bookings || [] })
  }

  async function toggleClosed(dateStr: string) {
    const ovr = ov.overrides.find(o => o.date === dateStr && o.type === 'closed')
    if (ovr) {
      await api(`/api/t/${slug}/panel/schedule`, 'DELETE', { id: ovr.id })
    } else {
      if (!await uiConfirm('این روز برای رزروِ جدید بسته شود؟ نوبت‌های ثبت‌شده سرِ جایشان می‌مانند.')) return
      const r = await api(`/api/t/${slug}/panel/schedule`, 'POST', { date: dateStr })
      if (!r.ok) { uiAlert(r.data.error || 'انجام نشد'); return }
    }
    reload()
  }

  return (
    <div>
      <div className="rounded-2xl border border-sand bg-white p-4">
        <MonthCalendar year={calY} month={calM}
          onPrev={() => { if (calM === 1) { setCalM(12); setCalY(calY - 1) } else setCalM(calM - 1); setDetail(null) }}
          onNext={() => { if (calM === 12) { setCalM(1); setCalY(calY + 1) } else setCalM(calM + 1); setDetail(null) }}
          renderDay={day => {
            const dateStr = jalaliKey(calY, calM, day)
            const isClosed = ov.overrides.some(o => o.date === dateStr && o.type === 'closed')
            const isPicked = detail?.date === dateStr
            const count = countByDate.get(dateStr) || 0
            const isToday = dateStr === jalaliKey(now.year, now.month, now.day)
            return (
              <button onClick={() => openDay(dateStr)}
                className={`w-full aspect-square rounded-xl text-sm relative flex flex-col items-center justify-center
                  ${isPicked ? 'bg-ink text-white font-bold'
                    : isClosed ? 'bg-red-50 text-red-400'
                    : isToday ? 'border-2 border-accent bg-white font-bold'
                    : 'bg-paper'}`}>
                {toFarsiNum(day)}
                {count > 0 && !isPicked && (
                  <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </button>
            )
          }} />
        <div className="mt-3 flex items-center gap-4 text-[10px] text-soot">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" /> نوبت دارد</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block" /> بسته</span>
        </div>
      </div>

      {detail && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold">{fmtDate(detail.date)}</h3>
            <button onClick={() => toggleClosed(detail.date)}
              className={`text-xs px-3.5 py-2 rounded-xl border font-medium
                ${ov.overrides.some(o => o.date === detail.date && o.type === 'closed')
                  ? 'border-green-200 text-green-700 bg-green-50'
                  : 'border-red-200 text-red-600 bg-red-50'}`}>
              {ov.overrides.some(o => o.date === detail.date && o.type === 'closed') ? 'بازکردنِ روز' : 'بستنِ روز'}
            </button>
          </div>
          {detail.bookings.length === 0
            ? <p className="text-xs text-soot">نوبتی در این روز نیست.</p>
            : detail.bookings.map(b =>
                <BookingCard key={b.id} b={b} slug={slug} reload={() => { reload(); openDay(detail.date) }}
                  uiAlert={uiAlert} uiConfirm={uiConfirm} showPayment={b.status === 'payment_submitted'} />)}
        </div>
      )}
    </div>
  )
}

// ═══ تبِ تنظیمات ═════════════════════════════════════════════════
function SettingsTab({ ov, slug, reload, uiAlert, uiConfirm, view, setView }: {
  ov: Overview; slug: string; reload: () => void
  uiAlert: (m: string) => Promise<void>; uiConfirm: (m: string) => Promise<boolean>
  view: SettingsView; setView: (v: SettingsView) => void
}) {
  if (view === 'menu') {
    const items = [
      { key: 'profile' as const, icon: '🎨', title: 'پروفایل و برند', sub: 'نام، معرفی، رنگ، شماره کارت' },
      { key: 'services' as const, icon: '🧾', title: 'سرویس‌ها', sub: `${toFarsiNum(ov.services.filter(s => s.is_active).length)} سرویسِ فعال` },
      { key: 'schedule' as const, icon: '⏰', title: 'ساعاتِ کاری', sub: 'برنامه‌ی هفتگیِ رزرو' },
    ]
    return (
      <div className="space-y-3">
        {items.map(it => (
          <button key={it.key} onClick={() => setView(it.key)}
            className="w-full rounded-2xl border border-sand bg-white p-4 flex items-center gap-3 text-right active:bg-paper">
            <span className="text-2xl">{it.icon}</span>
            <span className="min-w-0">
              <span className="block font-bold text-sm">{it.title}</span>
              <span className="block text-[11px] text-soot mt-0.5">{it.sub}</span>
            </span>
            <span className="mr-auto text-soot">‹</span>
          </button>
        ))}
      </div>
    )
  }

  const back = (
    <button onClick={() => setView('menu')} className="text-xs text-soot mb-4">‹ تنظیمات</button>
  )

  if (view === 'profile') return <div>{back}<ProfileForm ov={ov} slug={slug} reload={reload} uiAlert={uiAlert} /></div>
  if (view === 'services') return <div>{back}<ServicesForm ov={ov} slug={slug} reload={reload} uiAlert={uiAlert} uiConfirm={uiConfirm} /></div>
  return <div>{back}<ScheduleForm ov={ov} slug={slug} reload={reload} uiAlert={uiAlert} /></div>
}

// ─── فرمِ پروفایل ─────────────────────────────────────────────────
const inputCls = 'w-full p-3 rounded-xl border border-sand bg-white text-sm'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-soot mb-1.5">{label}</span>
      {children}
    </label>
  )
}

function ProfileForm({ ov, slug, reload, uiAlert }: {
  ov: Overview; slug: string; reload: () => void; uiAlert: (m: string) => Promise<void>
}) {
  const [p, setP] = useState<Profile>({ ...ov.profile })
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const r = await api(`/api/t/${slug}/panel/profile`, 'PUT', p)
    setBusy(false)
    if (!r.ok) { uiAlert(r.data.error || 'ذخیره نشد'); return }
    await uiAlert('پروفایل ذخیره شد ✓')
    reload()
  }

  return (
    <div className="space-y-4">
      <Field label="نامِ نمایشی *">
        <input value={p.display_name} onChange={e => setP({ ...p, display_name: e.target.value })} className={inputCls} />
      </Field>
      <Field label="عنوان (زیرِ اسم نمایش داده می‌شود)">
        <input value={p.title} onChange={e => setP({ ...p, title: e.target.value })}
          placeholder="مثلاً: مربیِ تغذیه و تناسبِ اندام" className={inputCls} />
      </Field>
      <Field label="معرفیِ کوتاه">
        <textarea value={p.bio} onChange={e => setP({ ...p, bio: e.target.value })} rows={3} className={inputCls} />
      </Field>
      <Field label="لینکِ عکسِ پروفایل">
        <input value={p.avatar_url || ''} onChange={e => setP({ ...p, avatar_url: e.target.value })} dir="ltr"
          placeholder="https://…" className={inputCls} />
      </Field>
      <Field label="موقعیت">
        <input value={p.location_text} onChange={e => setP({ ...p, location_text: e.target.value })}
          placeholder="آنلاین / تهران، ونک" className={inputCls} />
      </Field>
      <Field label="آیدیِ اینستاگرام (بدونِ @)">
        <input value={p.instagram_handle || ''} onChange={e => setP({ ...p, instagram_handle: e.target.value })}
          dir="ltr" className={inputCls} />
      </Field>

      <div>
        <span className="block text-[11px] font-bold text-soot mb-2">رنگِ برندِ صفحه</span>
        <div className="flex gap-2.5 flex-wrap">
          {THEME_PRESETS.map(t => (
            <button key={t.rgb} onClick={() => setP({ ...p, theme_color: t.rgb })} title={t.name}
              className={`w-10 h-10 rounded-full transition-transform ${p.theme_color === t.rgb ? 'ring-2 ring-offset-2 ring-ink scale-110' : ''}`}
              style={{ backgroundColor: `rgb(${t.rgb})` }} />
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-sand space-y-4">
        <div className="text-xs font-bold">دریافتِ وجه (کارت‌به‌کارت)</div>
        <Field label="شماره‌ی کارتِ ۱۶ رقمی">
          <input value={p.card_number} onChange={e => setP({ ...p, card_number: e.target.value })}
            dir="ltr" inputMode="numeric" className={`${inputCls} tnum`} />
        </Field>
        <Field label="نامِ صاحبِ کارت">
          <input value={p.card_holder_name} onChange={e => setP({ ...p, card_holder_name: e.target.value })} className={inputCls} />
        </Field>
      </div>

      <button onClick={save} disabled={busy}
        className="w-full py-3.5 rounded-2xl bg-ink text-white text-sm font-bold disabled:opacity-50">
        {busy ? 'در حالِ ذخیره…' : 'ذخیره'}
      </button>
    </div>
  )
}

// ─── فرمِ سرویس‌ها ────────────────────────────────────────────────
type EditService = { id: string; name: string; duration_minutes: number; price: number; mode: string; description: string; is_active: boolean; sort_order: number }

function ServicesForm({ ov, slug, reload, uiAlert, uiConfirm }: {
  ov: Overview; slug: string; reload: () => void
  uiAlert: (m: string) => Promise<void>; uiConfirm: (m: string) => Promise<boolean>
}) {
  const empty: EditService = { id: '', name: '', duration_minutes: 60, price: 0, mode: 'online', description: '', is_active: true, sort_order: 0 }
  const active = ov.services.filter(s => s.is_active)
  const [edit, setEdit] = useState<EditService | null>(active.length === 0 ? { ...empty } : null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!edit) return
    if (!edit.name.trim()) { uiAlert('نامِ سرویس را بنویسید'); return }
    setBusy(true)
    const r = await api(`/api/t/${slug}/panel/services`, edit.id ? 'PATCH' : 'POST', edit)
    setBusy(false)
    if (!r.ok) { uiAlert(r.data.error || 'ذخیره نشد'); return }
    setEdit(null); reload()
  }

  async function remove(s: Service) {
    if (!await uiConfirm(`سرویسِ «${s.name}» حذف شود؟ رزروهای قبلی دست‌نخورده می‌مانند.`)) return
    await api(`/api/t/${slug}/panel/services`, 'DELETE', { id: s.id })
    reload()
  }

  return (
    <div className="space-y-3">
      {active.map(s => (
        <div key={s.id} className="rounded-2xl border border-sand bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-sm">{s.name}</div>
              <div className="mt-1 text-xs text-soot">
                {toFarsiNum(s.duration_minutes)} دقیقه · {MODE_LABEL[s.mode]} · <span className="tnum">{fmtPrice(s.price)}</span> تومان
              </div>
            </div>
            <div className="flex gap-1.5 shrink-0 text-xs">
              <button onClick={() => setEdit({ ...s })} className="px-3 py-1.5 rounded-xl border border-sand text-soot">ویرایش</button>
              <button onClick={() => remove(s)} className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600">حذف</button>
            </div>
          </div>
        </div>
      ))}

      {!edit && (
        <button onClick={() => setEdit({ ...empty })}
          className="w-full py-3.5 rounded-2xl border-2 border-dashed border-sand text-soot text-sm font-medium">
          + سرویسِ جدید
        </button>
      )}

      {edit && (
        <div className="rounded-2xl border-2 border-ink bg-white p-4 space-y-3">
          <div className="text-xs font-bold">{edit.id ? 'ویرایشِ سرویس' : 'سرویسِ جدید'}</div>
          <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })}
            placeholder="نامِ سرویس — مثلاً: مشاوره‌ی فردی" className="w-full p-3 rounded-xl border border-sand text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[10px] text-soot mb-1">مدت (دقیقه)</span>
              <select value={edit.duration_minutes} onChange={e => setEdit({ ...edit, duration_minutes: parseInt(e.target.value) })}
                className="w-full p-3 rounded-xl border border-sand bg-white text-sm">
                {[15, 20, 30, 45, 60, 75, 90, 120].map(d => <option key={d} value={d}>{toFarsiNum(d)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] text-soot mb-1">قیمت (تومان)</span>
              <input value={edit.price || ''} onChange={e => setEdit({ ...edit, price: parseInt(toLatinNum(e.target.value).replace(/[^0-9]/g, '')) || 0 })}
                dir="ltr" inputMode="numeric" placeholder="500000"
                className="w-full p-3 rounded-xl border border-sand text-sm tnum" />
            </label>
          </div>
          {edit.price > 0 && <div className="text-[11px] text-soot">= {fmtPrice(edit.price)} تومان</div>}
          <div className="flex gap-1.5 text-xs">
            {(['online', 'in_person', 'both'] as const).map(m => (
              <button key={m} onClick={() => setEdit({ ...edit, mode: m })}
                className={`flex-1 py-2.5 rounded-xl border font-medium ${edit.mode === m ? 'bg-ink text-white border-ink' : 'border-sand text-soot'}`}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <textarea value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} rows={2}
            placeholder="توضیح (اختیاری)" className="w-full p-3 rounded-xl border border-sand text-sm" />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy}
              className="flex-1 py-3 rounded-xl bg-ink text-white text-sm font-bold disabled:opacity-50">ذخیره</button>
            <button onClick={() => setEdit(null)} className="px-4 py-3 rounded-xl border border-sand text-soot text-sm">انصراف</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── فرمِ ساعاتِ کاری ─────────────────────────────────────────────
function ScheduleForm({ ov, slug, reload, uiAlert }: {
  ov: Overview; slug: string; reload: () => void; uiAlert: (m: string) => Promise<void>
}) {
  const [weekly, setWeekly] = useState<WeeklyRow[]>(ov.weekly.map(w => ({ weekday: w.weekday, start_time: w.start_time, end_time: w.end_time, mode: w.mode })))
  const [busy, setBusy] = useState(false)

  async function save() {
    for (const r of weekly) {
      if (timeKey(r.start_time) >= timeKey(r.end_time)) {
        uiAlert(`بازه‌ی ${r.start_time} تا ${r.end_time} نامعتبر است — پایان باید بعد از شروع باشد.`)
        return
      }
    }
    setBusy(true)
    const r = await api(`/api/t/${slug}/panel/schedule`, 'PUT', { weekly })
    setBusy(false)
    if (!r.ok) { uiAlert(r.data.error || 'ذخیره نشد'); return }
    await uiAlert('ساعاتِ کاری ذخیره شد ✓')
    reload()
  }

  const timeSelectCls = 'p-2.5 rounded-xl border border-sand bg-white text-xs tnum'

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-soot leading-relaxed">
        برای هر روز بازه‌های کاری‌تان را مشخص کنید — ساعت‌های قابلِ رزرو از همین‌ها ساخته می‌شوند.
      </p>
      {PERSIAN_WEEKDAYS_FULL.map((dayName, wd) => {
        const rows = weekly.map((r, idx) => ({ ...r, idx })).filter(r => r.weekday === wd)
        return (
          <div key={wd} className={`rounded-2xl border bg-white p-3.5 ${rows.length ? 'border-sand' : 'border-sand/60'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-sm font-bold ${rows.length ? '' : 'text-soot/60'}`}>{dayName}</span>
              <button onClick={() => setWeekly([...weekly, { weekday: wd, start_time: '09:00', end_time: '13:00', mode: 'both' }])}
                className="text-[11px] px-3 py-1.5 rounded-lg bg-paper text-soot font-medium">+ بازه</button>
            </div>
            {rows.length === 0 && <div className="text-[11px] text-soot/60">تعطیل</div>}
            {rows.map(r => (
              <div key={r.idx} className="flex items-center gap-1.5 mt-2">
                <select value={r.start_time} onChange={e => setWeekly(weekly.map((w, i) => i === r.idx ? { ...w, start_time: e.target.value } : w))}
                  className={timeSelectCls}>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{toFarsiNum(t)}</option>)}
                </select>
                <span className="text-[11px] text-soot">تا</span>
                <select value={r.end_time} onChange={e => setWeekly(weekly.map((w, i) => i === r.idx ? { ...w, end_time: e.target.value } : w))}
                  className={timeSelectCls}>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{toFarsiNum(t)}</option>)}
                </select>
                <select value={r.mode} onChange={e => setWeekly(weekly.map((w, i) => i === r.idx ? { ...w, mode: e.target.value } : w))}
                  className="flex-1 min-w-0 p-2.5 rounded-xl border border-sand bg-white text-xs">
                  <option value="both">هر دو</option>
                  <option value="online">آنلاین</option>
                  <option value="in_person">حضوری</option>
                </select>
                <button onClick={() => setWeekly(weekly.filter((_, i) => i !== r.idx))}
                  className="w-9 h-9 rounded-xl border border-red-200 text-red-500 shrink-0">✕</button>
              </div>
            ))}
          </div>
        )
      })}
      <button onClick={save} disabled={busy}
        className="w-full py-3.5 rounded-2xl bg-ink text-white text-sm font-bold disabled:opacity-50">
        {busy ? 'در حالِ ذخیره…' : 'ذخیره‌ی ساعاتِ کاری'}
      </button>
    </div>
  )
}

export default function Page() {
  return <DialogProvider><Panel /></DialogProvider>
}
