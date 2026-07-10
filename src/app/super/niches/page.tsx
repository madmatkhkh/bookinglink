'use client'
// ─────────────────────────────────────────────────────────────────────────────
// مدیریت نیچ‌ها (تمپلیت‌های نیچی) — طبق «قانون طلایی» پروژه: ساختار = کد،
// محتوا/قابلیت = دیتا. این صفحه یعنی افزودن نیچ سوم/چهارم بدون دست‌زدن به
// دیتابیس یا کد — فقط پرکردن فرم.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { PLATFORM_NAME } from '@/lib/config'

type RecordFieldRow = { key: string; label: string; type: string; options: string }
type SampleServiceRow = { name: string; duration_minutes: number; price: number; mode: string }

type Niche = {
  key: string
  display_name: string
  tagline: string
  icon: string
  client_label: string
  resource_label: string
  booking_label: string
  default_theme: string
  record_fields: { key: string; label: string; type: string; options?: string[] }[]
  default_features: string[]
  sample_services: SampleServiceRow[]
  setup_price: number
  sort_order: number
  is_active: boolean
  tenant_count: number
}

type NicheForm = {
  key: string
  display_name: string
  tagline: string
  icon: string
  client_label: string
  resource_label: string
  booking_label: string
  default_theme: string
  record_fields: RecordFieldRow[]
  default_features: string // comma-separated برای ویرایش ساده
  sample_services: SampleServiceRow[]
  setup_price: number
  sort_order: number
}

const EMPTY_FORM: NicheForm = {
  key: '', display_name: '', tagline: '', icon: '',
  client_label: 'مراجع', resource_label: 'ارائه‌دهنده', booking_label: 'نوبت',
  default_theme: '13 148 136',
  record_fields: [], default_features: '', sample_services: [],
  setup_price: 0, sort_order: 99,
}

function rgbToHex(rgb: string): string {
  const parts = String(rgb || '').trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return '#0d94ff'
  return '#' + parts.map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')
}
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `${r} ${g} ${b}`
}

function nicheToForm(n: Niche): NicheForm {
  return {
    key: n.key, display_name: n.display_name, tagline: n.tagline, icon: n.icon,
    client_label: n.client_label, resource_label: n.resource_label, booking_label: n.booking_label,
    default_theme: n.default_theme,
    record_fields: (n.record_fields || []).map(f => ({ key: f.key, label: f.label, type: f.type, options: (f.options || []).join(', ') })),
    default_features: (n.default_features || []).join(', '),
    sample_services: n.sample_services || [],
    setup_price: n.setup_price, sort_order: n.sort_order,
  }
}

function formToBody(f: NicheForm) {
  return {
    key: f.key, display_name: f.display_name, tagline: f.tagline, icon: f.icon,
    client_label: f.client_label, resource_label: f.resource_label, booking_label: f.booking_label,
    default_theme: f.default_theme,
    record_fields: f.record_fields
      .filter(rf => rf.key.trim() && rf.label.trim())
      .map(rf => ({
        key: rf.key.trim(), label: rf.label.trim(), type: rf.type,
        ...(rf.type === 'select' ? { options: rf.options.split(',').map(o => o.trim()).filter(Boolean) } : {}),
      })),
    default_features: f.default_features.split(',').map(x => x.trim()).filter(Boolean),
    sample_services: f.sample_services.filter(s => s.name.trim()),
    setup_price: f.setup_price, sort_order: f.sort_order,
  }
}

