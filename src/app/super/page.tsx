'use client'
// ─── پنل سوپرادمین پلتفرم ──────────────────────────────────────
// ورود با SUPER_SECRET، داشبورد خلاصه، فیلتر/جست‌وجو، لیست/ساخت/تعلیق tenantها
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { PLATFORM_NAME } from '@/lib/config'

type Tenant = {
  id: string
  slug: string
  status: 'active' | 'suspended' | 'pending'
  plan: string
  niche_key: string
  owner_phone: string
  created_at: string
  records_count: number
  tenant_profiles: { display_name: string | null }[] | { display_name: string | null } | null
}

type Summary = {
  total: number; active: number; suspended: number; pending: number
  recent_7d: number; inactive: number; by_niche: Record<string, number>
}

const STATUS_LABEL: Record<string, string> = {
  active: 'فعال',
  suspended: 'معلق',
  pending: 'در انتظار',
}

const RECENT_MS = 7 * 24 * 60 * 60 * 1000

function displayName(t: Tenant): string {
  const p = t.tenant_profiles
  if (!p) return '—'
  const row = Array.isArray(p) ? p[0] : p
  return row?.display_name || '—'
}

function isRecent(t: Tenant): boolean {
  return Date.now() - new Date(t.created_at).getTime() < RECENT_MS
}

