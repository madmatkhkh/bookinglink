'use client'
import { useState, useEffect, useCallback } from 'react'
import { toLatinNum } from '@/lib/calendar'
import { uiAlert, uiConfirm } from '@/components/ui/Dialog'

// در پنل ادمین همه‌ی ارقام لاتین نمایش داده می‌شوند (همان تعریف والد).
const toFarsiNum = (n: number | string) => toLatinNum(String(n))

// ─── کدهای تخفیف — کامپوننت مستقل (نه nested) تا با ری‌رندرهای پنل اصلی
// state‌ش (لیست کد/فرم) پاک نشود ──────────────────────────────────────────────
type DiscountCode = {
  id: string; code: string; discount_type: string; discount_value: number
  is_active: boolean; max_uses: number | null; used_count: number; expires_at: string | null
}

export default function DiscountCodesSection({ slug, isOwner, viewingResourceId }: { slug: string; isOwner: boolean; viewingResourceId: string }) {
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', discount_type: 'percent', discount_value: '', max_uses: '' })
  const [saving, setSaving] = useState(false)

  const url = (extra?: string) => {
    const qs = isOwner && viewingResourceId ? `?resource_id=${viewingResourceId}${extra ? '&' + extra : ''}` : (extra ? `?${extra}` : '')
    return `/api/t/${slug}/panel/psy/discount-codes${qs}`
  }

  const load = useCallback(async () => {
    const res = await fetch(url(), { cache: 'no-store' })
    const d = await res.json().catch(() => ({}))
    setCodes(d.codes || [])
    setLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, isOwner, viewingResourceId])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.code.trim() || !form.discount_value) { await uiAlert('کد و مقدار تخفیف را وارد کن'); return }
    setSaving(true)
    const res = await fetch(url(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: form.code, discount_type: form.discount_type, discount_value: Number(form.discount_value),
        max_uses: form.max_uses ? Number(form.max_uses) : null,
      }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { await uiAlert(d.error || 'ثبت کد ناموفق بود'); return }
    setForm({ code: '', discount_type: 'percent', discount_value: '', max_uses: '' })
    setShowForm(false)
    load()
  }

  async function toggle(c: DiscountCode) {
    await fetch(url(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, is_active: !c.is_active }) })
    load()
  }

  async function remove(c: DiscountCode) {
    if (!await uiConfirm(`کد «${c.code}» حذف شود؟`)) return
    await fetch(url(), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id }) })
    load()
  }

  return (
    <section className="bg-white rounded-2xl border border-sand p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-display font-semibold text-ink">کدهای تخفیف</h2>
        {!showForm && <button onClick={() => setShowForm(true)} className="text-xs text-ink underline">+ کد تازه</button>}
      </div>
      <p className="text-xs text-soot mb-4">اختیاری — اگر خواستی به بعضی مراجعان تخفیف بدهی، یک کد بساز و به آن‌ها بگو موقع پرداخت وارد کنند.</p>

      {showForm && (
        <div className="border border-sand rounded-xl p-3 mb-3 space-y-3">
          <div>
            <label className="text-xs text-soot mb-1 block">کد</label>
            <input dir="ltr" value={form.code} onChange={e => setForm(s => ({ ...s, code: e.target.value.toUpperCase() }))}
              placeholder="SUMMER10" className="w-36 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <label className="text-xs text-soot mb-1 block">نوع</label>
              <select value={form.discount_type} onChange={e => setForm(s => ({ ...s, discount_type: e.target.value }))}
                className="w-32 text-sm px-3 py-2 border border-sand rounded-lg bg-white">
                <option value="percent">درصدی</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-soot mb-1 block">{form.discount_type === 'percent' ? 'درصد' : 'مبلغ (تومان)'}</label>
              <input type="number" value={form.discount_value} onChange={e => setForm(s => ({ ...s, discount_value: e.target.value }))}
                placeholder={form.discount_type === 'percent' ? '20' : '100000'}
                className="w-24 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
            </div>
            <div>
              <label className="text-xs text-soot mb-1 block">سقف استفاده</label>
              <input type="number" value={form.max_uses} onChange={e => setForm(s => ({ ...s, max_uses: e.target.value }))}
                placeholder="نامحدود" className="w-24 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="px-5 py-2 bg-ink text-white rounded-lg text-xs font-medium disabled:opacity-50">
              {saving ? '...' : 'ساخت کد'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-sand rounded-lg text-xs text-soot">انصراف</button>
          </div>
        </div>
      )}

      {!loaded ? (
        <p className="text-xs text-soot text-center py-3">در حال بارگذاری…</p>
      ) : codes.length === 0 ? (
        <p className="text-xs text-soot text-center py-3">هنوز کدی نساخته‌ای.</p>
      ) : (
        <div className="space-y-2">
          {codes.map(c => (
            <div key={c.id} className="flex items-center justify-between text-sm p-2.5 border border-sand rounded-xl">
              <div>
                <span dir="ltr" className={`font-bold tnum ${!c.is_active ? 'text-soot line-through' : 'text-ink'}`}>{c.code}</span>
                <span className="text-xs text-soot mr-2">
                  {c.discount_type === 'percent' ? `${toFarsiNum(c.discount_value)}٪` : `${toFarsiNum(c.discount_value.toLocaleString('en-US'))} ت`}
                  {' · '}{toFarsiNum(c.used_count)}{c.max_uses ? `/${toFarsiNum(c.max_uses)}` : ''} استفاده
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => toggle(c)} className="text-[11px] text-soot underline">{c.is_active ? 'غیرفعال' : 'فعال'}</button>
                <button onClick={() => remove(c)} className="text-[11px] text-red-600 underline">حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
