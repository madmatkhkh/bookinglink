'use client'
// ─── پنلِ سوپرادمینِ پلتفرم ──────────────────────────────────────
// ورود با SUPER_SECRET، لیست/ساخت/تعلیقِ tenantها (فاز ۱: آنبوردینگِ دستی)
import { useCallback, useEffect, useState } from 'react'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { PLATFORM_NAME } from '@/lib/config'

type Tenant = {
  id: string
  slug: string
  status: 'active' | 'suspended' | 'pending'
  plan: string
  owner_phone: string
  created_at: string
  tenant_profiles: { display_name: string | null }[] | { display_name: string | null } | null
}

const STATUS_LABEL: Record<string, string> = {
  active: 'فعال',
  suspended: 'معلق',
  pending: 'در انتظار',
}

function displayName(t: Tenant): string {
  const p = t.tenant_profiles
  if (!p) return '—'
  const row = Array.isArray(p) ? p[0] : p
  return row?.display_name || '—'
}

function SuperInner() {
  const dialog = useDialog()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(false)

  // فرمِ ساختِ tenant تازه
  const [slug, setSlug] = useState('')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [nicheKey, setNicheKey] = useState('psychology')
  const [niches, setNiches] = useState<{ key: string; display_name: string }[]>([])
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/super/tenants', { cache: 'no-store' })
    if (res.status === 401) { setAuthed(false); setLoading(false); return }
    const data = await res.json()
    setTenants(data.tenants || [])
    setAuthed(true)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetch('/api/niches').then(r => r.json()).then(d => setNiches(d.niches || [])).catch(() => {})
  }, [])

  async function login() {
    if (!secret.trim()) return
    setBusy(true)
    const res = await fetch('/api/super/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secret.trim() }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      await dialog.uiAlert(d.error || 'ورود ناموفق بود')
      return
    }
    setSecret('')
    load()
  }

  async function createTenant() {
    if (!slug.trim() || !phone.trim()) {
      await dialog.uiAlert('slug و شماره‌ی موبایلِ متخصص را وارد کنید')
      return
    }
    setCreating(true)
    const res = await fetch('/api/super/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug.trim(), owner_phone: phone.trim(), display_name: name.trim(), niche_key: nicheKey }),
    })
    const d = await res.json().catch(() => ({}))
    setCreating(false)
    if (!res.ok) {
      await dialog.uiAlert(d.error || 'ساختِ tenant ناموفق بود')
      return
    }
    setSlug(''); setPhone(''); setName('')
    load()
  }

  async function setStatus(t: Tenant, status: 'active' | 'suspended') {
    const verb = status === 'suspended' ? 'معلق' : 'فعال'
    const ok = await dialog.uiConfirm(`«${t.slug}» ${verb} شود؟`)
    if (!ok) return
    await fetch('/api/super/tenants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.id, status }),
    })
    load()
  }

  if (authed === null) {
    return <main className="min-h-screen grid place-items-center text-soot">در حالِ بارگذاری…</main>
  }

  if (!authed) {
    return (
      <main className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-sm bg-white border border-sand rounded-2xl p-6 space-y-4">
          <h1 className="text-lg font-bold text-ink">مدیریتِ {PLATFORM_NAME}</h1>
          <input
            type="password"
            dir="ltr"
            className="w-full border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="رمزِ مدیریت"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
          />
          <button
            onClick={login}
            disabled={busy}
            className="w-full bg-ink text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'در حالِ ورود…' : 'ورود'}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">مدیریتِ {PLATFORM_NAME}</h1>
        <span className="text-sm text-soot tnum">{tenants.length} متخصص</span>
      </header>

      {/* ساختِ tenant تازه */}
      <section className="bg-white border border-sand rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-ink text-sm">افزودنِ متخصصِ جدید</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            dir="ltr"
            className="border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="slug (مثلاً sara)"
            value={slug}
            onChange={e => setSlug(e.target.value)}
          />
          <input
            dir="ltr"
            inputMode="numeric"
            className="border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="موبایلِ متخصص 09…"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <input
            className="border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="نامِ نمایشی (اختیاری)"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <select
            className="border border-sand rounded-xl px-3 py-2 text-sm bg-white"
            value={nicheKey}
            onChange={e => setNicheKey(e.target.value)}
          >
            {niches.map(n => <option key={n.key} value={n.key}>{n.display_name}</option>)}
          </select>
        </div>
        <button
          onClick={createTenant}
          disabled={creating}
          className="bg-ink text-white rounded-xl px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          {creating ? 'در حالِ ساخت…' : 'بساز'}
        </button>
      </section>

      {/* لیستِ tenantها */}
      <section className="space-y-3">
        {loading && <p className="text-sm text-soot">در حالِ بارگذاری…</p>}
        {!loading && tenants.length === 0 && (
          <p className="text-sm text-soot">هنوز متخصصی ثبت نشده.</p>
        )}
        {tenants.map(t => (
          <div key={t.id} className="bg-white border border-sand rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-ink">{displayName(t)}</span>
                <a href={`/${t.slug}`} target="_blank" dir="ltr" className="text-xs text-soot underline">
                  /{t.slug}
                </a>
              </div>
              <div className="text-xs text-soot mt-1 flex items-center gap-3 flex-wrap">
                <span dir="ltr" className="tnum">{t.owner_phone}</span>
                <span
                  className={
                    'px-2 py-0.5 rounded-full ' +
                    (t.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : t.status === 'suspended'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-sand text-soot')
                  }
                >
                  {STATUS_LABEL[t.status] || t.status}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={`/${t.slug}/panel`}
                target="_blank"
                className="text-xs border border-sand rounded-xl px-3 py-1.5 text-ink"
              >
                پنل
              </a>
              {t.status === 'active' ? (
                <button
                  onClick={() => setStatus(t, 'suspended')}
                  className="text-xs border border-red-200 text-red-700 rounded-xl px-3 py-1.5"
                >
                  تعلیق
                </button>
              ) : (
                <button
                  onClick={() => setStatus(t, 'active')}
                  className="text-xs border border-green-200 text-green-800 rounded-xl px-3 py-1.5"
                >
                  فعال‌سازی
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}

export default function SuperPage() {
  return (
    <DialogProvider>
      <SuperInner />
    </DialogProvider>
  )
}
