'use client'
// ─────────────────────────────────────────────────────────────────────────────
// حسابداریِ نوبت‌لینک — دو نما:
//   • دفترِ حساب (ledger): ریزِ هر تراکنش (کی، کدام مراجع/دکتر، چه مبلغی، آنلاین/دستی)
//   • تسویه‌ها (settlements): بدهیِ پلتفرم به هر دکتر + ثبتِ واریزِ دستی
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { PLATFORM_NAME } from '@/lib/config'

type LedgerEntry = {
  id: string; tenant_slug: string | null; tenant_name: string | null; resource_name: string | null
  case_number: string | null; purpose: string; method: string; direction: string
  amount: number; commission_amount: number; doctor_amount: number
  split_applied: boolean; recorded_by: string | null; note: string | null; created_at: string
}
type Totals = { gross: number; commission: number; doctorShare: number; online: number; cardToCard: number; refunds: number }
type SettlementSummary = {
  resource_id: string; resource_name: string | null; tenant_slug: string | null; tenant_name: string | null
  auto_settled: number; owed_gross: number; settled_manual: number; outstanding: number
  settlement_sheba: string | null; settlement_holder: string | null
}
type SettlementRow = { id: string; resource_name: string | null; tenant_slug: string | null; amount: number; reference: string | null; note: string | null; created_at: string }

const PURPOSE_LABEL: Record<string, string> = {
  interview: 'مصاحبه', assessment: 'ارزیابی', package: 'پروتکل', session: 'جلسه', refund: 'بازپرداخت',
}
const money = (n: number) => n.toLocaleString('en-US')

