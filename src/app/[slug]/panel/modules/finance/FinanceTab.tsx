'use client'
// ── ماژول «گزارشات مالی» — دومین تب جداشده از PsychologyAdmin (فاز 4) ───────
// کد رندر و منطق عینا منتقل شده — بدون تغییر رفتار. گزارش مالی داشبورد
// (dashboardFinance) جدا از این تب است و در والد مانده. تایپ‌های FinanceData/
// FinanceCats این‌جا export می‌شوند و والد type-only import می‌کند (بدون
// چرخه‌ی runtime).
import { useState, useEffect } from 'react'
import { toFarsiNum, getCurrentJalali, jalaliDateTimeToTimestamp, PERSIAN_MONTHS } from '@/lib/calendar'
import { uiAlert } from '@/components/ui/Dialog'
import { PLATFORM_NAME } from '@/lib/config'
import { JalaliDateWheel } from '@/components/WheelPicker'
import { PageHeader, SkeletonRows } from '../shared'

export type FinanceCats = { interview: number; assessment: number; packages: number; sessions: number }
export type FinanceData = {
 totalPaid: number
 totalPending: number
 refundsTotal: number
 refundsCount: number
 netPaid: number
 todayTotal: number
 weekTotal: number
 daily: { date: string; amount: number }[]
 weekly: { date: string; amount: number }[]
 monthlyChart: { date: string; amount: number }[]
 transactions: { type: string; method: 'online' | 'card_to_card'; amount: number; commission: number; doctorAmount: number; bankRef: string | null; date: string; case_number: string; name: string }[]
 stageBreakdown: { title: string; paid: number; paidCount: number; pending: number; pendingCount: number }[]
 paid: { stages: number; packages: number; sessions: number }
 pending: { stages: number; packages: number; sessions: number }
 split: { online: number; offline: number }
 monthly: { month: string; amount: number }[]
 topCases: { case_number: string; name: string; amount: number }[]
 refundsList: { case_number: string; name: string; amount: number; percent: number; date: string; card: string | null }[]
 settlement: { totalOnline: number; totalCommission: number; autoSettled: number; settledManual: number; owed: number; count: number }
}

// پوسته‌ی سازگار: بیرون همان {y,m,d} قدیمی را می‌گیرد/می‌دهد، داخلش از
// WheelPicker استفاده می‌کند. فقط این تب مصرفش می‌کند، برای همین همراه تب
// منتقل شد.
function JalaliDateSelect({ value, onChange }: { value: { y: number; m: number; d: number }; onChange: (v: { y: number; m: number; d: number }) => void }) {
 const str = `${value.y}/${String(value.m).padStart(2, '0')}/${String(value.d).padStart(2, '0')}`
 return (
  <JalaliDateWheel value={str} onChange={v => {
   const [y, m, d] = v.split('/').map(n => parseInt(n, 10))
   onChange({ y, m, d })
  }} yearsBack={4} yearsForward={0} />
 )
}