function SuperInner() {
  const dialog = useDialog()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)

  // فیلتر/جست‌وجوی لیست
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'pending'>('all')
  const [nicheFilter, setNicheFilter] = useState('all')

  // فرم ساخت tenant تازه
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
    setSummary(data.summary || null)
    setAuthed(true)
    setLoading(false)
  }, [])

  const nicheLabel = useCallback(
    (key: string) => niches.find(n => n.key === key)?.display_name || key,
    [niches]
  )

  const filteredTenants = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tenants.filter(t => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (nicheFilter !== 'all' && t.niche_key !== nicheFilter) return false
      if (!q) return true
      const name = displayName(t).toLowerCase()
      return t.slug.toLowerCase().includes(q) || name.includes(q) || t.owner_phone.includes(q)
    })
  }, [tenants, search, statusFilter, nicheFilter])

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
      await dialog.uiAlert('slug و شماره‌ی موبایل متخصص را وارد کنید')
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
      await dialog.uiAlert(d.error || 'ساخت tenant ناموفق بود')
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
    return <main className="min-h-screen grid place-items-center text-soot">در حال بارگذاری…</main>
  }

  if (!authed) {
    return (
      <main className="min-h-screen grid place-items-center px-4">
        <div className="w-full max-w-sm bg-white border border-sand rounded-2xl p-6 space-y-4">
          <h1 className="text-lg font-bold text-ink">مدیریت {PLATFORM_NAME}</h1>
          <input
            type="password"
            dir="ltr"
            className="w-full border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="رمز مدیریت"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
          />
          <button
            onClick={login}
            disabled={busy}
            className="w-full bg-ink text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'در حال ورود…' : 'ورود'}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">مدیریت {PLATFORM_NAME}</h1>
        <div className="flex items-center gap-3">
          <a href="/super/accounting" className="text-xs border border-sand rounded-xl px-3 py-1.5 text-ink">
            حسابداری
          </a>
          <a href="/super/tickets" className="text-xs border border-sand rounded-xl px-3 py-1.5 text-ink">
            تیکت‌ها
          </a>
          <a href="/super/niches" className="text-xs border border-sand rounded-xl px-3 py-1.5 text-ink">
            مدیریت نیچ‌ها
          </a>
          <span className="text-sm text-soot tnum">{tenants.length} متخصص</span>
        </div>
      </header>

      {/* داشبورد خلاصه */}
      {summary && (
        <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <button
            onClick={() => setStatusFilter('all')}
            className={'bg-white border rounded-2xl p-4 text-center ' + (statusFilter === 'all' ? 'border-ink' : 'border-sand')}
          >
            <div className="text-2xl font-bold text-ink tnum">{summary.total}</div>
            <div className="text-xs text-soot mt-1">کل</div>
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={'bg-white border rounded-2xl p-4 text-center ' + (statusFilter === 'active' ? 'border-ink' : 'border-sand')}
          >
            <div className="text-2xl font-bold text-green-700 tnum">{summary.active}</div>
            <div className="text-xs text-soot mt-1">فعال</div>
          </button>
          <button
            onClick={() => setStatusFilter('suspended')}
            className={'bg-white border rounded-2xl p-4 text-center ' + (statusFilter === 'suspended' ? 'border-ink' : 'border-sand')}
          >
            <div className="text-2xl font-bold text-red-700 tnum">{summary.suspended}</div>
            <div className="text-xs text-soot mt-1">معلق</div>
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={'bg-white border rounded-2xl p-4 text-center ' + (statusFilter === 'pending' ? 'border-ink' : 'border-sand')}
          >
            <div className="text-2xl font-bold text-amber-700 tnum">{summary.pending}</div>
            <div className="text-xs text-soot mt-1">در انتظار</div>
          </button>
          <div className="bg-white border border-sand rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-ink tnum">{summary.recent_7d}</div>
            <div className="text-xs text-soot mt-1">تازه (۷ روز)</div>
          </div>
        </section>
      )}
      {summary && summary.inactive > 0 && (
        <p className="text-xs text-amber-700 -mt-4">
          {summary.inactive} متخصص هنوز هیچ پرونده/رزروی ثبت نکرده‌اند — کاندید پیگیری آنبوردینگ.
        </p>
      )}

      {/* ساخت tenant تازه */}
      <section className="bg-white border border-sand rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-ink text-sm">افزودن متخصص جدید</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            dir="ltr"
            className="border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="slug (مثلا sara)"
            value={slug}
            onChange={e => setSlug(e.target.value)}
          />
          <input
            dir="ltr"
            inputMode="numeric"
            className="border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="موبایل متخصص 09…"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <input
            className="border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="نام نمایشی (اختیاری)"
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
          {creating ? 'در حال ساخت…' : 'بساز'}
        </button>
      </section>

      {/* جست‌وجو/فیلتر */}
      <section className="flex flex-col sm:flex-row gap-3">
        <input
          className="flex-1 border border-sand rounded-xl px-3 py-2 text-sm bg-white"
          placeholder="جست‌وجو: نام، slug یا شماره…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border border-sand rounded-xl px-3 py-2 text-sm bg-white"
          value={nicheFilter}
          onChange={e => setNicheFilter(e.target.value)}
        >
          <option value="all">همه‌ی نیچ‌ها</option>
          {niches.map(n => <option key={n.key} value={n.key}>{n.display_name}</option>)}
        </select>
      </section>

      {/* لیست tenantها */}
      <section className="space-y-3">
        {loading && <p className="text-sm text-soot">در حال بارگذاری…</p>}
        {!loading && tenants.length === 0 && (
          <p className="text-sm text-soot">هنوز متخصصی ثبت نشده.</p>
        )}
        {!loading && tenants.length > 0 && filteredTenants.length === 0 && (
          <p className="text-sm text-soot">با این فیلتر چیزی پیدا نشد.</p>
        )}
        {filteredTenants.map(t => (
          <div key={t.id} className="bg-white border border-sand rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-ink">{displayName(t)}</span>
                <a href={`/${t.slug}`} target="_blank" dir="ltr" className="text-xs text-soot underline">
                  /{t.slug}
                </a>
                {isRecent(t) && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">تازه</span>
                )}
                {t.records_count === 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">بدون فعالیت</span>
                )}
              </div>
              <div className="text-xs text-soot mt-1 flex items-center gap-3 flex-wrap">
                <span dir="ltr" className="tnum">{t.owner_phone}</span>
                <span className="tnum">{t.records_count} پرونده/رزرو</span>
                <span>{nicheLabel(t.niche_key)}</span>
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
                href={`/super/${t.id}`}
                className="text-xs border border-sand rounded-xl px-3 py-1.5 text-ink"
              >
                جزئیات
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