function NicheEditor({ initial, onCancel, onSaved }: { initial: NicheForm; onCancel: () => void; onSaved: () => void }) {
  const dialog = useDialog()
  const [f, setF] = useState<NicheForm>(initial)
  const [saving, setSaving] = useState(false)
  const isNew = !initial.key

  async function save() {
    if (!f.key.trim() || !f.display_name.trim()) {
      await dialog.uiAlert('کلید و نام نمایشی لازم است')
      return
    }
    setSaving(true)
    const body = formToBody(f)
    const res = await fetch('/api/super/niches', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { await dialog.uiAlert(d.error || 'ذخیره ناموفق بود'); return }
    onSaved()
  }

  function addRecordField() {
    setF(s => ({ ...s, record_fields: [...s.record_fields, { key: '', label: '', type: 'text', options: '' }] }))
  }
  function updateRecordField(i: number, patch: Partial<RecordFieldRow>) {
    setF(s => ({ ...s, record_fields: s.record_fields.map((rf, idx) => idx === i ? { ...rf, ...patch } : rf) }))
  }
  function removeRecordField(i: number) {
    setF(s => ({ ...s, record_fields: s.record_fields.filter((_, idx) => idx !== i) }))
  }

  function addSampleService() {
    setF(s => ({ ...s, sample_services: [...s.sample_services, { name: '', duration_minutes: 60, price: 0, mode: 'both' }] }))
  }
  function updateSampleService(i: number, patch: Partial<SampleServiceRow>) {
    setF(s => ({ ...s, sample_services: s.sample_services.map((sv, idx) => idx === i ? { ...sv, ...patch } : sv) }))
  }
  function removeSampleService(i: number) {
    setF(s => ({ ...s, sample_services: s.sample_services.filter((_, idx) => idx !== i) }))
  }

  return (
    <div className="bg-white border border-sand rounded-2xl p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-soot mb-1">کلید (لاتین، ثابت — مثلا beauty_salon)</label>
          <input
            dir="ltr" disabled={!isNew}
            className="w-full border border-sand rounded-xl px-3 py-2 text-sm disabled:bg-sand/40 disabled:text-soot"
            value={f.key} onChange={e => setF(s => ({ ...s, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
          />
        </div>
        <div>
          <label className="block text-xs text-soot mb-1">نام نمایشی</label>
          <input
            className="w-full border border-sand rounded-xl px-3 py-2 text-sm"
            value={f.display_name} onChange={e => setF(s => ({ ...s, display_name: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-soot mb-1">تگ‌لاین (یک جمله‌ی کوتاه، برای لندینگ)</label>
        <input
          className="w-full border border-sand rounded-xl px-3 py-2 text-sm"
          value={f.tagline} onChange={e => setF(s => ({ ...s, tagline: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-soot mb-1">برچسب «مراجع/مشتری»</label>
          <input className="w-full border border-sand rounded-xl px-3 py-2 text-sm" value={f.client_label}
            onChange={e => setF(s => ({ ...s, client_label: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-soot mb-1">برچسب «ارائه‌دهنده»</label>
          <input className="w-full border border-sand rounded-xl px-3 py-2 text-sm" value={f.resource_label}
            onChange={e => setF(s => ({ ...s, resource_label: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs text-soot mb-1">برچسب «نوبت»</label>
          <input className="w-full border border-sand rounded-xl px-3 py-2 text-sm" value={f.booking_label}
            onChange={e => setF(s => ({ ...s, booking_label: e.target.value }))} />
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-soot mb-1">رنگ برند</label>
          <input type="color" value={rgbToHex(f.default_theme)}
            onChange={e => setF(s => ({ ...s, default_theme: hexToRgb(e.target.value) }))}
            className="w-12 h-10 border border-sand rounded-xl cursor-pointer" />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-soot mb-1">مقدار خام (R G B)</label>
          <input dir="ltr" className="w-full border border-sand rounded-xl px-3 py-2 text-sm tnum" value={f.default_theme}
            onChange={e => setF(s => ({ ...s, default_theme: e.target.value }))} />
        </div>
        <div className="w-24">
          <label className="block text-xs text-soot mb-1">هزینه‌ی راه‌اندازی</label>
          <input type="number" className="w-full border border-sand rounded-xl px-3 py-2 text-sm tnum" value={f.setup_price}
            onChange={e => setF(s => ({ ...s, setup_price: Number(e.target.value) || 0 }))} />
        </div>
      </div>

      {/* فیلدهای پرونده — فقط برای نیچ‌های جنریک واقعا مصرف می‌شود (پنل ثبت اطلاعات مشتری) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-soot">فیلدهای پرونده‌ی مشتری</label>
          <button onClick={addRecordField} className="text-xs text-ink underline">+ افزودن فیلد</button>
        </div>
        <p className="text-[11px] text-soot mb-2">این فیلدها در پنل «پرونده‌ی مشتری» برای نیچ‌های جنریک نمایش داده می‌شوند. برای روانشناسی بی‌اثرند (فرم رزرو خودش را دارد).</p>
        <div className="space-y-2">
          {f.record_fields.map((rf, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-center border border-sand rounded-xl p-2">
              <input placeholder="key" dir="ltr" className="w-28 border border-sand rounded-lg px-2 py-1.5 text-xs"
                value={rf.key} onChange={e => updateRecordField(i, { key: e.target.value })} />
              <input placeholder="برچسب" className="flex-1 min-w-[100px] border border-sand rounded-lg px-2 py-1.5 text-xs"
                value={rf.label} onChange={e => updateRecordField(i, { label: e.target.value })} />
              <select className="border border-sand rounded-lg px-2 py-1.5 text-xs bg-white" value={rf.type}
                onChange={e => updateRecordField(i, { type: e.target.value })}>
                <option value="text">متن</option>
                <option value="textarea">متن بلند</option>
                <option value="number">عدد</option>
                <option value="select">تک‌گزینه‌ای</option>
              </select>
              {rf.type === 'select' && (
                <input placeholder="گزینه‌ها با کاما" className="flex-1 min-w-[120px] border border-sand rounded-lg px-2 py-1.5 text-xs"
                  value={rf.options} onChange={e => updateRecordField(i, { options: e.target.value })} />
              )}
              <button onClick={() => removeRecordField(i)} className="text-xs text-red-600 shrink-0">حذف</button>
            </div>
          ))}
        </div>
      </div>

      {/* سرویس‌های نمونه */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-soot">سرویس‌های نمونه (هنگام ساخت tenant تازه ساخته می‌شوند)</label>
          <button onClick={addSampleService} className="text-xs text-ink underline">+ افزودن سرویس</button>
        </div>
        <div className="space-y-2">
          {f.sample_services.map((sv, i) => (
            <div key={i} className="flex flex-wrap gap-2 items-center border border-sand rounded-xl p-2">
              <input placeholder="نام سرویس" className="flex-1 min-w-[120px] border border-sand rounded-lg px-2 py-1.5 text-xs"
                value={sv.name} onChange={e => updateSampleService(i, { name: e.target.value })} />
              <input type="number" placeholder="دقیقه" className="w-20 border border-sand rounded-lg px-2 py-1.5 text-xs tnum"
                value={sv.duration_minutes} onChange={e => updateSampleService(i, { duration_minutes: Number(e.target.value) || 60 })} />
              <input type="number" placeholder="قیمت (تومان)" className="w-28 border border-sand rounded-lg px-2 py-1.5 text-xs tnum"
                value={sv.price} onChange={e => updateSampleService(i, { price: Number(e.target.value) || 0 })} />
              <select className="border border-sand rounded-lg px-2 py-1.5 text-xs bg-white" value={sv.mode}
                onChange={e => updateSampleService(i, { mode: e.target.value })}>
                <option value="both">آنلاین/حضوری</option>
                <option value="online">فقط آنلاین</option>
                <option value="in_person">فقط حضوری</option>
              </select>
              <button onClick={() => removeSampleService(i)} className="text-xs text-red-600 shrink-0">حذف</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-soot mb-1">ماژول‌های پیش‌فرض (کلیدها با کاما)</label>
        <input dir="ltr" className="w-full border border-sand rounded-xl px-3 py-2 text-sm"
          value={f.default_features} onChange={e => setF(s => ({ ...s, default_features: e.target.value }))} />
        <p className="text-[11px] text-soot mt-1">فقط کلیدهایی که خود کد می‌شناسد اثر دارند (مثلا برای روانشناسی: patient_buy_extra_session, patient_self_cancel). برای نیچ تازه، این فقط بایگانی می‌شود تا وقتی کد مربوطه نوشته شود.</p>
      </div>

      <div className="flex gap-2 pt-2 border-t border-sand">
        <button onClick={save} disabled={saving} className="bg-ink text-white rounded-xl px-5 py-2 text-sm font-medium disabled:opacity-50">
          {saving ? 'در حال ذخیره…' : isNew ? 'ساخت نیچ' : 'ذخیره‌ی تغییرات'}
        </button>
        <button onClick={onCancel} className="text-sm border border-sand rounded-xl px-4 py-2 text-ink">انصراف</button>
      </div>
    </div>
  )
}

function NichesInner() {
  const dialog = useDialog()
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [niches, setNiches] = useState<Niche[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null) // null=بسته، ''=فرم ساخت تازه
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/super/niches', { cache: 'no-store' })
    if (res.status === 401) { setAuthed(false); setLoading(false); return }
    const d = await res.json().catch(() => ({}))
    setNiches(d.niches || [])
    setAuthed(true)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (authed === false) router.replace('/super') }, [authed, router])

  async function toggleActive(n: Niche) {
    setBusyKey(n.key)
    await fetch('/api/super/niches', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: n.key, is_active: !n.is_active }),
    })
    setBusyKey(null)
    load()
  }

  async function remove(n: Niche) {
    if (n.tenant_count > 0) {
      await dialog.uiAlert(`${n.tenant_count} متخصص از این نیچ استفاده می‌کنند — اول غیرفعالش کن، حذف کامل ممکن نیست.`)
      return
    }
    const ok = await dialog.uiConfirm(`نیچ «${n.display_name}» کاملا حذف شود؟`)
    if (!ok) return
    setBusyKey(n.key)
    const res = await fetch(`/api/super/niches?key=${encodeURIComponent(n.key)}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    setBusyKey(null)
    if (!res.ok) { await dialog.uiAlert(d.error || 'حذف ناموفق بود'); return }
    load()
  }

  if (authed === null || loading) {
    return <main className="min-h-screen grid place-items-center text-soot">در حال بارگذاری…</main>
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header>
        <a href="/super" className="text-xs text-soot underline">← بازگشت به لیست متخصص‌ها</a>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-xl font-bold text-ink">مدیریت نیچ‌های {PLATFORM_NAME}</h1>
          {editingKey === null && (
            <button onClick={() => setEditingKey('')} className="bg-ink text-white rounded-xl px-4 py-2 text-sm font-medium">
              + نیچ تازه
            </button>
          )}
        </div>
      </header>

      {editingKey === '' && (
        <NicheEditor initial={EMPTY_FORM} onCancel={() => setEditingKey(null)} onSaved={() => { setEditingKey(null); load() }} />
      )}

      <section className="space-y-3">
        {niches.map(n => (
          <div key={n.key}>
            {editingKey === n.key ? (
              <NicheEditor initial={nicheToForm(n)} onCancel={() => setEditingKey(null)} onSaved={() => { setEditingKey(null); load() }} />
            ) : (
              <div className="bg-white border border-sand rounded-2xl p-4 flex flex-wrap items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg shrink-0"
                  style={{ backgroundColor: `rgb(${n.default_theme})` }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-ink">{n.display_name}</span>
                    <span dir="ltr" className="text-xs text-soot">{n.key}</span>
                    {!n.is_active && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sand text-soot">غیرفعال</span>}
                  </div>
                  <div className="text-xs text-soot mt-1 flex items-center gap-3 flex-wrap">
                    <span>{n.tagline || '—'}</span>
                    <span className="tnum">{n.tenant_count} متخصص</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setEditingKey(n.key)} className="text-xs border border-sand rounded-xl px-3 py-1.5 text-ink">
                    ویرایش
                  </button>
                  <button onClick={() => toggleActive(n)} disabled={busyKey === n.key}
                    className="text-xs border border-sand rounded-xl px-3 py-1.5 text-ink disabled:opacity-50">
                    {n.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                  </button>
                  <button onClick={() => remove(n)} disabled={busyKey === n.key}
                    className="text-xs border border-red-200 text-red-700 rounded-xl px-3 py-1.5 disabled:opacity-50">
                    حذف
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </main>
  )
}

export default function NichesPage() {
  return (
    <DialogProvider>
      <NichesInner />
    </DialogProvider>
  )
}