export default function FinanceTab({ api, onUnauthorized }: {
 api: (path: string) => string
 onUnauthorized: () => void
}) {
 const [finance, setFinance] = useState<FinanceData | null>(null)
 const [financeLoaded, setFinanceLoaded] = useState(false)
 const [financeRange, setFinanceRange] = useState<'all' | '1m' | '3m' | '6m' | '12m' | 'custom'>('6m')
 const [financeFromIso, setFinanceFromIso] = useState('')
 const [financeToIso, setFinanceToIso] = useState('')
 const [financeCustomOpen, setFinanceCustomOpen] = useState(false)
 const [detailsOpen, setDetailsOpen] = useState(false)
 // فاز P5: فاکتورهای ماهانه‌ی نوبت‌لینک (حق اشتراک + کارمزد تراکنش، با تفکیک مالیات)
 type InvoiceRow = { id: string; period_key: string; status: string; vat_rate: number; subscription_base: number; subscription_vat: number; txn_fee_base: number; txn_fee_vat: number; txn_count: number; total_base: number; total_vat: number; total: number; created_at: string }
 const [invoices, setInvoices] = useState<InvoiceRow[]>([])
 const [invoicesOpen, setInvoicesOpen] = useState(false)
 const [chartPeriod, setChartPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
 const [showAllTxns, setShowAllTxns] = useState(false)
 const [fromJ, setFromJ] = useState(() => { const t = getCurrentJalali(); return { y: t.year, m: t.month + 1, d: 1 } })
 const [toJ, setToJ] = useState(() => { const t = getCurrentJalali(); return { y: t.year, m: t.month + 1, d: t.day } })

 // معادل همان load قبلی هنگام ورود به تب
 useEffect(() => { loadFinance(); loadInvoices() }, []) // eslint-disable-line react-hooks/exhaustive-deps

 async function loadInvoices() {
  try {
   const res = await fetch(api('/invoices'), { cache: 'no-store' })
   if (!res.ok) return
   const data = await res.json()
   setInvoices(Array.isArray(data.invoices) ? data.invoices : [])
  } catch {}
 }

 async function loadFinance(range: 'all' | '1m' | '3m' | '6m' | '12m' | 'custom' = financeRange, iso?: { from?: string; to?: string }) {
  try {
   let qs = ''
   if (range === 'custom') {
    const p = new URLSearchParams()
    const from = iso?.from ?? financeFromIso
    const to = iso?.to ?? financeToIso
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    qs = p.toString() ? '?' + p.toString() : ''
   } else if (range !== 'all') {
    const days = { '1m': 30, '3m': 90, '6m': 180, '12m': 365 }[range]
    const fromIso = new Date(Date.now() - days * 86400000).toISOString()
    qs = `?from=${encodeURIComponent(fromIso)}`
   }
   const res = await fetch(api('/finance') + qs, { cache: 'no-store' })
   if (res.status === 401) { onUnauthorized(); return }
   const data = await res.json()
   setFinance(data)
  } catch {}
  setFinanceLoaded(true)
 }

 // اعمال بازه‌ی دقیق جلالی
 function applyCustomRange() {
  const fromTs = jalaliDateTimeToTimestamp(`${fromJ.y}/${fromJ.m}/${fromJ.d}`, '00:00')
  const toTs = jalaliDateTimeToTimestamp(`${toJ.y}/${toJ.m}/${toJ.d}`, '23:59')
  if (fromTs === null || toTs === null) { uiAlert('تاریخ نامعتبر است'); return }
  if (fromTs > toTs) { uiAlert('تاریخ «از» نباید بعد از «تا» باشد.'); return }
  const from = new Date(fromTs).toISOString()
  const to = new Date(toTs).toISOString()
  setFinanceFromIso(from); setFinanceToIso(to); setFinanceRange('custom'); setFinanceLoaded(false)
  loadFinance('custom', { from, to })
 }

 return (
     <div className="space-y-4">
      <PageHeader title="گزارشات مالی" desc="یک نگاه سریع به درآمد امروز، این هفته و این ماه — و جزئیات بیشتر پایین‌تر." />
      {!financeLoaded ? (
       <SkeletonRows count={3} height="h-24" />
      ) : !finance ? (
       <div className="text-center py-16 text-soot">داده‌ای برای نمایش نیست</div>
      ) : (() => {
       const f = finance
       const money = (n: number) => n.toLocaleString('en-US') + ' تومان'
       const moneyShort = (n: number) => n.toLocaleString('en-US')
       const cats = [
        ...f.stageBreakdown.map(s => ({ key: s.title, label: s.title, icon: '●', amount: s.paid, count: s.paidCount })),
        { key: 'packages', label: 'پروتکل درمان', icon: '📦', amount: f.paid.packages, count: 0 },
        { key: 'sessions', label: 'جلسه‌ی جداگانه', icon: '📅', amount: f.paid.sessions, count: 0 },
       ].filter(c => c.amount > 0)
       const maxCat = Math.max(1, ...cats.map(c => c.amount))
       const maxMonth = Math.max(1, ...f.monthly.map(m => m.amount))
       const splitTotal = Math.max(1, f.split.online + f.split.offline)
       const pendCats = [
        ...f.stageBreakdown.filter(s => s.pending > 0).map(s => ({ label: s.title, amount: s.pending, count: s.pendingCount })),
        { label: 'پروتکل درمان', amount: f.pending.packages, count: 0 },
        { label: 'جلسه‌ی جداگانه', amount: f.pending.sessions, count: 0 },
       ].filter(c => c.amount > 0)
       // درآمد این ماه از سری روزانه‌ی همین ماه (مطلق، مستقل از بازه‌ی گزارش)
       const thisMonthTotal = (f.daily || []).reduce((sum, d) => {
        const dd = new Date(d.date); const nn = new Date()
        return dd.getMonth() === nn.getMonth() && dd.getFullYear() === nn.getFullYear() ? sum + d.amount : sum
       }, 0)

       return (
        <>
         {/* ═══ نمای سریع Shopify-style: امروز / این هفته / این ماه ═══ */}
         <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
           <div className="text-xs opacity-90 mb-1">درآمد امروز</div>
           <div className="text-3xl font-bold tnum">{moneyShort(f.todayTotal || 0)}</div>
           <div className="text-[11px] opacity-80 mt-1">تومان</div>
          </div>
          <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5">
           <div className="text-xs text-emerald-700 mb-1">این هفته</div>
           <div className="text-3xl font-bold text-emerald-800 tnum">{moneyShort(f.weekTotal || 0)}</div>
           <div className="text-[11px] text-emerald-600 mt-1">تومان</div>
          </div>
          <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5">
           <div className="text-xs text-emerald-700 mb-1">این ماه</div>
           <div className="text-3xl font-bold text-emerald-800 tnum">{moneyShort(thisMonthTotal)}</div>
           <div className="text-[11px] text-emerald-600 mt-1">تومان</div>
          </div>
         </div>

         {/* نمودار درآمد — روزانه / هفتگی / ماهانه با خط میانگین */}
         <div className="bg-white rounded-2xl border border-sand p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
           <h2 className="text-sm font-display font-semibold text-ink">نمودار درآمد</h2>
           <div className="flex items-center gap-2">
            <div className="flex bg-gray-50 rounded-lg border border-sand p-0.5 gap-0.5">
             {([['daily', 'روزانه'], ['weekly', 'هفتگی'], ['monthly', 'ماهانه']] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => setChartPeriod(k)}
               className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-all ${chartPeriod === k ? 'bg-emerald-600 text-white' : 'text-soot hover:bg-white'}`}>
               {lbl}
              </button>
             ))}
            </div>
            <button onClick={() => { setFinanceLoaded(false); loadFinance() }}
             className="text-xs px-2.5 py-1 border border-sand rounded-lg text-soot hover:bg-gray-50">↻</button>
           </div>
          </div>
          {(() => {
           const series = chartPeriod === 'daily' ? (f.daily || []) : chartPeriod === 'weekly' ? (f.weekly || []) : (f.monthlyChart || [])
           const maxV = Math.max(1, ...series.map(d => d.amount))
           const nonZero = series.filter(d => d.amount > 0)
           const avg = nonZero.length ? Math.round(nonZero.reduce((s, d) => s + d.amount, 0) / nonZero.length) : 0
           const WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
           const fmtLabel = (iso: string) => {
            const dt = new Date(iso)
            if (chartPeriod === 'daily') return WEEKDAYS_FA[dt.getDay()]
            if (chartPeriod === 'monthly') return dt.toLocaleDateString('fa-IR-u-nu-latn', { month: 'short' })
            return dt.toLocaleDateString('fa-IR-u-nu-latn', { month: 'short', day: 'numeric' })
           }
           if (series.every(d => d.amount === 0)) return <p className="text-xs text-soot text-center py-8">در این بازه درآمدی ثبت نشده.</p>
           return (
            <>
             {avg > 0 && (
              <div className="text-[11px] text-soot mb-2">میانگین {chartPeriod === 'daily' ? 'روزانه' : chartPeriod === 'weekly' ? 'هفتگی' : 'ماهانه'}: <span className="text-emerald-700 font-medium tnum">{moneyShort(avg)} تومان</span></div>
             )}
             <div className="relative h-36">
              <div className="flex items-end gap-[3px] h-full">
               {series.map((d, i) => {
                const isLast = i === series.length - 1
                return (
                 <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div className={`w-full rounded-t transition-all ${isLast ? 'bg-emerald-600' : 'bg-emerald-200 group-hover:bg-emerald-300'}`}
                   style={{ height: `${Math.max(d.amount > 0 ? 4 : 0, (d.amount / maxV) * 100)}%` }} />
                  {d.amount > 0 && (
                   <div className="absolute bottom-full mb-1 hidden group-hover:block bg-ink text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-20 tnum">
                    {fmtLabel(d.date)}: {moneyShort(d.amount)}
                   </div>
                  )}
                 </div>
                )
               })}
              </div>
             </div>
             <div className="flex text-[10px] text-soot mt-2 tnum">
              {series.map((d, i) => (
               <span key={i} className="flex-1 text-center truncate">{fmtLabel(d.date)}</span>
              ))}
             </div>
            </>
           )
          })()}
         </div>

         {/* ═══ جزئیات بیشتر — جمع‌وجورتر، با بازه‌ی انتخابی ═══ */}
         <div className="bg-white rounded-2xl border border-sand overflow-hidden">
          <button onClick={() => setDetailsOpen(o => !o)}
           className="w-full flex items-center justify-between p-4 text-right">
           <span className="text-sm font-display font-semibold text-ink">جزئیات و گزارش بازه‌ای</span>
           <span className="text-soot text-xs">{detailsOpen ? '▲ بستن' : '▼ باز کردن'}</span>
          </button>

          {detailsOpen && (
           <div className="border-t border-sand p-4 space-y-4">
            {/* بازه‌ی زمانی */}
            <div className="flex bg-gray-50 rounded-xl border border-sand p-1 gap-1">
             {([['1m', '1 ماه'], ['3m', '3 ماه'], ['6m', '6 ماه'], ['12m', '12 ماه'], ['all', 'همه']] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => { setFinanceRange(k); setFinanceCustomOpen(false); setFinanceLoaded(false); loadFinance(k) }}
               className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${financeRange === k ? 'bg-ink text-white' : 'text-soot hover:bg-white'}`}>
               {lbl}
              </button>
             ))}
            </div>

            <div>
             <button onClick={() => setFinanceCustomOpen(o => !o)}
              className={`text-xs font-medium ${financeRange === 'custom' ? 'text-ink' : 'text-soot'}`}>
              بازه‌ی دقیق {financeRange === 'custom' && financeFromIso ? '(فعال)' : ''} {financeCustomOpen ? '▲' : '▼'}
             </button>
             {financeCustomOpen && (
              <div className="mt-3 space-y-2">
               <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-soot w-8 shrink-0">از</span>
                <JalaliDateSelect value={fromJ} onChange={setFromJ} />
               </div>
               <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-soot w-8 shrink-0">تا</span>
                <JalaliDateSelect value={toJ} onChange={setToJ} />
               </div>
               <button onClick={applyCustomRange}
                className="w-full py-2 bg-ink text-white rounded-lg text-xs font-medium hover:bg-ink/90">اعمال بازه</button>
              </div>
             )}
            </div>

            <p className="text-[11px] text-soot">ارقام زیر از پرداخت‌های تأییدشده در بازه‌ی انتخابی محاسبه شده‌اند.</p>

            {/* جدول تراکنش‌ها */}
            <div className="rounded-xl border border-sand overflow-hidden">
             <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-sand">
              <h3 className="text-xs font-semibold text-ink">تراکنش‌ها ({toFarsiNum((f.transactions || []).length)})</h3>
             </div>
             {(f.transactions || []).length === 0 ? (
              <p className="text-xs text-soot text-center py-6">در این بازه تراکنشی نیست.</p>
             ) : (
              <div className="divide-y divide-sand">
               {(showAllTxns ? f.transactions : f.transactions.slice(0, 15)).map((tr, i) => {
                const dt = new Date(tr.date)
                return (
                 <div key={i} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                   <div className="flex items-center gap-1.5">
                    <span className="text-sm text-ink truncate">{tr.name || tr.case_number}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-soot shrink-0">{tr.type}</span>
                   </div>
                   <div className="text-[11px] text-soot mt-0.5 tnum">
                    {dt.toLocaleDateString('fa-IR')} · {dt.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{tr.method === 'online' ? 'آنلاین' : 'کارت‌به‌کارت'}
                   </div>
                  </div>
                  <div className="text-left shrink-0">
                   <div className="text-sm font-medium text-emerald-700 tnum">{moneyShort(tr.amount)}</div>
                   {tr.method === 'online' && tr.commission > 0 && (
                    <div className="text-[10px] text-soot tnum">سهم شما {moneyShort(tr.doctorAmount)}</div>
                   )}
                  </div>
                 </div>
                )
               })}
               {f.transactions.length > 15 && (
                <button onClick={() => setShowAllTxns(v => !v)}
                 className="w-full py-2.5 text-xs text-soot hover:bg-gray-50">
                 {showAllTxns ? 'نمایش کمتر' : `نمایش همه (${toFarsiNum(f.transactions.length)})`}
                </button>
               )}
              </div>
             )}
            </div>

            {/* خلاصه‌ی بازه */}
            <div className="grid grid-cols-3 gap-2">
             <div className="rounded-xl border border-sand p-3">
              <div className="text-[11px] text-soot mb-1">درآمد خالص</div>
              <div className="text-base font-bold text-ink tnum">{moneyShort(f.netPaid)}</div>
             </div>
             <div className="rounded-xl border border-sand p-3">
              <div className="text-[11px] text-soot mb-1">در انتظار تأیید</div>
              <div className="text-base font-bold text-soot tnum">{moneyShort(f.totalPending)}</div>
             </div>
             <div className={`rounded-xl border p-3 ${f.settlement.owed > 0 ? 'bg-amber-50 border-amber-200' : 'border-sand'}`}>
              <div className="text-[11px] text-soot mb-1">تسویه‌ی معوق</div>
              <div className={`text-base font-bold tnum ${f.settlement.owed > 0 ? 'text-amber-800' : 'text-ink'}`}>{moneyShort(f.settlement.owed)}</div>
             </div>
            </div>

            {/* تسویه‌ی پرداخت آنلاین */}
            {f.settlement.count > 0 && (
             <div className="rounded-xl border border-sand p-4">
              <h3 className="text-xs font-semibold text-ink mb-1">تسویه‌ی پرداخت آنلاین</h3>
              <p className="text-[11px] text-soot mb-3">
               پرداخت آنلاین (درگاه پرداخت {PLATFORM_NAME}) اول به حساب {PLATFORM_NAME} می‌نشیند، بعد سهم شما (منهای کارمزد) تسویه می‌شود.
              </p>
              <div className="space-y-1.5 text-xs">
               <div className="flex justify-between"><span className="text-soot">کل تراکنش‌های آنلاین</span><span className="text-ink tnum">{money(f.settlement.totalOnline)}</span></div>
               <div className="flex justify-between"><span className="text-soot">کارمزد پلتفرم</span><span className="text-soot tnum">− {money(f.settlement.totalCommission)}</span></div>
               {f.settlement.autoSettled > 0 && <div className="flex justify-between"><span className="text-emerald-700">خودکار واریزشده</span><span className="text-emerald-700 tnum">{money(f.settlement.autoSettled)}</span></div>}
               {f.settlement.settledManual > 0 && <div className="flex justify-between"><span className="text-emerald-700">تسویه‌شده توسط {PLATFORM_NAME}</span><span className="text-emerald-700 tnum">{money(f.settlement.settledManual)}</span></div>}
               <div className="flex justify-between pt-1.5 border-t border-sand"><span className="text-amber-800">معوق</span><span className="text-amber-800 font-medium tnum">{money(f.settlement.owed)}</span></div>
              </div>
             </div>
            )}

            {/* درآمد به تفکیک دسته */}
            <div className="rounded-xl border border-sand p-4">
             <h3 className="text-xs font-semibold text-ink mb-3">درآمد به تفکیک دسته</h3>
             <div className="space-y-3">
              {cats.map(c => (
               <div key={c.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                 <span className="text-ink">{c.icon} {c.label} {c.count > 0 && <span className="text-soot">({toFarsiNum(c.count)})</span>}</span>
                 <span className="font-medium text-ink tnum">{moneyShort(c.amount)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                 <div className="h-full bg-ink rounded-full" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                </div>
               </div>
              ))}
             </div>
            </div>

            {/* روند ماهانه */}
            {f.monthly.length > 0 && (
             <div className="rounded-xl border border-sand p-4">
              <h3 className="text-xs font-semibold text-ink mb-3">روند درآمد ماهانه</h3>
              <div className="space-y-2.5">
               {f.monthly.map(m => {
                const [y, mm] = m.month.split('/')
                const label = `${PERSIAN_MONTHS[parseInt(mm) - 1]} ${y}`
                return (
                 <div key={m.month}>
                  <div className="flex justify-between text-[11px] mb-1"><span className="text-soot">{label}</span><span className="text-ink font-medium tnum">{moneyShort(m.amount)}</span></div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-ink rounded-full" style={{ width: `${(m.amount / maxMonth) * 100}%` }} /></div>
                 </div>
                )
               })}
              </div>
             </div>
            )}

            {/* تفکیک آنلاین/حضوری */}
            <div className="rounded-xl border border-sand p-4">
             <h3 className="text-xs font-semibold text-ink mb-3">تفکیک آنلاین / حضوری</h3>
             <div className="flex h-3 rounded-full overflow-hidden mb-2 bg-gray-100">
              <div className="bg-ink" style={{ width: `${(f.split.online / splitTotal) * 100}%` }} />
              <div className="bg-gray-300" style={{ width: `${(f.split.offline / splitTotal) * 100}%` }} />
             </div>
             <div className="flex justify-between text-[11px]"><span className="text-soot">آنلاین: {moneyShort(f.split.online)}</span><span className="text-soot">حضوری: {moneyShort(f.split.offline)}</span></div>
            </div>

            {/* بازپرداخت‌ها */}
            {f.refundsList.length > 0 && (
             <div className="rounded-xl border border-sand p-4">
              <div className="flex items-center justify-between mb-2">
               <h3 className="text-xs font-semibold text-ink">بازپرداخت کنسلی‌ها</h3>
               <span className="text-xs font-semibold text-ink">− {moneyShort(f.refundsTotal)}</span>
              </div>
              <div className="space-y-1.5">
               {f.refundsList.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                 <span className="text-ink">{r.name} <span className="text-soot">· {toFarsiNum(r.percent)}٪ · {new Date(r.date).toLocaleDateString('fa-IR')}</span></span>
                 <span className="text-ink tnum shrink-0">{moneyShort(r.amount)}</span>
                </div>
               ))}
              </div>
             </div>
            )}

            {/* در انتظار تأیید */}
            {pendCats.length > 0 && (
             <div className="rounded-xl border border-sand p-4">
              <h3 className="text-xs font-semibold text-ink mb-3">در انتظار تأیید شما</h3>
              <div className="space-y-2">
               {pendCats.map(c => (
                <div key={c.label} className="flex items-center justify-between text-xs">
                 <span className="text-ink">{c.label} {c.count > 0 && <span className="text-soot">({toFarsiNum(c.count)})</span>}</span>
                 <span className="font-medium text-soot tnum">{moneyShort(c.amount)}</span>
                </div>
               ))}
              </div>
              <p className="text-[11px] text-soot mt-3">برای تأیید به تب «تأیید پرداخت‌ها» بروید.</p>
             </div>
            )}

            {/* پرونده‌های برتر */}
            {f.topCases.length > 0 && (
             <div className="rounded-xl border border-sand p-4">
              <h3 className="text-xs font-semibold text-ink mb-3">پرونده‌های با بیشترین پرداخت</h3>
              <div className="space-y-2">
               {f.topCases.map((c, i) => (
                <div key={c.case_number} className="flex items-center justify-between text-xs">
                 <span className="text-ink">{toFarsiNum(i + 1)}. {c.name} <span className="text-soot">({c.case_number})</span></span>
                 <span className="font-medium text-ink tnum">{moneyShort(c.amount)}</span>
                </div>
               ))}
              </div>
             </div>
            )}
           </div>
          )}
         </div>
        </>
       )
      })()}

      {/* ── فاکتورهای نوبت‌لینک — فاز P5: صورت‌حساب ماهانه با تفکیک مالیات ── */}
      {invoices.length > 0 && (
       <div className="rounded-2xl border border-sand bg-white p-4">
        <button onClick={() => setInvoicesOpen(v => !v)} className="w-full flex items-center justify-between">
         <h3 className="text-sm font-semibold text-ink">فاکتورهای {PLATFORM_NAME}</h3>
         <span className="text-xs text-soot">{invoicesOpen ? 'بستن' : `${invoices.length} فاکتور`}</span>
        </button>
        {invoicesOpen && (
         <div className="mt-3 space-y-3">
          <p className="text-[11px] text-soot">
           صورت‌حساب خدمات پلتفرم (حق اشتراک + کارمزد تراکنش آنلاین) — مبالغ تومان، مالیات بر ارزش افزوده به‌صورت قلم جدا. وصول از محل تسویه‌ی سهم شما انجام می‌شود.
          </p>
          {invoices.map(inv => (
           <div key={inv.id} className="rounded-xl border border-sand p-3 text-xs">
            <div className="flex items-center justify-between mb-2">
             <span className="font-semibold text-ink tnum">دوره {inv.period_key}</span>
             <span className="font-bold text-ink tnum">{inv.total.toLocaleString('en-US')} تومان</span>
            </div>
            <div className="space-y-1 text-soot">
             {inv.subscription_base > 0 && (
              <div className="flex justify-between"><span>حق اشتراک</span><span className="tnum">{inv.subscription_base.toLocaleString('en-US')}</span></div>
             )}
             {inv.txn_fee_base > 0 && (
              <div className="flex justify-between"><span>کارمزد تراکنش ({inv.txn_count} تراکنش)</span><span className="tnum">{inv.txn_fee_base.toLocaleString('en-US')}</span></div>
             )}
             <div className="flex justify-between"><span>مالیات بر ارزش افزوده ({inv.vat_rate}%)</span><span className="tnum">{inv.total_vat.toLocaleString('en-US')}</span></div>
             <div className="flex justify-between border-t border-sand pt-1 text-ink font-medium"><span>جمع کل</span><span className="tnum">{inv.total.toLocaleString('en-US')} تومان</span></div>
            </div>
           </div>
          ))}
         </div>
        )}
       </div>
      )}
     </div>
 )
}
