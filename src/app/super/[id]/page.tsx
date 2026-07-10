'use client'
// ─────────────────────────────────────────────────────────────────────────────
// جزئیات یک tenant: ویرایش اطلاعات پایه (شماره‌ی مالک، نام نمایشی، دامنه)،
// نمایش منابع/آمار، سوییچ ماژول‌ها، ورود مستقیم به‌جای owner (پشتیبانی)،
// و حذف کامل tenant.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { PLATFORM_NAME } from '@/lib/config'

type Detail = {
  tenant: {
    id: string; slug: string; status: string; plan: string; niche_key: string
    owner_phone: string; custom_domain: string | null; domain_verified: boolean
    created_at: string; display_name: string; theme_color: string
  }
  niche: { key: string; display_name: string; resource_label: string; client_label: string; booking_label: string } | null
  resources: { id: string; name: string; title: string; phone: string | null; is_active: boolean; is_selectable: boolean; created_at: string; has_sheba: boolean }[]
  stats: Record<string, number>
  features: { feature_key: string; label: string; enabled: boolean }[]
  impersonate_token?: string
}

const STATUS_LABEL: Record<string, string> = { active: 'فعال', suspended: 'معلق', pending: 'در انتظار' }
const STAT_LABEL: Record<string, string> = {
  cases: 'پرونده', sessions: 'جلسه', packages: 'پروتکل', bookings: 'رزرو', services: 'سرویس', records: 'پرونده',
}

