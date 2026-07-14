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
 paid: FinanceCats
 paidCount: FinanceCats
 pending: FinanceCats
 pendingCount: FinanceCats
 split: { online: number; offline: number }
 monthly: { month: string; amount: number }[]
 topCases: { case_number: string; name: string; amount: number }[]
 refundsList: { case_number: string; name: string; amount: number; percent: number; date: string; card: string | null }[]
 settlement: { totalOnline: number; totalCommission: number; autoSettled: number; owed: number; count: number }
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
 const [fromJ, setFromJ] = useState(() => { const t = getCurrentJalali(); return { y: t.year, m: t.month + 1, d: 1 } })
 const [toJ, setToJ] = useState(() => { const t = getCurrentJalali(); return { y: t.year, m: t.month + 1, d: t.day } })

 // معادل همان load قبلی هنگام ورود به تب
 useEffect(() => { loadFinance() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      <PageHeader title="گزارشات مالی" desc="درآمد، پرداخت‌ها و روند مالی مجموعه‌ی شما به تفکیک نوع خدمت." />
      {!financeLoaded ? (
       <SkeletonRows count={3} height="h-24" />
      ) : !finance ? (
       <div className="text-center py-16 text-soot">داده‌ای برای نمایش نیست</div>
      ) : (() => {
       const f = finance
       const money = (n: number) => n.toLocaleString('en-US') + ' تومان'
       const cats = [
        { key: 'interview', label: 'مصاحبه‌ی اولیه', icon: '🩺', amount: f.paid.interview, count: f.paidCount.interview },
        { key: 'assessment', label: 'ارزیابی', icon: '🧩', amount: f.paid.assessment, count: f.paidCount.assessment },
        { key: 'packages', label: 'پروتکل درمان', icon: '📦', amount: f.paid.packages, count: f.paidCount.packages },
        { key: 'sessions', label: 'جلسه‌ی جداگانه', icon: '📅', amount: f.paid.sessions, count: f.paidCount.sessions },
       ]
       const maxCat = Math.max(1, ...cats.map(c => c.amount))
       const maxMonth = Math.max(1, ...f.monthly.map(m => m.amount))
       const splitTotal = Math.max(1, f.split.online + f.split.offline)
       const pendCats = [
        { label: 'مصاحبه', amount: f.pending.interview, count: f.pendingCount.interview },
        { label: 'ارزیابی', amount: f.pending.assessment, count: f.pendingCount.assessment },
        { label: 'پروتکل درمان', amount: f.pending.packages, count: f.pendingCount.packages },
        { label: 'جلسه‌ی جداگانه', amount: f.pending.sessions, count: f.pendingCount.sessions },
       ].filter(c => c.amount > 0)

       return (
        <>
         {/* عنوان + بازه‌ی زمانی + بروزرسانی */}
         <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-soot">ارقام از پرداخت‌های تأییدشده در بازه‌ی انتخابی محاسبه شده‌اند.</p>
          <button onClick={() => { setFinanceLoaded(false); loadFinance() }}
           className="text-xs px-3 py-1.5 border border-sand rounded-lg text-soot hover:bg-gray-50">↻ بروزرسانی</button>
         </div>
         <div className="flex bg-white rounded-xl border border-sand p-1 gap-1">
          {([['1m', '1 ماه'], ['3m', '3 ماه'], ['6m', '6 ماه'], ['12m', '12 ماه'], ['all', 'همه']] as const).map(([k, lbl]) => (
           <button key={k} onClick={() => { setFinanceRange(k); setFinanceCustomOpen(false); setFinanceLoaded(false); loadFinance(k) }}
            className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${financeRange === k ? 'bg-ink text-white' : 'text-soot hover:bg-gray-50'}`}>
            {lbl}
           </button>
          ))}
         </div>

         {/* بازه‌ی دقیق جلالی */}
         <div className="bg-white rounded-xl border border-sand p-3">
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

         {/* ناوبری سریع — برای پیداکردن فوری هر بخش بدون اسکرول‌کردن کور */}
         <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {[['#fin-summary', 'خلاصه'], ['#fin-settlement', 'تسویه‌ی آنلاین'], ['#fin-refunds', 'بازپرداخت‌ها'], ['#fin-cats', 'دسته‌ها'], ['#fin-trend', 'روند'], ['#fin-cases', 'پرونده‌ها']].map(([href, lbl]) => (
           <a key={href} href={href} className="shrink-0 text-[11px] px-3 py-1.5 rounded-full bg-white border border-sand text-soot hover:text-ink hover:border-ink transition-colors">
            {lbl}
           </a>
          ))}
         </div>

         {/* خلاصه */}
         <div id="fin-summary" className="grid grid-cols-1 sm:grid-cols-3 gap-3 scroll-mt-4">
          <div className="bg-white rounded-2xl border border-sand p-5">
           <div className="text-xs text-soot mb-1">درآمد خالص</div>
           <div className="text-2xl font-bold text-ink">{money(f.netPaid)}</div>
           {f.refundsTotal > 0 && (
            <div className="text-[11px] text-soot mt-1">ناخالص {money(f.totalPaid)} − بازپرداخت {money(f.refundsTotal)}</div>
           )}
          </div>
          <div className="bg-white rounded-2xl border border-sand p-5">
           <div className="text-xs text-soot mb-1">در انتظار تأیید</div>
           <div className="text-2xl font-bold text-soot">{money(f.totalPending)}</div>
          </div>
          <div className={`rounded-2xl border p-5 ${f.settlement.owed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-sand'}`}>
           <div className="text-xs text-soot mb-1">تسویه‌ی معوق آنلاین</div>
           <div className={`text-2xl font-bold ${f.settlement.owed > 0 ? 'text-amber-800' : 'text-ink'}`}>{money(f.settlement.owed)}</div>
           {f.settlement.owed > 0 && <div className="text-[11px] text-amber-700 mt-1">هنوز از {PLATFORM_NAME} به شما واریز نشده</div>}
          </div>
         </div>

         {/* تسویه‌ی پرداخت آنلاین — چون همه‌ی تراکنش‌های آنلاین اول به حساب پلتفرم می‌رود */}
         {f.settlement.count > 0 && (
          <div id="fin-settlement" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
           <h2 className="text-sm font-display font-semibold text-ink mb-1">تسویه‌ی پرداخت آنلاین</h2>
           <p className="text-xs text-soot mb-4">
            پرداخت آنلاین (زیبال) اول به حساب خود {PLATFORM_NAME} می‌نشیند، بعد سهم شما (منهای کارمزد توافق‌شده) تسویه می‌شود.
           </p>
           <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between p-3 rounded-xl border border-sand">
             <span className="text-soot">کل تراکنش‌های آنلاین</span>
             <span className="font-medium text-ink tnum">{money(f.settlement.totalOnline)}</span>
            </div>
            <div className="flex justify-between p-3 rounded-xl border border-sand">
             <span className="text-soot">کارمزد پلتفرم</span>
             <span className="font-medium text-soot tnum">− {money(f.settlement.totalCommission)}</span>
            </div>
            {f.settlement.autoSettled > 0 && (
             <div className="flex justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50">
              <span className="text-emerald-800">خودکار واریزشده به شما</span>
              <span className="font-medium text-emerald-800 tnum">{money(f.settlement.autoSettled)}</span>
             </div>
            )}
            <div className="flex justify-between p-3 rounded-xl border border-amber-200 bg-amber-50">
             <span className="text-amber-800">معوق (هنوز واریز نشده)</span>
             <span className="font-medium text-amber-800 tnum">{money(f.settlement.owed)}</span>
            </div>
           </div>
           <p className="text-[11px] text-soot mt-3">تسویه‌ی معوق فعلا دستی هماهنگ می‌شود — برای زمان‌بندی واریز با پشتیبانی در تماس باشید.</p>
          </div>
         )}

         {/* بازپرداخت کنسلی‌ها — حالا با فهرست تک‌به‌تک، نه فقط جمع کل */}
         <div id="fin-refunds" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
          <div className="flex items-center justify-between mb-1">
           <h2 className="text-sm font-display font-semibold text-ink">بازپرداخت کنسلی‌ها</h2>
           {f.refundsTotal > 0 && <span className="text-sm font-semibold text-ink">− {money(f.refundsTotal)}</span>}
          </div>
          {f.refundsList.length === 0 ? (
           <p className="text-xs text-soot mt-2">در این بازه بازپرداختی ثبت نشده.</p>
          ) : (
           <div className="space-y-2 mt-3">
            {f.refundsList.map((r, i) => (
             <div key={i} className="flex items-center justify-between text-sm p-2.5 rounded-xl border border-sand">
              <div>
               <span className="text-ink">{r.name}</span>
               <span className="text-[11px] text-soot block mt-0.5">
                {toFarsiNum(r.percent)}٪ بازگشت · {new Date(r.date).toLocaleDateString('fa-IR')}{r.card ? ` · کارت ${r.card}` : ''}
               </span>
              </div>
              <span className="font-medium text-ink tnum shrink-0">{money(r.amount)}</span>
             </div>
            ))}
           </div>
          )}
         </div>

         {/* درآمد به تفکیک دسته */}
         <div id="fin-cats" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
          <h2 className="text-sm font-display font-semibold text-ink mb-4">درآمد به تفکیک دسته</h2>
          <div className="space-y-3">
           {cats.map(c => (
            <div key={c.key}>
             <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-ink">{c.icon} {c.label}{' '}
               <span className="text-soot text-xs">({toFarsiNum(c.count)} مورد)</span></span>
              <span className="font-medium text-ink">{money(c.amount)}</span>
             </div>
             <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-ink rounded-full" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
             </div>
            </div>
           ))}
          </div>
         </div>

         {/* روند ماهانه */}
         <div id="fin-trend" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
          <h2 className="text-sm font-display font-semibold text-ink mb-4">روند درآمد ماهانه</h2>
          {f.monthly.length === 0 ? (
           <p className="text-xs text-soot">هنوز درآمدی ثبت نشده است.</p>
          ) : (
           <div className="space-y-2.5">
            {f.monthly.map(m => {
             const [y, mm] = m.month.split('/')
             const label = `${PERSIAN_MONTHS[parseInt(mm) - 1]} ${y}`
             return (
              <div key={m.month}>
               <div className="flex justify-between text-xs mb-1">
                <span className="text-soot">{label}</span>
                <span className="text-ink font-medium">{money(m.amount)}</span>
               </div>
               <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-ink rounded-full" style={{ width: `${(m.amount / maxMonth) * 100}%` }} />
               </div>
              </div>
             )
            })}
           </div>
          )}
         </div>

         {/* تفکیک آنلاین/حضوری */}
         <div className="bg-white rounded-2xl border border-sand p-5">
          <h2 className="text-sm font-display font-semibold text-ink mb-3">تفکیک آنلاین / حضوری (جلسات و پکیج‌ها)</h2>
          <div className="flex h-4 rounded-full overflow-hidden mb-2 bg-gray-100">
           <div className="bg-ink" style={{ width: `${(f.split.online / splitTotal) * 100}%` }} />
           <div className="bg-gray-300" style={{ width: `${(f.split.offline / splitTotal) * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs">
           <span className="text-soot">آنلاین: {money(f.split.online)}</span>
           <span className="text-soot">حضوری: {money(f.split.offline)}</span>
          </div>
         </div>

         {/* در انتظار تأیید به تفکیک */}
         {pendCats.length > 0 && (
          <div className="bg-white rounded-2xl border border-sand p-5">
           <h2 className="text-sm font-display font-semibold text-ink mb-3">در انتظار تأیید شما</h2>
           <div className="space-y-2">
            {pendCats.map(c => (
             <div key={c.label} className="flex items-center justify-between text-sm">
              <span className="text-ink">{c.label} <span className="text-xs text-soot">({toFarsiNum(c.count)} مورد)</span></span>
              <span className="font-medium text-soot">{money(c.amount)}</span>
             </div>
            ))}
           </div>
           <p className="text-[11px] text-soot mt-3">این مبالغ از طرف مراجع اعلام شده ولی هنوز تأیید نشده‌اند. برای تأیید به تب «تأیید پرداخت‌ها» بروید.</p>
          </div>
         )}

         {/* پرونده‌های برتر */}
         <div id="fin-cases" className="bg-white rounded-2xl border border-sand p-5 scroll-mt-4">
          <h2 className="text-sm font-display font-semibold text-ink mb-3">پرونده‌های با بیشترین پرداخت</h2>
          {f.topCases.length === 0 ? (
           <p className="text-xs text-soot">—</p>
          ) : (
           <div className="space-y-2">
            {f.topCases.map((c, i) => (
             <div key={c.case_number} className="flex items-center justify-between text-sm">
              <span className="text-ink">{toFarsiNum(i + 1)}. {c.name}{' '}
               <span className="text-xs text-soot">({c.case_number})</span></span>
              <span className="font-medium text-ink">{money(c.amount)}</span>
             </div>
            ))}
           </div>
          )}
         </div>
        </>
       )
      })()}
     </div>
 )
}
