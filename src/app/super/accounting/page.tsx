'use client'
// ─────────────────────────────────────────────────────────────────────────────
// حسابداری نوبت‌لینک — سه نما:
//   • بر اساس متخصص: هر متخصص چقدر گردش داشته، چقدرش سهم نوبت‌لینک، چقدرش سهم خودش
//     (کلیک روی هرکدام → دفتر حساب را فیلترشده روی همان متخصص باز می‌کند)
//   • دفتر حساب: ریز هر تراکنش (کی، کدام مراجع/متخصص، چه مبلغی، آنلاین/دستی)
//   • تسویه: بدهی پلتفرم به هر متخصص + ثبت واریز دستی
//
// واژه‌ی «متخصص» عمدا استفاده می‌شود، نه «دکتر» — پلتفرم چندنیچی است (روانشناسی،
// سالن، ...) و هر واژه‌ی مخصوص یک نیچ اینجا (که سراسر پلتفرم را نشان می‌دهد) غلط است.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { PLATFORM_NAME } from '@/lib/config'

type LedgerEntry = {
  id: string; tenant_slug: string | null; tenant_name: string | null; resource_name: string | null
  resource_id: string | null; case_number: string | null; purpose: string; method: string; direction: string
  amount: number; commission_amount: number; doctor_amount: number; session_vat_amount?: number | null
  split_applied: boolean; recorded_by: string | null; note: string | null; created_at: string
}
type Totals = { gross: number; commission: number; doctorShare: number; specialistVat: number; online: number; cardToCard: number; refunds: number }
type BySpecialist = {
  resource_id: string; resource_name: string | null; tenant_name: string | null; tenant_slug: string | null
  gross: number; commission: number; specialistShare: number; specialistVat: number; online: number; cardToCard: number; refunds: number; count: number
}
type UnsettledItem = { id: string; doctor_amount: number; case_number: string | null; bank_ref_number: string | null; created_at: string }
type SettlementSummary = {
  resource_id: string; resource_name: string | null; tenant_slug: string | null; tenant_name: string | null
  auto_settled: number; owed_gross: number; settled_manual: number; outstanding: number
  unsettled_items: UnsettledItem[]
  settlement_sheba: string | null; settlement_holder: string | null
}
type SettlementRow = { id: string; resource_name: string | null; tenant_slug: string | null; amount: number; reference: string | null; bank_ref_number: string | null; paid_at: string | null; note: string | null; created_at: string }

const PURPOSE_LABEL: Record<string, string> = {
  stage: 'جلسه', interview: 'مصاحبه', assessment: 'ارزیابی', package: 'پروتکل', session: 'جلسه', refund: 'بازپرداخت', extra_charge: 'شارژ اضافه',
}
const money = (n: number) => n.toLocaleString('en-US')