function Inner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const dialog = useDialog()

  const [d, setD] = useState<Detail | null>(null)
  const [notAuthed, setNotAuthed] = useState(false)
  const [loading, setLoading] = useState(true)

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [savingDomain, setSavingDomain] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmSlug, setConfirmSlug] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/super/tenants/${id}`, { cache: 'no-store' })
    if (res.status === 401) { setNotAuthed(true); setLoading(false); return }
    if (!res.ok) { setLoading(false); return }
    const data: Detail = await res.json()
    setD(data)
    setPhone(data.tenant.owner_phone)
    setName(data.tenant.display_name)
    setDomain(data.tenant.custom_domain || '')
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (notAuthed) router.replace('/super') }, [notAuthed, router])
  useEffect(() => {
    const err = searchParams.get('impersonate_error')
    if (!err) return
    dialog.uiAlert(err === 'suspended' ? 'این مجموعه فعال نیست — فقط برای مجموعه‌های فعال ممکن است.'
      : err === 'expired' ? 'لینک ورود منقضی شده بود — دوباره دکمه‌ی ورود را بزن.'
      : 'مجموعه یافت نشد.')
    router.replace(`/super/${id}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/super/tenants/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { await dialog.uiAlert(j.error || 'ذخیره ناموفق بود'); return false }
    if (j.forced_card_disabled_count > 0) {
      await dialog.uiAlert(`کارت‌به‌کارت ${j.forced_card_disabled_count} درمانگر (که روشن بود) به‌خاطر برگشت به پلن رایگان خاموش شد؛ پرداخت آنلاین برایشان اجباری شد.`)
    }
    return true
  }

  async function savePhone() {
    if (!/^09\d{9}$/.test(phone.trim())) { await dialog.uiAlert('شماره‌ی موبایل معتبر نیست'); return }
    const ok = await dialog.uiConfirm('تغییر این شماره یعنی متخصص با شماره‌ی قبلی دیگر نمی‌تواند وارد پنل شود. ادامه می‌دهید؟')
    if (!ok) return
    setSavingPhone(true)
    const success = await patch({ owner_phone: phone.trim() })
    setSavingPhone(false)
    if (success) load()
  }

  async function saveName() {
    setSavingName(true)
    const success = await patch({ display_name: name.trim() })
    setSavingName(false)
    if (success) load()
  }

  async function saveDomain() {
    setSavingDomain(true)
    const success = await patch({ custom_domain: domain.trim() })
    setSavingDomain(false)
    if (success) load()
  }

  async function toggleVerified(v: boolean) {
    await patch({ domain_verified: v })
    load()
  }

  async function setStatus(status: string) {
    await patch({ status })
    load()
  }

  async function setPlan(plan: string) {
    await patch({ plan })
    load()
  }

  async function toggleFeature(key: string, enabled: boolean) {
    await fetch(`/api/super/tenants/${id}/features`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_key: key, enabled }),
    })
    load()
  }

  function impersonate() {
    if (!d) return
    dialog.uiConfirm('وارد پنل این متخصص می‌شوید (به‌جای او). اگر خودش همین الان از جایی دیگر لاگین باشد، نشستش باطل می‌شود. ادامه؟')
      .then(ok => {
        if (!ok) return
        // توکن ضد CSRF کوتاه‌عمر است — همان لحظه یک نسخه‌ی تازه از API احرازشده می‌گیریم
        fetch(`/api/super/tenants/${id}`, { cache: 'no-store' })
          .then(r => r.json())
          .then(j => { if (j?.impersonate_token) window.open(`/api/super/tenants/${id}/impersonate?token=${encodeURIComponent(j.impersonate_token)}`, '_blank') })
      })
  }

  async function doDelete() {
    if (!d || confirmSlug.trim() !== d.tenant.slug) return
    setDeleting(true)
    const res = await fetch(`/api/super/tenants/${id}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    setDeleting(false)
    if (!res.ok) { await dialog.uiAlert(j.error || 'حذف ناموفق بود'); return }
    router.replace('/super')
  }

  if (loading || !d) {
    return <main className="min-h-screen grid place-items-center text-soot">در حال بارگذاری…</main>
  }

  const t = d.tenant

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 space-y-8">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <a href="/super" className="text-xs text-soot underline">← بازگشت به لیست</a>
          <h1 className="text-xl font-bold text-ink mt-1">{t.display_name || t.slug}</h1>
          <div className="text-xs text-soot mt-1 flex items-center gap-2 flex-wrap">
            <a href={`/${t.slug}`} target="_blank" dir="ltr" className="underline">/{t.slug}</a>
            <span>·</span>
            <span>{d.niche?.display_name || t.niche_key}</span>
            <span>·</span>
            <span
              className={
                'px-2 py-0.5 rounded-full ' +
                (t.status === 'active' ? 'bg-green-100 text-green-800'
                  : t.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-sand text-soot')
              }
            >
              {STATUS_LABEL[t.status] || t.status}
            </span>
          </div>
        </div>
        <a
          href={`/${t.slug}/panel`}
          target="_blank"
          className="text-xs border border-sand rounded-xl px-3 py-1.5 text-ink shrink-0"
        >
          پنل عمومی
        </a>
      </header>

      {/* آمار */}
      <section className="grid grid-cols-3 sm:grid-cols-3 gap-3">
        {Object.entries(d.stats).map(([k, v]) => (
          <div key={k} className="bg-white border border-sand rounded-2xl p-4 text-center">
            <div className="text-2xl font-bold text-ink tnum">{v}</div>
            <div className="text-xs text-soot mt-1">{STAT_LABEL[k] || k}</div>
          </div>
        ))}
        <div className="bg-white border border-sand rounded-2xl p-4 text-center">
          <div className="text-2xl font-bold text-ink tnum">{d.resources.length}</div>
          <div className="text-xs text-soot mt-1">{d.niche?.resource_label || 'منبع'}</div>
        </div>
      </section>

      {/* اطلاعات پایه */}
      <section className="bg-white border border-sand rounded-2xl p-5 space-y-4">
        <h2 className="font-bold text-ink text-sm">اطلاعات پایه</h2>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="نام نمایشی"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <button
            onClick={saveName}
            disabled={savingName || name.trim() === t.display_name}
            className="text-xs border border-sand rounded-xl px-4 py-2 text-ink disabled:opacity-40 shrink-0"
          >
            {savingName ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            dir="ltr"
            inputMode="numeric"
            className="flex-1 border border-sand rounded-xl px-3 py-2 text-sm tnum"
            placeholder="موبایل مالک 09…"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <button
            onClick={savePhone}
            disabled={savingPhone || phone.trim() === t.owner_phone}
            className="text-xs border border-sand rounded-xl px-4 py-2 text-ink disabled:opacity-40 shrink-0"
          >
            {savingPhone ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
        </div>
        <p className="text-[11px] text-soot -mt-2">این شماره برای ورود owner به پنل استفاده می‌شود.</p>

        <div className="flex items-center gap-2 pt-2 border-t border-sand">
          <span className="text-xs text-soot">وضعیت:</span>
          {(['active', 'suspended', 'pending'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={
                'text-xs rounded-xl px-3 py-1.5 border ' +
                (t.status === s ? 'bg-ink text-white border-ink' : 'border-sand text-ink')
              }
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-soot">پلن:</span>
          {(['free', 'pro'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPlan(p)}
              className={
                'text-xs rounded-xl px-3 py-1.5 border ' +
                (t.plan === p ? 'bg-ink text-white border-ink' : 'border-sand text-ink')
              }
            >
              {p === 'free' ? 'رایگان' : 'حرفه‌ای'}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-soot -mt-2">
          پلن رایگان: فقط پرداخت آنلاین زیبال (کارت‌به‌کارت غیرفعال است). با برگشت به رایگان، اگر کارت‌به‌کارت برای درمانگری روشن بود، خودکار خاموش و آنلاین اجباری می‌شود.
        </p>

        <div className="text-xs text-soot pt-2 border-t border-sand">
          تاریخ ساخت: <span className="tnum">{new Date(t.created_at).toLocaleDateString('fa-IR')}</span>
        </div>
      </section>

      {/* دامنه‌ی اختصاصی */}
      <section className="bg-white border border-sand rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-ink text-sm">دامنه‌ی اختصاصی</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            dir="ltr"
            className="flex-1 border border-sand rounded-xl px-3 py-2 text-sm"
            placeholder="example.com"
            value={domain}
            onChange={e => setDomain(e.target.value)}
          />
          <button
            onClick={saveDomain}
            disabled={savingDomain || domain.trim() === (t.custom_domain || '')}
            className="text-xs border border-sand rounded-xl px-4 py-2 text-ink disabled:opacity-40 shrink-0"
          >
            {savingDomain ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-soot">
          <input
            type="checkbox"
            checked={t.domain_verified}
            onChange={e => toggleVerified(e.target.checked)}
            disabled={!t.custom_domain}
            className="w-4 h-4 accent-ink"
          />
          دامنه تاییدشده است (verify دستی — منطق خودکار هنوز پیاده نشده)
        </label>
      </section>

      {/* منابع (پرسنل) */}
      <section className="bg-white border border-sand rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-ink text-sm">{d.niche?.resource_label || 'منابع'} ({d.resources.length})</h2>
        {d.resources.length === 0 && <p className="text-sm text-soot">هنوز منبعی ثبت نشده.</p>}
        <div className="space-y-2">
          {d.resources.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 border border-sand rounded-xl px-3 py-2">
              <div>
                <div className="text-sm text-ink">{r.name}{r.title ? ` — ${r.title}` : ''}</div>
                {r.phone && <div className="text-xs text-soot tnum" dir="ltr">{r.phone}</div>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                {!r.is_active && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700">غیرفعال</span>}
                {r.is_selectable && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sand text-soot">قابل انتخاب</span>}
                {d.niche?.key === 'psychology' && (
                  r.has_sheba
                    ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800">شبا ثبت‌شده</span>
                    : <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">بدون شبا</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ماژول‌های پنل مراجع (فقط روانشناسی فعلا) */}
      {d.features.length > 0 && (
        <section className="bg-white border border-sand rounded-2xl p-5 space-y-3">
          <h2 className="font-bold text-ink text-sm">ماژول‌های پنل مراجع</h2>
          {d.features.map(f => (
            <label key={f.feature_key} className="flex items-center justify-between gap-3 p-2 rounded-xl cursor-pointer">
              <span className="text-sm text-ink">{f.label}</span>
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={e => toggleFeature(f.feature_key, e.target.checked)}
                className="w-5 h-5 accent-ink shrink-0"
              />
            </label>
          ))}
        </section>
      )}

      {/* پشتیبانی */}
      <section className="bg-white border border-sand rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-ink text-sm">پشتیبانی</h2>
        <button
          onClick={impersonate}
          disabled={t.status !== 'active'}
          className="bg-ink text-white rounded-xl px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          ورود به پنل به‌جای owner (تب تازه)
        </button>
        {t.status !== 'active' && <p className="text-[11px] text-soot">فقط برای مجموعه‌های فعال ممکن است.</p>}
      </section>

      {/* منطقه‌ی خطر */}
      <section className="bg-white border border-red-200 rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-red-700 text-sm">حذف کامل این مجموعه</h2>
        <p className="text-xs text-soot">
          همه‌ی پرونده‌ها، نوبت‌ها، پرداخت‌ها و تنظیمات این مجموعه برای همیشه پاک می‌شود. بازگشت‌ناپذیر است.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            dir="ltr"
            className="flex-1 border border-red-200 rounded-xl px-3 py-2 text-sm"
            placeholder={`برای تایید، «${t.slug}» را تایپ کن`}
            value={confirmSlug}
            onChange={e => setConfirmSlug(e.target.value)}
          />
          <button
            onClick={doDelete}
            disabled={deleting || confirmSlug.trim() !== t.slug}
            className="text-xs bg-red-600 text-white rounded-xl px-4 py-2 disabled:opacity-40 shrink-0"
          >
            {deleting ? 'در حال حذف…' : 'حذف کامل'}
          </button>
        </div>
      </section>
    </main>
  )
}

export default function TenantDetailPage() {
  return (
    <DialogProvider>
      <Inner />
    </DialogProvider>
  )
}
