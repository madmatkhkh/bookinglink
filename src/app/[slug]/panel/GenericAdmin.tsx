'use client'
// ─────────────────────────────────────────────────────────────────────────────
// پنلِ جنریک (نیچ‌های غیرروانشناسی مثلِ سالن) — سرویس‌محور، چندمنبعی.
// از روت‌های عمومیِ /panel/* استفاده می‌کند (نه psy).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { toFarsiNum, PERSIAN_MONTHS, getCurrentJalali } from '@/lib/calendar'
import { BOOKING_STATUS_LABEL, MODE_LABEL } from '@/lib/config'

type Overview = {
  slug: string; niche_key: string
  labels: { client: string; resource: string; booking: string }
  profile: any; services: any[]; resources: any[]
  weekly: any[]; overrides: any[]; pending: any[]; upcoming: any[]
}

function GenericPanel() {
  const { slug } = useParams<{ slug: string }>()
  const { uiAlert, uiConfirm } = useDialog()
  const [ov, setOv] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [tab, setTab] = useState<'bookings' | 'services' | 'schedule' | 'settings'>('bookings')

  const load = useCallback(async () => {
    const r = await fetch(`/api/t/${slug}/panel/overview`, { cache: 'no-store' })
    if (r.status === 401) { setNeedsLogin(true); setLoading(false); return }
    const d = await r.json()
    setOv(d); setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  if (needsLogin) return <GenericLogin slug={slug} onSuccess={() => { setNeedsLogin(false); load() }} />
  if (loading || !ov) return <div className="min-h-screen flex items-center justify-center text-soot">در حال بارگذاری…</div>

  const L = ov.labels

  return (
    <main className="min-h-screen bg-paper pb-24" dir="rtl">
      <div className="bg-accent" style={{ ['--brand' as any]: ov.profile?.theme_color || '212 83 126' }}>
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between text-white">
          <div>
            <div className="font-bold">{ov.profile?.display_name || 'پنلِ مدیریت'}</div>
            <div className="text-xs opacity-80">/{slug}</div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 pt-5" style={{ ['--brand' as any]: ov.profile?.theme_color || '212 83 126' }}>
        {tab === 'bookings' && <BookingsTab ov={ov} L={L} />}
        {tab === 'services' && <ServicesTab ov={ov} slug={slug} reload={load} uiAlert={uiAlert} uiConfirm={uiConfirm} />}
        {tab === 'schedule' && <div className="text-sm text-soot bg-white rounded-2xl border border-sand p-6 text-center">برنامه‌ی کاری از تنظیماتِ هر {L.resource} مدیریت می‌شود.</div>}
        {tab === 'settings' && <SettingsTab ov={ov} slug={slug} reload={load} uiAlert={uiAlert} L={L} />}
      </div>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-sand" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-4">
          {([
            ['bookings', '📋', `${L.booking}‌ها`],
            ['services', '🧾', 'سرویس‌ها'],
            ['schedule', '📅', 'برنامه'],
            ['settings', '⚙️', 'تنظیمات'],
          ] as [typeof tab, string, string][]).map(([k, icon, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`py-2.5 flex flex-col items-center gap-0.5 text-[11px] ${tab === k ? 'text-ink font-bold' : 'text-soot'}`}>
              <span className="text-lg leading-none">{icon}</span>{label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  )
}

function BookingsTab({ ov, L }: { ov: Overview; L: any }) {
  const all = [...(ov.pending || []), ...(ov.upcoming || [])]
  const seen = new Set<string>()
  const items = all.filter(b => { if (seen.has(b.id)) return false; seen.add(b.id); return true })
  if (items.length === 0)
    return <div className="text-sm text-soot bg-white rounded-2xl border border-sand p-6 text-center">هنوز {L.booking}ی ثبت نشده.</div>
  return (
    <div className="space-y-3">
      {items.map(b => (
        <div key={b.id} className="rounded-2xl border border-sand bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold">{b.client_name}</div>
              <div className="mt-1 text-xs text-soot" dir="ltr">{b.client_phone}</div>
              <div className="mt-1.5 text-xs text-soot">
                {b.services?.name} · {toFarsiNum(b.booking_date)} · <span className="tnum">{toFarsiNum(b.booking_time)}</span>
                {b.resources?.name ? ` · ${b.resources.name}` : ''}
              </div>
            </div>
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-sand text-soot shrink-0">{BOOKING_STATUS_LABEL[b.status] || b.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ServicesTab({ ov, slug, reload, uiAlert, uiConfirm }: any) {
  const active = (ov.services || []).filter((s: any) => s.is_active)
  return (
    <div className="space-y-3">
      {active.length === 0 && <div className="text-sm text-soot bg-white rounded-2xl border border-sand p-6 text-center">هنوز سرویسی نیست.</div>}
      {active.map((s: any) => (
        <div key={s.id} className="rounded-2xl border border-sand bg-white p-4 flex items-center justify-between">
          <div>
            <div className="font-bold text-sm">{s.name}</div>
            <div className="mt-1 text-xs text-soot">{toFarsiNum(s.duration_minutes)} دقیقه · {MODE_LABEL[s.mode] || s.mode}</div>
          </div>
          <div className="text-left">
            <div className="font-extrabold tnum text-sm">{toFarsiNum((s.price || 0).toLocaleString('en-US'))}</div>
            <div className="text-[10px] text-soot">تومان</div>
          </div>
        </div>
      ))}
      <p className="text-[11px] text-soot text-center pt-2">افزودن و ویرایشِ سرویس‌ها در نسخه‌ی بعد کامل می‌شود.</p>
    </div>
  )
}

function SettingsTab({ ov, slug, reload, uiAlert, L }: any) {
  return (
    <div className="rounded-2xl border border-sand bg-white p-5 space-y-2">
      <div className="font-bold text-sm">{ov.profile?.display_name}</div>
      <div className="text-xs text-soot">نیچ: {ov.niche_key} · {(ov.resources || []).filter((r: any) => r.is_active).length} {L.resource}ِ فعال</div>
      <div className="text-[11px] text-soot pt-2">تنظیماتِ کاملِ این پنل در نسخه‌ی بعد اضافه می‌شود.</div>
    </div>
  )
}

function GenericLogin({ slug, onSuccess }: { slug: string; onSuccess: () => void }) {
  const [sent, setSent] = useState(false)
  const [dev, setDev] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function send() {
    setBusy(true); setErr('')
    const r = await fetch(`/api/t/${slug}/panel/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setErr(d.error || 'خطا'); return }
    setSent(true); setDev(d.dev_code || '')
  }
  async function verify() {
    setBusy(true); setErr('')
    const r = await fetch(`/api/t/${slug}/panel/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setErr(d.error || 'کد نادرست'); return }
    onSuccess()
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-lg font-bold text-ink">ورود به پنل</h1>
          <p className="text-xs text-soot mt-1.5">کدِ ورود به موبایلِ صاحبِ پنل فرستاده می‌شود.</p>
        </div>
        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5 mb-3 text-center">{err}</div>}
        {!sent ? (
          <button onClick={send} disabled={busy} className="w-full py-3 rounded-xl bg-accent text-white font-medium disabled:opacity-50">
            {busy ? 'در حال ارسال…' : 'ارسالِ کدِ ورود'}
          </button>
        ) : (
          <div className="space-y-3">
            {dev && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">کدِ تست: <strong className="text-base">{dev}</strong></div>}
            <input value={code} onChange={e => setCode(e.target.value)} dir="ltr" inputMode="numeric" autoFocus placeholder="کد 5 رقمی"
              className="w-full p-3 rounded-xl border border-sand text-lg text-center tracking-widest" />
            <button onClick={verify} disabled={busy || code.trim().length < 5} className="w-full py-3 rounded-xl bg-accent text-white font-medium disabled:opacity-40">ورود</button>
          </div>
        )}
      </div>
    </div>
  )
}

export function GenericAdmin() {
  return <DialogProvider><GenericPanel /></DialogProvider>
}