function AccountingInner() {
  const dialog = useDialog()
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'ledger' | 'settlements'>('ledger')

  // ledger
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [totals, setTotals] = useState<Totals | null>(null)
  const [methodFilter, setMethodFilter] = useState('all')
  const [purposeFilter, setPurposeFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  // settlements
  const [summary, setSummary] = useState<SettlementSummary[]>([])
  const [settlements, setSettlements] = useState<SettlementRow[]>([])
  const [settleLoading, setSettleLoading] = useState(false)
  const [busyResource, setBusyResource] = useState<string | null>(null)

  const loadLedger = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (methodFilter !== 'all') p.set('method', methodFilter)
    if (purposeFilter !== 'all') p.set('purpose', purposeFilter)
    const res = await fetch(`/api/super/accounting?${p.toString()}`, { cache: 'no-store' })
    if (res.status === 401) { setAuthed(false); setLoading(false); return }
    const d = await res.json().catch(() => ({}))
    setEntries(d.entries || [])
    setTotals(d.totals || null)
    setAuthed(true)
    setLoading(false)
  }, [methodFilter, purposeFilter])

  const loadSettlements = useCallback(async () => {
    setSettleLoading(true)
    const res = await fetch('/api/super/settlements', { cache: 'no-store' })
    if (res.status === 401) { setAuthed(false); setSettleLoading(false); return }
    const d = await res.json().catch(() => ({}))
    setSummary(d.summary || [])
    setSettlements(d.settlements || [])
    setSettleLoading(false)
  }, [])

  useEffect(() => { loadLedger() }, [loadLedger])
  useEffect(() => { if (tab === 'settlements') loadSettlements() }, [tab, loadSettlements])
  useEffect(() => { if (authed === false) router.replace('/super') }, [authed, router])

  async function markSettled(s: SettlementSummary) {
    const ok = await dialog.uiConfirm(`تسویه‌ی ${money(s.outstanding)} تومان برایِ ${s.resource_name || 'دکتر'} ثبت شود؟ این یعنی سهمِ او را به شبایش واریز کرده‌اید.`)
    if (!ok) return
    setBusyResource(s.resource_id)
    const res = await fetch('/api/super/settlements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: s.resource_id, amount: s.outstanding }),
    })
    setBusyResource(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); await dialog.uiAlert(d.error || 'ثبتِ تسویه ناموفق بود'); return }
    loadSettlements()
  }

  if (authed === null || (loading && tab === 'ledger')) {
    return <main className="min-h-screen grid place-items-center text-soot">در حالِ بارگذاری…</main>
  }

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header>
        <a href="/super" className="text-xs text-soot underline">← بازگشت به لیستِ متخصص‌ها</a>
        <h1 className="text-xl font-bold text-ink mt-1">حسابداریِ {PLATFORM_NAME}</h1>
      </header>

      <div className="flex bg-white rounded-xl border border-sand p-1 gap-1 max-w-sm">
        {([['ledger', 'دفترِ حساب'], ['settlements', 'تسویه‌ی دکترها']] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${tab === k ? 'bg-ink text-white' : 'text-soot'}`}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'ledger' && (
        <>
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-2xl border border-sand p-4">
                <div className="text-[11px] text-soot">کلِ دریافتی (ناخالص)</div>
                <div className="text-lg font-bold text-ink tnum mt-1">{money(totals.gross)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-sand p-4">
                <div className="text-[11px] text-soot">کارمزدِ پلتفرم</div>
                <div className="text-lg font-bold text-emerald-700 tnum mt-1">{money(totals.commission)}</div>
              </div>
              <div className="bg-white rounded-2xl border border-sand p-4">
                <div className="text-[11px] text-soot">سهمِ دکترها</div>
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
                        {e.split_applied && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">تسهیمِ خودکار</span>}
                      </div>
                      <div className="text-[11px] text-soot mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{e.tenant_name || e.tenant_slug}</span>
                        {e.resource_name && <><span>·</span><span>{e.resource_name}</span></>}
                        {e.case_number && <><span>·</span><span dir="ltr">{e.case_number}</span></>}
                        <span>·</span>
                        <span className="tnum">{new Date(e.created_at).toLocaleDateString('fa-IR')} {new Date(e.created_at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className={`text-sm font-bold tnum ${e.direction === 'outflow' ? 'text-red-700' : 'text-ink'}`}>
                        {e.direction === 'outflow' ? '− ' : ''}{money(e.amount)}
                      </div>
                      {e.method === 'online' && e.commission_amount > 0 && (
                        <div className="text-[10px] text-soot tnum">کارمزد {money(e.commission_amount)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[11px] text-soot">دفترِ حساب تغییرناپذیر است — هر ردیف سندِ دائمیِ یک تراکنش است و ویرایش/حذف نمی‌شود.</p>
        </>
      )}

      {tab === 'settlements' && (
        <>
          {settleLoading ? (
            <p className="text-sm text-soot text-center py-10">در حالِ بارگذاری…</p>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-sand p-5">
                <h2 className="text-sm font-display font-bold text-ink mb-1">بدهیِ پلتفرم به دکترها</h2>
                <p className="text-xs text-soot mb-4">
                  سهمِ دکتر از پرداختِ آنلاین که هنوز به او واریز نشده. با «تسویه شد» مبلغ ثبت می‌شود و از بدهیِ معوق کم می‌شود.
                </p>
                {summary.length === 0 ? (
                  <p className="text-sm text-soot text-center py-6">بدهیِ معوقی وجود ندارد.</p>
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
                            <span className="text-amber-700">بدونِ شبا</span>
                          )}
                        </div>
                        {s.outstanding > 0 && (
                          <button onClick={() => markSettled(s)} disabled={busyResource === s.resource_id}
                            className="mt-2 w-full py-2 bg-ink text-white rounded-lg text-xs font-medium disabled:opacity-50">
                            {busyResource === s.resource_id ? 'در حالِ ثبت…' : `تسویه شد (${money(s.outstanding)} تومان)`}
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
                            {new Date(s.created_at).toLocaleDateString('fa-IR')}{s.reference ? ` · پیگیری: ${s.reference}` : ''}
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
