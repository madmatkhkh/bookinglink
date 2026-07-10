'use client'
// ─────────────────────────────────────────────────────────────────────────────
// پنل جنریک (نیچ‌های غیرروانشناسی مثل سالن) — سرویس‌محور، چندمنبعی.
// از روت‌های عمومی /panel/* استفاده می‌کند (نه psy). این پنل فعلا تک‌کاربره
// است (فقط owner لاگین می‌کند — panel/login همیشه به owner_phone پیامک می‌زند)؛
// staff-login زیرساخت آینده است، هنوز به هیچ‌کدام از این روت‌ها وصل نشده.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { useResendCooldown } from '@/lib/useResendCooldown'
import { toFarsiNum, toLatinNum, PERSIAN_MONTHS, PERSIAN_WEEKDAYS_FULL, getCurrentJalali } from '@/lib/calendar'
import { BOOKING_STATUS_LABEL, MODE_LABEL } from '@/lib/config'

type Service = {
  id: string; name: string; duration_minutes: number; price: number
  mode: string; description: string; is_active: boolean; sort_order: number
}
type Resource = {
  id: string; name: string; title: string; avatar_url: string | null
  is_active: boolean; is_selectable: boolean; sort_order: number; phone: string | null
}
type WeeklyRow = { id?: string; weekday: number; start_time: string; end_time: string; mode: string }
type Override = { id: string; resource_id: string; date: string; type: string }
type Booking = {
  id: string; booking_date: string; booking_time: string; booking_ts: number
  client_name: string; client_phone: string; status: string; payment_ref: string | null
  price_snapshot: number; client_note: string; resource_id?: string
  services?: { name: string; mode: string; duration_minutes: number }
  resources?: { name: string }
}
type Overview = {
  slug: string; niche_key: string
  labels: { client: string; resource: string; booking: string }
  profile: any; services: Service[]; resources: Resource[]
  weekly: WeeklyRow[]; overrides: Override[]; pending: Booking[]; upcoming: Booking[]
}

const money = (n: number) => (n || 0).toLocaleString('en-US')