function AccountingInner() {
  const dialog = useDialog()
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'specialists' | 'ledger' | 'settlements' | 'commission'>('specialists')

  // ledger + بر اساس متخصص (از همون /api/super/accounting می‌آید)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [bySpecialist, setBySpecialist] = useState<BySpecialist[]>([])
  const [methodFilter, setMethodFilter] = useState('all')
  const [purposeFilter, setPurposeFilter] = useState('all')
  const [resourceFilter, setResourceFilter] = useState<{ id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)

  // تسویه
  const [summary, setSummary] = useState<SettlementSummary[]>([])
  const [settlements, setSettlements] = useState<SettlementRow[]>([])
  const [settleLoading, setSettleLoading] = useState(false)
  const [busyResource, setBusyResource] = useState<string | null>(null)

  // کمیسیون
  const [commGlobal, setCommGlobal] = useState<number | null>(null)
  const [commOverrides, setCommOverrides] = useState<{ resource_id: string; override: number; resource_name: string | null }[]>([])
  const [commInput, setCommInput] = useState('')
  const [commSaving, setCommSaving] = useState(false)

  const loadCommission = useCallback(async () => {
    const res = await fetch('/api/super/commission', { cache: 'no-store' })
    if (res.status === 401) { setAuthed(false); return }
    const d = await res.json().catch(() => ({}))
    setCommGlobal(typeof d.global_percent === 'number' ? d.global_percent : null)
    setCommInput(d.global_percent != null ? String(d.global_percent) : '')
    setCommOverrides(d.overrides || [])
  }, [])

  async function saveGlobalCommission() {
    const pct = Number(commInput)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { await dialog.uiAlert('درصد نامعتبر است (0 تا 100)'); return }
    setCommSaving(true)
    const res = await fetch('/api/super/commission', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ global_percent: pct }),
    })
    setCommSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); await dialog.uiAlert(d.error || 'ثبت ناموفق بود'); return }
    loadCommission()
  }

  async function setOverride(resourceId: string, resourceName: string | null) {
    const val = await dialog.uiPrompt(
      `درصد کمیسیون اختصاصی برای ${resourceName || 'این متخصص'} (0 تا 100):`,
      { required: true, okText: 'ثبت' }
    )
    if (val === null) return
    const res = await fetch('/api/super/commission', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: resourceId, override: val.trim() }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); await dialog.uiAlert(d.error || 'ثبت ناموفق بود'); return }
    loadCommission()
  }

  async function removeOverride(resourceId: string) {
    const ok = await dialog.uiConfirm('این override حذف شود؟ کمیسیون این متخصص به درصد سراسری برمی‌گردد.')
    if (!ok) return
    const res = await fetch('/api/super/commission', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: resourceId, override: null }),
    })
    if (!res.ok) { await dialog.uiAlert('حذف ناموفق بود'); return }
    loadCommission()
  }

  const loadAccounting = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (methodFilter !== 'all') p.set('method', methodFilter)
    if (purposeFilter !== 'all') p.set('purpose', purposeFilter)
    if (resourceFilter) p.set('resource_id', resourceFilter.id)
    const res = await fetch(`/api/super/accounting?${p.toString()}`, { cache: 'no-store' })
    if (res.status === 401) { setAuthed(false); setLoading(false); return }
    const d = await res.json().catch(() => ({}))
    setEntries(d.entries || [])
    setTotals(d.totals || null)
    setBySpecialist(d.byResource || [])
    setAuthed(true)
    setLoading(false)
  }, [methodFilter, purposeFilter, resourceFilter])

  const loadSettlements = useCallback(async () => {
    setSettleLoading(true)
    const res = await fetch('/api/super/settlements', { cache: 'no-store' })
    if (res.status === 401) { setAuthed(false); setSettleLoading(false); return }
    const d = await res.json().catch(() => ({}))
    setSummary(d.summary || [])
    setSettlements(d.settlements || [])
    setSettleLoading(false)
  }, [])

  useEffect(() => { loadAccounting() }, [loadAccounting])
  useEffect(() => { if (tab === 'settlements') loadSettlements() }, [tab, loadSettlements])
  useEffect(() => { if (tab === 'commission') loadCommission() }, [tab, loadCommission])
  useEffect(() => { if (authed === false) router.replace('/super') }, [authed, router])

  function viewSpecialistLedger(s: BySpecialist) {
    setResourceFilter({ id: s.resource_id, name: s.resource_name || 'متخصص' })
    setTab('ledger')
  }

  async function markSettled(s: SettlementSummary) {
    const bankRef = await dialog.uiPrompt(
      `تسویه‌ی ${money(s.outstanding)} تومان برای ${s.resource_name || 'این متخصص'}.\nشماره پیگیری بانکی واریز را وارد کنید (برای شفافیت حسابداری لازم است):`,
      { required: true, okText: 'ثبت تسویه' }
    )
    if (bankRef === null) return
    setBusyResource(s.resource_id)
    const res = await fetch('/api/super/settlements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource_id: s.resource_id,
        bank_ref_number: bankRef.trim(),
        paid_at: new Date().toISOString(),
        // همه‌ی تراکنش‌های تسویه‌نشده‌ی این متخصص را پوشش بده — مبلغ از خودشان
        // گرفته می‌شود، پس دقیقا برابر outstanding می‌شود و به تراکنش‌ها لینک می‌ماند.
        entry_ids: s.unsettled_items.map(i => i.id),
      }),
    })
    setBusyResource(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); await dialog.uiAlert(d.error || 'ثبت تسویه ناموفق بود'); return }
    loadSettlements()
  }

  if (authed === null || (loading && tab !== 'settlements')) {
    return <main className="min-h-screen grid place-items-center text-soot">در حال بارگذاری…</main>
  }

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header>
        <a href="/super" className="text-xs text-soot underline">← بازگشت به لیست متخصص‌ها</a>
        <h1 className="text-xl font-bold text-ink mt-1">حسابداری {PLATFORM_NAME}</h1>
      </header>

      <div className="flex bg-white rounded-xl border border-sand p-1 gap-1 max-w-lg">
        {([['specialists', 'بر اساس متخصص'], ['ledger', 'دفتر حساب'], ['settlements', 'تسویه'], ['commission', 'کمیسیون']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${tab === k ? 'bg-ink text-white' : 'text-soot'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ════════════════════ بر اساس متخصص ════════════════════ */}
      {tab === 'specialists' && (
        <>
          <p className="text-xs text-soot">
            هر متخصص چقدر کار کرده، چقدرش سهم {PLATFORM_NAME} بوده، چقدرش سهم خود متخصص — روی اسم هرکدام بزن تا همه‌ی تراکنش‌هایش را ببینی.
          </p>
          {bySpecialist.length === 0 ? (
            <p className="text-sm text-soot bg-white rounded-2xl border border-sand p-10 text-center">هنوز تراکنشی ثبت نشده.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-sand overflow-hidden divide-y divide-sand">
              {bySpecialist.map(s => (
                <button key={s.resource_id} onClick={() => viewSpecialistLedger(s)}
                  className="w-full text-right p-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-ink">{s.resource_name || '—'}</div>
                    <div className="text-[11px] text-soot mt-0.5">
                      {s.tenant_name || s.tenant_slug} · <span className="tnum">{s.count.toLocaleString('fa-IR-u-nu-latn')}</span> تراکنش
                    </div>
                    <div className="text-[11px] text-soot mt-1 flex items-center gap-2 flex-wrap">
                      <span>آنلاین: <strong className="text-ink tnum">{money(s.online)}</strong></span>
                      <span>·</span>
                      <span>کارت‌به‌کارت: <strong className="text-ink tnum">{money(s.cardToCard)}</strong></span>
                      {s.refunds > 0 && <><span>·</span><span className="text-red-700">بازپرداخت: {money(s.refunds)}</span></>}
                    </div>
                  </div>
                  <div className="text-left shrink-0 space-y-1">
                    <div>
                      <div className="text-[10px] text-soot">گردش کل</div>
                      <div className="text-sm font-bold text-ink tnum">{money(s.gross)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-soot">سهم {PLATFORM_NAME}</div>
                      <div className="text-xs font-medium text-emerald-700 tnum">{money(s.commission)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-soot">سهم متخصص</div>
                      <div className="text-xs font-medium text-ink tnum">{money(s.specialistShare)}</div>
                    </div>
                    {s.specialistVat > 0 && (
                     <div>
                      <div className="text-[10px] text-soot">شامل مالیات</div>
                      <div className="text-xs font-medium text-soot tnum">{money(s.specialistVat)}</div>
                     </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ════════════════════ دفتر حساب ════════════════════ */}
      {tab === 'ledger' && (
        <>
          {resourceFilter && (
            <div className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-xl px-4 py-2.5">
              <span className="text-sm text-sky-800">فیلترشده روی: <strong>{resourceFilter.name}</strong></span>
              <button onClick={() => setResourceFilter(null)} className="text-xs text-sky-700 underline">پاک‌کردن فیلتر ×</button>
            </div>
          )}

          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-sand p-4">
                <div className="text-[11px] text-soot">کل دریافتی (ناخالص)</div>
                <div className="text-lg font-bold text-ink tnum mt-1">{money(totals.gross)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-sand p-4">
                <div className="text-[11px] text-soot">کارمزد پلتفرم</div>
                <div className="text-lg font-bold text-emerald-700 tnum mt-1">{money(totals.commission)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-sand p-4">
                <div className="text-[11px] text-soot">سهم متخصص‌ها</div>
                <div className="text-lg font-bold text-ink tnum mt-1">{money(totals.doctorShare)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-sand p-4">
                <div className="text-[11px] text-soot">بازپرداخت‌ها</div>
                <div className="text-lg font-bold text-red-700 tnum mt-1">− {money(totals.refunds)}</div>
              </div>
            </div>
          )}
          {totals && (
            <div className="flex gap-3 text-xs text-soot">
              <span>آنلاین: <strong className="text-ink tnum">{money(totals.online)}</strong></span>
              <span>·</span>
              <span>کارت‌به‌کارت: <strong className="text-ink tnum">{money(totals.cardToCard)}</strong></span>
            </div>
          )}
          {/* مالیات بر ارزش افزوده‌ی خود متخصص‌ها (نه کارمزد پلتفرم) — قسمتی از
              «سهم متخصص‌ها»ی بالاست، این‌جا فقط سهم مالیاتش را جدا نشان می‌دهد.
              فقط وقتی حداقل یک متخصص مالیات را فعال کرده و چیزی جمع شده نشان
              داده می‌شود. */}
          {totals && totals.specialistVat > 0 && (
            <div className="bg-white rounded-2xl border border-sand p-4 flex items-center justify-between">
              <div className="text-xs text-soot">مالیات بر ارزش افزوده‌ی خود متخصص‌ها (جمع‌آوری‌شده از مراجعان)</div>
              <div className="text-sm font-semibold text-ink tnum">{money(totals.specialistVat)}</div>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)}
              className="border border-sand rounded-xl px-3 py-2 text-sm bg-white">
              <option value="all">همه‌ی روش‌ها</option>
              <option value="online">آنلاین</option>
              <option value="card_to_card">کارت‌به‌کارت</option>
            </select>
            <select value={purposeFilter} onChange={e => setPurposeFilter(e.target.value)}
              className="border border-sand rounded-xl px-3 py-2 text-sm bg-white">
              <option value="all">همه‌ی انواع</option>
              <option value="interview">مصاحبه</option>
              <option value="assessment">ارزیابی</option>
              <option value="package">پروتکل</option>
              <option value="session">جلسه</option>
              <option value="refund">بازپرداخت</option>
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-sand overflow-hidden">
            {entries.length === 0 ? (
              <p className="text-sm text-soot text-center py-10">تراکنشی با این فیلتر ثبت نشده.</p>
            ) : (
              <div className="divide-y divide-sand">
                {entries.map(e => (
                  <div key={e.id} className="p-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink">{PURPOSE_LABEL[e.purpose] || e.purpose}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${e.method === 'online' ? 'bg-sky-100 text-sky-700' : 'bg-sand text-soot'}`}>
                          {e.method === 'online' ? 'آنلاین' : 'کارت‌به‌کارت'}
                        </span>
                        {e.split_applied && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">تسهیم خودکار</span>}
                      </div>
                      <div className="text-[11px] text-soot mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{e.tenant_name || e.tenant_slug}</span>
                        {e.resource_name && (
                          <>
                            <span>·</span>
                            <button onClick={() => setResourceFilter({ id: e.resource_id!, name: e.resource_name! })} className="underline hover:text-ink">
                              {e.resource_name}
                            </button>
                          </>
                        )}
                        {e.case_number && <><span>·</span><span dir="ltr">{e.case_number}</span></>}
                        <span>·</span>
                        <span className="tnum">{new Date(e.created_at).toLocaleDateString('fa-IR-u-nu-latn')} {new Date(e.created_at).toLocaleTimeString('fa-IR-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className={`text-sm font-bold tnum ${e.direction === 'outflow' ? 'text-red-700' : 'text-ink'}`}>
                        {e.direction === 'outflow' ? '− ' : ''}{money(e.amount)}
                      </div>
                      {e.method === 'online' && e.commission_amount > 0 && (
                        <div className="text-[10px] text-soot tnum">کارمزد {money(e.commission_amount)}</div>
                      )}
                      {!!e.session_vat_amount && e.session_vat_amount > 0 && (
                        <div className="text-[10px] text-soot tnum">شامل {money(e.session_vat_amount)} مالیات متخصص</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-soot">دفتر حساب تغییرناپذیر است — هر ردیف سند دائمی یک تراکنش است و ویرایش/حذف نمی‌شود.</p>
        </>
      )}

      {/* ════════════════════ تسویه ════════════════════ */}
      {tab === 'settlements' && (
        <>
          {settleLoading ? (
            <p className="text-sm text-soot text-center py-10">در حال بارگذاری…</p>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-sand p-5">
                <h2 className="text-sm font-display font-bold text-ink mb-1">بدهی پلتفرم به متخصص‌ها</h2>
                <p className="text-xs text-soot mb-4">
                  سهم متخصص از پرداخت آنلاین که هنوز به او واریز نشده. با «تسویه شد» مبلغ ثبت می‌شود و از بدهی معوق کم می‌شود.
                </p>
                {summary.length === 0 ? (
                  <p className="text-sm text-soot text-center py-6">بدهی معوقی وجود ندارد.</p>
                ) : (
                  <div className="space-y-2">
                    {summary.map(s => (
                      <div key={s.resource_id} className="border border-sand rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink">{s.resource_name || '—'}</div>
                            <div className="text-[11px] text-soot">{s.tenant_name || s.tenant_slug}</div>
                          </div>
                          <div className="text-left shrink-0">
                            <div className={`text-base font-bold tnum ${s.outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{money(s.outstanding)}</div>
                            <div className="text-[10px] text-soot">تومان معوق</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-soot flex-wrap">
                          {s.auto_settled > 0 && <span>خودکار: <strong className="text-emerald-700 tnum">{money(s.auto_settled)}</strong></span>}
                          {s.settled_manual > 0 && <span>دستی‌شده: <strong className="tnum">{money(s.settled_manual)}</strong></span>}
                          {s.settlement_sheba ? (
                            <span dir="ltr" className="tnum">{s.settlement_sheba}</span>
                          ) : (
                            <span className="text-amber-700">بدون شبا</span>
                          )}
                        </div>
                        {s.outstanding > 0 && (
                          <button onClick={() => markSettled(s)} disabled={busyResource === s.resource_id}
                            className="mt-2 w-full py-2 bg-ink text-white rounded-lg text-xs font-medium disabled:opacity-50">
                            {busyResource === s.resource_id ? 'در حال ثبت…' : `تسویه شد (${money(s.outstanding)} تومان)`}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-sand p-5">
                <h2 className="text-sm font-display font-bold text-ink mb-3">تاریخچه‌ی تسویه‌ها</h2>
                {settlements.length === 0 ? (
                  <p className="text-sm text-soot text-center py-6">هنوز تسویه‌ای ثبت نشده.</p>
                ) : (
                  <div className="divide-y divide-sand">
                    {settlements.map(s => (
                      <div key={s.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <div className="text-sm text-ink">{s.resource_name || '—'} <span className="text-[11px] text-soot">({s.tenant_slug})</span></div>
                          <div className="text-[11px] text-soot">
                            {new Date(s.paid_at || s.created_at).toLocaleDateString('fa-IR-u-nu-latn')}
                            {s.bank_ref_number ? ` · پیگیری بانکی: ${s.bank_ref_number}` : s.reference ? ` · پیگیری: ${s.reference}` : ''}
                          </div>
                        </div>
                        <span className="text-sm font-medium text-ink tnum">{money(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ════════════════════ کمیسیون ════════════════════ */}
      {tab === 'commission' && (
        <>
          <div className="bg-white rounded-2xl border border-sand p-5">
            <h2 className="text-sm font-display font-bold text-ink mb-1">کمیسیون سراسری</h2>
            <p className="text-xs text-soot mb-4">
              درصدی از هر پرداخت آنلاین موفق که سهم پلتفرم است. روی پرداخت‌های تازه اعمال می‌شود (تراکنش‌های قبلی با همان درصد زمان ثبت‌شان می‌مانند). کارت‌به‌کارت کمیسیون ندارد.
            </p>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} value={commInput} onChange={e => setCommInput(e.target.value)}
                className="w-28 text-sm px-3 py-2 border border-sand rounded-lg tnum text-center focus:outline-none focus:border-ink" />
              <span className="text-sm text-soot">٪</span>
              <button onClick={saveGlobalCommission} disabled={commSaving}
                className="px-4 py-2 bg-ink text-white rounded-lg text-xs font-medium disabled:opacity-50">
                {commSaving ? 'در حال ثبت…' : 'ذخیره'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-sand p-5">
            <h2 className="text-sm font-display font-bold text-ink mb-1">کمیسیون اختصاصی متخصص‌ها</h2>
            <p className="text-xs text-soot mb-4">
              اگر برای متخصصی درصد جداگانه تعیین کنید، به‌جای درصد سراسری برای او اعمال می‌شود.
            </p>
            {commOverrides.length === 0 ? (
              <p className="text-sm text-soot text-center py-4">هیچ متخصصی درصد اختصاصی ندارد — همه از {commGlobal ?? '—'}٪ سراسری تبعیت می‌کنند.</p>
            ) : (
              <div className="divide-y divide-sand mb-4">
                {commOverrides.map(o => (
                  <div key={o.resource_id} className="py-2.5 flex items-center justify-between">
                    <span className="text-sm text-ink">{o.resource_name || o.resource_id}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setOverride(o.resource_id, o.resource_name)} className="text-sm font-medium text-ink tnum hover:underline">{o.override}٪</button>
                      <button onClick={() => removeOverride(o.resource_id)}
                        className="text-[11px] px-2 py-1 border border-red-500/30 text-red-600 rounded-md hover:bg-red-500/5">حذف</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {bySpecialist.length > 0 && (
              <div className="pt-3 border-t border-sand">
                <p className="text-[11px] text-soot mb-2">تعیین درصد اختصاصی برای یک متخصص:</p>
                <div className="flex flex-wrap gap-1.5">
                  {bySpecialist
                    .filter(sp => !commOverrides.some(o => o.resource_id === sp.resource_id))
                    .map(sp => (
                      <button key={sp.resource_id} onClick={() => setOverride(sp.resource_id, sp.resource_name)}
                        className="text-[11px] px-2.5 py-1.5 border border-sand rounded-lg text-ink hover:bg-sand">
                        + {sp.resource_name || 'متخصص'}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}

export default function AccountingPage() {
  return (
    <DialogProvider>
      <AccountingInner />
    </DialogProvider>
  )
}