function GenericPanel() {
  const { slug } = useParams<{ slug: string }>()
  const { uiAlert, uiConfirm } = useDialog()
  const [ov, setOv] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [tab, setTab] = useState<'bookings' | 'services' | 'schedule' | 'clients' | 'settings'>('bookings')

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
  const pendingCount = (ov.pending || []).length

  return (
    <main className="min-h-screen bg-paper pb-24" dir="rtl">
      <div className="bg-accent" style={{ ['--brand' as any]: ov.profile?.theme_color || '212 83 126' }}>
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between text-white">
          <div>
            <div className="font-bold">{ov.profile?.display_name || 'پنل مدیریت'}</div>
            <div className="text-xs opacity-80">/{slug}</div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 pt-5" style={{ ['--brand' as any]: ov.profile?.theme_color || '212 83 126' }}>
        {tab === 'bookings' && <BookingsTab ov={ov} L={L} slug={slug} reload={load} uiAlert={uiAlert} uiConfirm={uiConfirm} />}
        {tab === 'services' && <ServicesTab ov={ov} slug={slug} reload={load} uiAlert={uiAlert} uiConfirm={uiConfirm} />}
        {tab === 'schedule' && <ScheduleTab ov={ov} slug={slug} reload={load} uiAlert={uiAlert} uiConfirm={uiConfirm} L={L} />}
        {tab === 'clients' && <ClientsTab slug={slug} uiAlert={uiAlert} L={L} />}
        {tab === 'settings' && <SettingsTab ov={ov} slug={slug} reload={load} uiAlert={uiAlert} uiConfirm={uiConfirm} L={L} />}
      </div>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-sand z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          {([
            ['bookings', '📋', `${L.booking}‌ها`, pendingCount],
            ['services', '🧾', 'سرویس‌ها', 0],
            ['schedule', '📅', 'برنامه', 0],
            ['clients', '👥', L.client, 0],
            ['settings', '⚙️', 'تنظیمات', 0],
          ] as [typeof tab, string, string, number][]).map(([k, icon, label, badge]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`relative py-2.5 flex flex-col items-center gap-0.5 text-[11px] ${tab === k ? 'text-ink font-bold' : 'text-soot'}`}>
              <span className="relative text-lg leading-none">
                {icon}
                {badge > 0 && (
                  <span className="absolute -top-1.5 -left-2 min-w-[16px] h-4 px-1 bg-accent text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                    {toFarsiNum(badge)}
                  </span>
                )}
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// تب رزروها — منتظر تأیید بالا (چون فوری‌ترین کار روزانه است)، بعد پیش‌رو
// ─────────────────────────────────────────────────────────────────────────────
function BookingsTab({ ov, L, slug, reload, uiAlert, uiConfirm }: any) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const pending: Booking[] = ov.pending || []
  const pendingIds = new Set(pending.map(b => b.id))
  const upcoming: Booking[] = (ov.upcoming || []).filter((b: Booking) => !pendingIds.has(b.id))

  async function act(id: string, action: string, confirmMsg?: string) {
    if (confirmMsg && !await uiConfirm(confirmMsg)) return
    setBusyId(id)
    const res = await fetch(`/api/t/${slug}/panel/bookings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    setBusyId(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); await uiAlert(d.error || 'خطا در ثبت'); return }
    reload()
  }

  function BookingCard({ b, actions }: { b: Booking; actions: React.ReactNode }) {
    return (
      <div className="rounded-2xl border border-sand bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold">{b.client_name}</div>
            <div className="mt-1 text-xs text-soot" dir="ltr">{b.client_phone}</div>
            <div className="mt-1.5 text-xs text-soot">
              {b.services?.name} · {toFarsiNum(b.booking_date)} · <span className="tnum">{toFarsiNum(b.booking_time)}</span>
              {b.resources?.name ? ` · ${b.resources.name}` : ''}
            </div>
            {b.client_note && <div className="mt-1.5 text-xs text-ink bg-sand/60 rounded-lg px-2 py-1">{b.client_note}</div>}
            {b.payment_ref && <div className="mt-1 text-[11px] text-soot">پیگیری پرداخت: <span dir="ltr">{b.payment_ref}</span></div>}
          </div>
          <div className="text-left shrink-0">
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-sand text-soot block mb-1">{BOOKING_STATUS_LABEL[b.status] || b.status}</span>
            {b.price_snapshot > 0 && <div className="text-xs font-bold tnum">{money(b.price_snapshot)} ت</div>}
          </div>
        </div>
        {actions && <div className="flex gap-2 mt-3 pt-3 border-t border-sand">{actions}</div>}
      </div>
    )
  }

  const ActionBtn = ({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) => (
    <button onClick={onClick} disabled={busyId !== null}
      className={`flex-1 text-xs py-2 rounded-lg font-medium disabled:opacity-50 ${danger ? 'bg-red-50 text-red-700' : 'bg-accent text-white'}`}>
      {label}
    </button>
  )

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-ink mb-2">منتظر تأیید پرداخت {pending.length > 0 && `(${toFarsiNum(pending.length)})`}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-soot bg-white rounded-2xl border border-sand p-5 text-center">چیزی منتظر تأیید نیست.</p>
        ) : (
          <div className="space-y-3">
            {pending.map(b => (
              <BookingCard key={b.id} b={b} actions={
                <>
                  <ActionBtn label="تأیید پرداخت" onClick={() => act(b.id, 'confirm')} />
                  <ActionBtn label="رد پرداخت" danger onClick={() => act(b.id, 'reject', 'پرداخت رد شود؟ مراجع دوباره باید واریز کند.')} />
                </>
              } />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-bold text-ink mb-2">برنامه‌ی پیش‌رو</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-soot bg-white rounded-2xl border border-sand p-5 text-center">هنوز {L.booking}ی ثبت نشده.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map(b => (
              <BookingCard key={b.id} b={b} actions={
                b.status === 'confirmed' ? (
                  <>
                    <ActionBtn label="برگزار شد" onClick={() => act(b.id, 'complete')} />
                    <ActionBtn label="حاضر نشد" danger onClick={() => act(b.id, 'no_show', 'ثبت شود که مراجع حاضر نشد؟')} />
                    <ActionBtn label="لغو" danger onClick={() => act(b.id, 'cancel', `این ${L.booking} لغو شود؟`)} />
                  </>
                ) : b.status === 'pending_payment' ? (
                  <ActionBtn label="لغو" danger onClick={() => act(b.id, 'cancel', `این ${L.booking} لغو شود؟`)} />
                ) : null
              } />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// تب سرویس‌ها — CRUD کامل
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_SERVICE = { id: '', name: '', duration_minutes: 60, price: 0, mode: 'in_person', description: '', is_active: true, sort_order: 0 }

function ServicesTab({ ov, slug, reload, uiAlert, uiConfirm }: any) {
  const [editing, setEditing] = useState<string | null>(null) // null=بسته، ''=فرم تازه
  const [form, setForm] = useState<typeof EMPTY_SERVICE>(EMPTY_SERVICE)
  const [saving, setSaving] = useState(false)
  const all: Service[] = ov.services || []

  function openNew() { setForm(EMPTY_SERVICE); setEditing('') }
  function openEdit(s: Service) { setForm({ ...s }); setEditing(s.id) }

  async function save() {
    if (!form.name.trim()) { await uiAlert('نام سرویس لازم است'); return }
    setSaving(true)
    const isNew = editing === ''
    const res = await fetch(`/api/t/${slug}/panel/services`, {
      method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isNew ? form : { ...form, id: editing }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); await uiAlert(d.error || 'ذخیره ناموفق بود'); return }
    setEditing(null); reload()
  }

  async function toggleActive(s: Service) {
    await fetch(`/api/t/${slug}/panel/services`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...s, is_active: !s.is_active }),
    })
    reload()
  }

  async function remove(s: Service) {
    if (!await uiConfirm(`سرویس «${s.name}» غیرفعال شود؟ رزروهای قبلی‌اش دست‌نخورده می‌مانند.`)) return
    await fetch(`/api/t/${slug}/panel/services`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) })
    reload()
  }

  return (
    <div className="space-y-3">
      {editing === null && (
        <button onClick={openNew} className="w-full py-2.5 rounded-xl border-2 border-dashed border-sand text-soot text-sm hover:border-accent hover:text-accent transition-colors">
          + افزودن سرویس تازه
        </button>
      )}

      {editing !== null && (
        <div className="rounded-2xl border border-sand bg-white p-4 space-y-3">
          <input value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
            placeholder="نام سرویس" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-soot block mb-1">مدت (دقیقه)</label>
              <input type="number" value={form.duration_minutes}
                onChange={e => setForm(s => ({ ...s, duration_minutes: parseInt(toLatinNum(e.target.value)) || 60 }))}
                className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum" />
            </div>
            <div>
              <label className="text-[11px] text-soot block mb-1">قیمت (تومان)</label>
              <input type="number" value={form.price}
                onChange={e => setForm(s => ({ ...s, price: parseInt(toLatinNum(e.target.value)) || 0 }))}
                className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-soot block mb-1">حالت</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['online', 'in_person', 'both'] as const).map(m => (
                <button key={m} onClick={() => setForm(s => ({ ...s, mode: m }))}
                  className={`py-2 rounded-lg text-xs font-medium ${form.mode === m ? 'bg-accent text-white' : 'bg-gray-100 text-soot'}`}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <textarea value={form.description} onChange={e => setForm(s => ({ ...s, description: e.target.value }))}
            placeholder="توضیح کوتاه (اختیاری)" rows={2}
            className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none" />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {saving ? 'در حال ذخیره…' : editing === '' ? 'ساخت سرویس' : 'ذخیره‌ی تغییرات'}
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2.5 border border-sand rounded-xl text-sm text-soot">انصراف</button>
          </div>
        </div>
      )}

      {all.length === 0 && editing === null && (
        <div className="text-sm text-soot bg-white rounded-2xl border border-sand p-6 text-center">هنوز سرویسی نیست.</div>
      )}
      {all.map(s => (
        <div key={s.id} className="rounded-2xl border border-sand bg-white p-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm ${!s.is_active ? 'text-soot line-through' : ''}`}>{s.name}</span>
              {!s.is_active && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sand text-soot shrink-0">غیرفعال</span>}
            </div>
            <div className="mt-1 text-xs text-soot">{toFarsiNum(s.duration_minutes)} دقیقه · {MODE_LABEL[s.mode] || s.mode}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-left">
              <div className="font-extrabold tnum text-sm">{money(s.price)}</div>
              <div className="text-[10px] text-soot">تومان</div>
            </div>
            <div className="flex flex-col gap-1">
              <button onClick={() => openEdit(s)} className="text-[11px] text-ink underline">ویرایش</button>
              <button onClick={() => toggleActive(s)} className="text-[11px] text-soot underline">{s.is_active ? 'غیرفعال' : 'فعال'}</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// تب برنامه — ساعات هفتگی تکرارشونده + روزهای تعطیل، per-resource
// ─────────────────────────────────────────────────────────────────────────────
function ScheduleTab({ ov, slug, reload, uiAlert, uiConfirm, L }: any) {
  const resources: Resource[] = (ov.resources || []).filter((r: Resource) => r.is_active)
  const [resourceId, setResourceId] = useState(resources[0]?.id || '')
  const [rows, setRows] = useState<WeeklyRow[]>([])
  const [saving, setSaving] = useState(false)
  const [closeDate, setCloseDate] = useState(() => { const t = getCurrentJalali(); return { y: t.year, m: t.month + 1, d: t.day } })

  useEffect(() => {
    setRows((ov.weekly || []).filter((w: WeeklyRow & { resource_id?: string }) => (w as any).resource_id === resourceId)
      .map((w: WeeklyRow) => ({ ...w })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, ov.weekly])

  const overrides: Override[] = (ov.overrides || []).filter((o: Override) => o.resource_id === resourceId)

  function addRow() {
    setRows(r => [...r, { weekday: 0, start_time: '09:00', end_time: '17:00', mode: 'both' }])
  }
  function updateRow(i: number, patch: Partial<WeeklyRow>) {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row))
  }
  function removeRow(i: number) {
    setRows(r => r.filter((_, idx) => idx !== i))
  }

  async function saveWeekly() {
    if (!resourceId) return
    setSaving(true)
    const res = await fetch(`/api/t/${slug}/panel/schedule`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: resourceId, weekly: rows }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); await uiAlert(d.error || 'ذخیره ناموفق بود'); return }
    reload()
  }

  async function addClosedDay() {
    const date = `${closeDate.y}/${String(closeDate.m).padStart(2, '0')}/${String(closeDate.d).padStart(2, '0')}`
    const res = await fetch(`/api/t/${slug}/panel/schedule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: resourceId, date }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); await uiAlert(d.error || 'ثبت ناموفق بود'); return }
    reload()
  }

  async function removeOverride(id: string) {
    if (!await uiConfirm('این روز تعطیل حذف شود؟')) return
    await fetch(`/api/t/${slug}/panel/schedule`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    reload()
  }

  if (resources.length === 0) {
    return <div className="text-sm text-soot bg-white rounded-2xl border border-sand p-6 text-center">اول یک {L.resource} فعال بساز (تب تنظیمات).</div>
  }

  return (
    <div className="space-y-5">
      {resources.length > 1 && (
        <select value={resourceId} onChange={e => setResourceId(e.target.value)}
          className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl bg-white">
          {resources.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}

      <div className="rounded-2xl border border-sand bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-ink">ساعات کاری هفتگی</h2>
          <button onClick={addRow} className="text-xs text-accent font-medium">+ افزودن بازه</button>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-soot text-center py-4">هنوز بازه‌ای تعریف نشده — یعنی این {L.resource} هیچ زمان آزادی برای رزرو ندارد.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5 p-2 border border-sand rounded-xl">
                <select value={row.weekday} onChange={e => updateRow(i, { weekday: parseInt(e.target.value) })}
                  className="text-xs border border-sand rounded-lg px-2 py-1.5 bg-white">
                  {PERSIAN_WEEKDAYS_FULL.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                </select>
                <input type="time" value={row.start_time} onChange={e => updateRow(i, { start_time: e.target.value })}
                  className="text-xs border border-sand rounded-lg px-2 py-1.5 tnum" dir="ltr" />
                <span className="text-xs text-soot">تا</span>
                <input type="time" value={row.end_time} onChange={e => updateRow(i, { end_time: e.target.value })}
                  className="text-xs border border-sand rounded-lg px-2 py-1.5 tnum" dir="ltr" />
                <select value={row.mode} onChange={e => updateRow(i, { mode: e.target.value })}
                  className="text-xs border border-sand rounded-lg px-2 py-1.5 bg-white">
                  <option value="both">هردو</option>
                  <option value="online">آنلاین</option>
                  <option value="in_person">حضوری</option>
                </select>
                <button onClick={() => removeRow(i)} className="text-xs text-red-600 mr-auto">حذف</button>
              </div>
            ))}
          </div>
        )}
        <button onClick={saveWeekly} disabled={saving}
          className="w-full mt-3 py-2.5 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {saving ? 'در حال ذخیره…' : 'ذخیره‌ی ساعات هفتگی'}
        </button>
      </div>

      <div className="rounded-2xl border border-sand bg-white p-4">
        <h2 className="text-sm font-bold text-ink mb-3">روزهای تعطیل استثنا</h2>
        <div className="flex items-center gap-1.5 mb-3">
          <select value={closeDate.d} onChange={e => setCloseDate(s => ({ ...s, d: parseInt(e.target.value) }))}
            className="text-xs border border-sand rounded-lg px-2 py-1.5 bg-white">
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{toFarsiNum(d)}</option>)}
          </select>
          <select value={closeDate.m} onChange={e => setCloseDate(s => ({ ...s, m: parseInt(e.target.value) }))}
            className="text-xs border border-sand rounded-lg px-2 py-1.5 bg-white">
            {PERSIAN_MONTHS.map((mn, idx) => <option key={idx} value={idx + 1}>{mn}</option>)}
          </select>
          <select value={closeDate.y} onChange={e => setCloseDate(s => ({ ...s, y: parseInt(e.target.value) }))}
            className="text-xs border border-sand rounded-lg px-2 py-1.5 bg-white tnum">
            {Array.from({ length: 3 }, (_, i) => getCurrentJalali().year + i).map(y => <option key={y} value={y}>{toFarsiNum(y)}</option>)}
          </select>
          <button onClick={addClosedDay} className="mr-auto text-xs px-3 py-1.5 bg-accent text-white rounded-lg font-medium">+ تعطیل کن</button>
        </div>
        {overrides.length === 0 ? (
          <p className="text-xs text-soot text-center py-2">تعطیلی استثنایی ثبت نشده.</p>
        ) : (
          <div className="space-y-1.5">
            {overrides.map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs bg-sand/60 rounded-lg px-3 py-2">
                <span className="tnum">{toFarsiNum(o.date)}</span>
                <button onClick={() => removeOverride(o.id)} className="text-red-600">حذف</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// تب مشتریان — جست‌وجو با شماره، پرونده‌ی سفارشی نیچ + تاریخچه‌ی نوبت‌ها
// ─────────────────────────────────────────────────────────────────────────────
function ClientsTab({ slug, uiAlert, L }: any) {
  const [phone, setPhone] = useState('')
  const [searched, setSearched] = useState(false)
  const [fields, setFields] = useState<any[]>([])
  const [record, setRecord] = useState<{ client_name: string; data: Record<string, any> } | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [name, setName] = useState('')
  const [data, setData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function search() {
    const p = toLatinNum(phone).trim()
    if (!/^09\d{9}$/.test(p)) { await uiAlert('شماره‌ی موبایل معتبر وارد کن'); return }
    setLoading(true)
    const res = await fetch(`/api/t/${slug}/panel/records?phone=${encodeURIComponent(p)}`, { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    setFields(d.fields || [])
    setRecord(d.record || null)
    setHistory(d.history || [])
    setName(d.record?.client_name || '')
    setData(d.record?.data || {})
    setSearched(true)
    setLoading(false)
  }

  async function save() {
    const p = toLatinNum(phone).trim()
    setSaving(true)
    const res = await fetch(`/api/t/${slug}/panel/records`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: p, name, data }),
    })
    setSaving(false)
    if (!res.ok) { await uiAlert('ذخیره ناموفق بود'); return }
    await search()
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          dir="ltr" inputMode="numeric" placeholder="09xxxxxxxxx"
          className="flex-1 text-sm px-3 py-2.5 border border-sand rounded-xl tnum" />
        <button onClick={search} disabled={loading} className="px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {loading ? '...' : 'جست‌وجو'}
        </button>
      </div>

      {searched && (
        <>
          <div className="rounded-2xl border border-sand bg-white p-4 space-y-3">
            <h2 className="text-sm font-bold text-ink">{record ? 'پرونده‌ی مشتری' : `${L.client} تازه`}</h2>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="نام" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
            {fields.map((f: any) => (
              <div key={f.key}>
                <label className="text-[11px] text-soot block mb-1">{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea value={data[f.key] || ''} onChange={e => setData(s => ({ ...s, [f.key]: e.target.value }))}
                    rows={2} className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none" />
                ) : f.type === 'select' ? (
                  <select value={data[f.key] || ''} onChange={e => setData(s => ({ ...s, [f.key]: e.target.value }))}
                    className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white">
                    <option value="">—</option>
                    {(f.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type === 'number' ? 'number' : 'text'} value={data[f.key] || ''}
                    onChange={e => setData(s => ({ ...s, [f.key]: e.target.value }))}
                    className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
                )}
              </div>
            ))}
            <button onClick={save} disabled={saving} className="w-full py-2.5 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {saving ? 'در حال ذخیره…' : 'ذخیره‌ی پرونده'}
            </button>
          </div>

          <div className="rounded-2xl border border-sand bg-white p-4">
            <h2 className="text-sm font-bold text-ink mb-2">تاریخچه‌ی {L.booking}‌ها</h2>
            {history.length === 0 ? (
              <p className="text-xs text-soot text-center py-3">هنوز {L.booking}ی ثبت نشده.</p>
            ) : (
              <div className="space-y-1.5">
                {history.map((h: any) => (
                  <div key={h.id} className="flex items-center justify-between text-xs py-1.5 border-b border-sand last:border-0">
                    <span>{h.services?.name}</span>
                    <span className="text-soot tnum">{toFarsiNum(h.booking_date)}</span>
                    <span className="text-soot">{BOOKING_STATUS_LABEL[h.status] || h.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// تب تنظیمات — پروفایل کسب‌وکار + مدیریت پرسنل
// ─────────────────────────────────────────────────────────────────────────────
function rgbToHex(rgb: string): string {
  const parts = String(rgb || '').trim().split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return '#d4536e'
  return '#' + parts.map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')
}
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  return `${parseInt(h.slice(0, 2), 16) || 0} ${parseInt(h.slice(2, 4), 16) || 0} ${parseInt(h.slice(4, 6), 16) || 0}`
}

function SettingsTab({ ov, slug, reload, uiAlert, uiConfirm, L }: any) {
  const p = ov.profile || {}
  const [form, setForm] = useState({
    display_name: p.display_name || '', title: p.title || '', bio: p.bio || '',
    theme_color: p.theme_color || '212 83 126', location_text: p.location_text || '',
    instagram_handle: p.instagram_handle || '', card_number: p.card_number || '', card_holder_name: p.card_holder_name || '',
  })
  const [savingProfile, setSavingProfile] = useState(false)

  async function saveProfile() {
    if (!form.display_name.trim()) { await uiAlert('نام نمایشی لازم است'); return }
    setSavingProfile(true)
    const res = await fetch(`/api/t/${slug}/panel/profile`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    setSavingProfile(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); await uiAlert(d.error || 'ذخیره ناموفق بود'); return }
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sand bg-white p-4 space-y-3">
        <h2 className="text-sm font-bold text-ink">پروفایل کسب‌وکار</h2>
        <input value={form.display_name} onChange={e => setForm(s => ({ ...s, display_name: e.target.value }))}
          placeholder="نام نمایشی" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        <input value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
          placeholder="عنوان/تخصص" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        <textarea value={form.bio} onChange={e => setForm(s => ({ ...s, bio: e.target.value }))}
          placeholder="معرفی کوتاه" rows={3} className="w-full text-sm px-3 py-2 border border-sand rounded-lg resize-none" />
        <input value={form.location_text} onChange={e => setForm(s => ({ ...s, location_text: e.target.value }))}
          placeholder="آدرس/شهر" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-soot shrink-0">@</span>
          <input value={form.instagram_handle} onChange={e => setForm(s => ({ ...s, instagram_handle: e.target.value }))}
            dir="ltr" placeholder="instagram" className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="text-[11px] text-soot block mb-1">رنگ برند</label>
            <input type="color" value={rgbToHex(form.theme_color)}
              onChange={e => setForm(s => ({ ...s, theme_color: hexToRgb(e.target.value) }))}
              className="w-12 h-10 border border-sand rounded-lg cursor-pointer" />
          </div>
          <div className="flex-1">
            <label className="text-[11px] text-soot block mb-1">مقدار خام</label>
            <input dir="ltr" value={form.theme_color} onChange={e => setForm(s => ({ ...s, theme_color: e.target.value }))}
              className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum" />
          </div>
        </div>
        <div className="pt-2 border-t border-sand">
          <p className="text-[11px] text-soot mb-2">شماره‌کارت برای دریافت پرداخت کارت‌به‌کارت</p>
          <input dir="ltr" value={form.card_number} onChange={e => setForm(s => ({ ...s, card_number: toLatinNum(e.target.value).replace(/\D/g, '').slice(0, 16) }))}
            placeholder="شماره‌ی کارت (۱۶ رقم)" className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum mb-2" />
          <input value={form.card_holder_name} onChange={e => setForm(s => ({ ...s, card_holder_name: e.target.value }))}
            placeholder="نام صاحب کارت" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
        </div>
        <button onClick={saveProfile} disabled={savingProfile} className="w-full py-2.5 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {savingProfile ? 'در حال ذخیره…' : 'ذخیره‌ی پروفایل'}
        </button>
      </div>

      <StaffSection ov={ov} slug={slug} reload={reload} uiAlert={uiAlert} uiConfirm={uiConfirm} L={L} />
    </div>
  )
}

const EMPTY_RESOURCE = { id: '', name: '', title: '', phone: '', is_active: true, is_selectable: true, sort_order: 0 }

function StaffSection({ ov, slug, reload, uiAlert, uiConfirm, L }: any) {
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<typeof EMPTY_RESOURCE>(EMPTY_RESOURCE)
  const [saving, setSaving] = useState(false)
  const all: Resource[] = ov.resources || []

  function openNew() { setForm(EMPTY_RESOURCE); setEditing('') }
  function openEdit(r: Resource) { setForm({ ...r, phone: r.phone || '' } as any); setEditing(r.id) }

  async function save() {
    if (!form.name.trim()) { await uiAlert('نام لازم است'); return }
    setSaving(true)
    const isNew = editing === ''
    const res = await fetch(`/api/t/${slug}/panel/resources`, {
      method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isNew ? form : { ...form, id: editing }),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); await uiAlert(d.error || 'ذخیره ناموفق بود'); return }
    setEditing(null); reload()
  }

  async function remove(r: Resource) {
    if (!await uiConfirm(`«${r.name}» غیرفعال شود؟`)) return
    const res = await fetch(`/api/t/${slug}/panel/resources`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id }) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); await uiAlert(d.error || 'حذف ناموفق بود'); return }
    reload()
  }

  return (
    <div className="rounded-2xl border border-sand bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">{L.resource}‌ها</h2>
        {editing === null && <button onClick={openNew} className="text-xs text-accent font-medium">+ افزودن</button>}
      </div>

      {editing !== null && (
        <div className="p-3 border border-sand rounded-xl space-y-2">
          <input value={form.name} onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
            placeholder="نام" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
          <input value={form.title} onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
            placeholder="عنوان (اختیاری)" className="w-full text-sm px-3 py-2 border border-sand rounded-lg" />
          <input value={form.phone} onChange={e => setForm(s => ({ ...s, phone: e.target.value }))}
            dir="ltr" placeholder="شماره‌ی موبایل (اختیاری)" className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum" />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex-1 py-2 bg-accent text-white rounded-lg text-xs font-medium disabled:opacity-50">
              {saving ? '...' : editing === '' ? 'افزودن' : 'ذخیره'}
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 border border-sand rounded-lg text-xs text-soot">انصراف</button>
          </div>
        </div>
      )}

      {all.map(r => (
        <div key={r.id} className="flex items-center justify-between text-sm p-2.5 border border-sand rounded-xl">
          <div>
            <span className={!r.is_active ? 'text-soot line-through' : 'text-ink'}>{r.name}</span>
            {r.title && <span className="text-xs text-soot"> — {r.title}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => openEdit(r)} className="text-[11px] text-ink underline">ویرایش</button>
            {r.is_active && <button onClick={() => remove(r)} className="text-[11px] text-red-600 underline">غیرفعال</button>}
          </div>
        </div>
      ))}
    </div>
  )
}

function GenericLogin({ slug, onSuccess }: { slug: string; onSuccess: () => void }) {
  const [sent, setSent] = useState(false)
  const [dev, setDev] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const resend = useResendCooldown()

  async function send() {
    setBusy(true); setErr('')
    const r = await fetch(`/api/t/${slug}/panel/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setErr(d.error || 'خطا'); return }
    setSent(true); setDev(d.dev_code || ''); resend.start()
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
          <p className="text-xs text-soot mt-1.5">کد ورود به موبایل صاحب پنل فرستاده می‌شود.</p>
        </div>
        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5 mb-3 text-center">{err}</div>}
        {!sent ? (
          <button onClick={send} disabled={busy} className="w-full py-3 rounded-xl bg-accent text-white font-medium disabled:opacity-50">
            {busy ? 'در حال ارسال…' : 'ارسال کد ورود'}
          </button>
        ) : (
          <div className="space-y-3">
            {dev && <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">کد تست: <strong className="text-base">{dev}</strong></div>}
            <input value={code} onChange={e => setCode(e.target.value)} dir="ltr" inputMode="numeric" autoFocus placeholder="کد 5 رقمی"
              className="w-full p-3 rounded-xl border border-sand text-lg text-center tracking-widest" />
            <button onClick={verify} disabled={busy || code.trim().length < 5} className="w-full py-3 rounded-xl bg-accent text-white font-medium disabled:opacity-40">ورود</button>
            <div className="text-center">
              {resend.canResend ? (
                <button onClick={send} disabled={busy} className="text-sm text-ink font-medium hover:underline disabled:opacity-40">ارسال دوباره‌ی کد</button>
              ) : (
                <p className="text-xs text-soot">کد نیامد؟ تا <span className="tnum font-medium text-ink">{toFarsiNum(resend.secondsLeft)}</span> ثانیه‌ی دیگر می‌توانی دوباره درخواست کنی</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function GenericAdmin() {
  return <DialogProvider><GenericPanel /></DialogProvider>
}
