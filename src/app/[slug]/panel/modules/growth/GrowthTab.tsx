'use client'
// ── ماژول «رشد و مراجعان» — اولین تب جداشده از PsychologyAdmin (فاز 4) ──────
// چهار ماژول مستقل کاتالوگ را در خود دارد: waitlist / reviews / analytics /
// campaigns. کد رندر و منطق عینا از PsychologyAdmin منتقل شده — بدون تغییر
// رفتار. تنها استثنا: state لیست انتظار (و loader آن) در والد مانده، چون بج
// عددی سایدبار حتی بیرون این تب هم به آن نیاز دارد؛ از راه prop می‌آید.
import { useState, useEffect } from 'react'
import { toFarsiNum } from '@/lib/calendar'
import { uiAlert, uiConfirm, uiPrompt } from '@/components/ui/Dialog'
import { moduleOn, type ModuleFlags, type GrowthSubTabKey } from '@/lib/moduleManifest'
import { PageHeader, EmptyState } from '../shared'

export type WaitlistEntry = {
 id: string; client_name: string; case_number: string; contact_phone: string
 contact_email: string; session_type: string | null; note: string; created_at: string
}

type Review = { id: string; client_name: string; case_number: string; rating: number; comment: string; status: string; created_at: string }
type Analytics = { totalInflow: number; totalOutflow: number; netRevenue: number; revenueByPurpose: Record<string, number>; noShowRate: number; sessionsTotal: number; sessionsForfeited: number; newCases: number; caseGrowth: { week: string; count: number }[] }
type Campaign = { id: string; channel: string; segment: string; message: string; recipient_count: number; created_at: string }

export default function GrowthTab({ api, growthTabs, modules, waitlist, reloadWaitlist }: {
 api: (path: string) => string
 growthTabs: { key: GrowthSubTabKey; module: string; label: string }[]
 modules: ModuleFlags | undefined
 waitlist: WaitlistEntry[]
 reloadWaitlist: () => void
}) {
 const [growthSubTab, setGrowthSubTab] = useState<GrowthSubTabKey>('waitlist')
 const [reviews, setReviews] = useState<Review[]>([])
 const [analytics, setAnalytics] = useState<Analytics | null>(null)
 const [campaigns, setCampaigns] = useState<Campaign[]>([])
 const waitlistCount = waitlist.length
 const [campaignChannel, setCampaignChannel] = useState<'sms' | 'email'>('sms')
 const [campaignSegment, setCampaignSegment] = useState<'all' | 'inactive_30' | 'inactive_90'>('all')
 const [campaignMessage, setCampaignMessage] = useState('')
 const [campaignSending, setCampaignSending] = useState(false)

 // اگر زیرتب انتخابی فعلی (ماژولش) خاموش شود، خودکار به اولین زیرتب فعال —
 // pure state، بدون router (قانون همیشگی تب‌های پنل).
 const activeGrowthTab = growthTabs.some(t => t.key === growthSubTab)
  ? growthSubTab
  : (growthTabs[0]?.key ?? 'waitlist')

 // معادل همان load قبلی هنگام ورود به تب — فقط ماژول‌های فعال fetch می‌زنند
 // (ماژول خاموش به‌هرحال از فاز 2 در سرور 403 می‌گیرد).
 useEffect(() => {
  if (moduleOn(modules, 'waitlist')) reloadWaitlist()
  if (moduleOn(modules, 'reviews')) loadReviews()
  if (moduleOn(modules, 'analytics')) loadAnalytics()
  if (moduleOn(modules, 'campaigns')) loadCampaigns()
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [])

 async function loadReviews() {
  try {
   const res = await fetch(api('/reviews'), { cache: 'no-store' })
   const data = await res.json()
   setReviews(data.reviews || [])
  } catch {}
 }
 async function loadAnalytics() {
  try {
   const res = await fetch(api('/analytics'), { cache: 'no-store' })
   const data = await res.json()
   setAnalytics(data)
  } catch {}
 }
 async function loadCampaigns() {
  try {
   const res = await fetch(api('/campaigns'), { cache: 'no-store' })
   const data = await res.json()
   setCampaigns(data.campaigns || [])
  } catch {}
 }
 async function notifyWaitlistEntry(id: string, defaultMsg: string) {
  const msg = await uiPrompt('متن پیامک/ایمیل به این مراجع:', { defaultValue: defaultMsg, required: true })
  if (msg === null) return
  const res = await fetch(api('/waitlist'), {
   method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, message: msg.trim() }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) { uiAlert(d.error || 'خطا'); return }
  uiAlert(d.sent ? 'پیام ارسال شد.' : 'ثبت شد، ولی ارسال واقعی تنظیم نشده (env پیامک/ایمیل).')
  reloadWaitlist()
 }
 async function removeWaitlistEntry(id: string) {
  if (!await uiConfirm('این مورد از لیست انتظار حذف شود؟')) return
  await fetch(api('/waitlist'), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
  reloadWaitlist()
 }
 async function moderateReview(id: string, status: 'approved' | 'hidden') {
  await fetch(api('/reviews'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
  loadReviews()
 }
 async function sendCampaign() {
  if (!campaignMessage.trim()) { uiAlert('متن پیام را بنویس.'); return }
  if (!await uiConfirm(`این پیام برای گروه «${campaignSegment === 'all' ? 'همه‌ی مراجعان' : campaignSegment === 'inactive_30' ? 'غیرفعال 30+ روز' : 'غیرفعال 90+ روز'}» از طریق ${campaignChannel === 'sms' ? 'پیامک' : 'ایمیل'} ارسال شود؟`)) return
  setCampaignSending(true)
  const res = await fetch(api('/campaigns'), {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ channel: campaignChannel, segment: campaignSegment, message: campaignMessage.trim() }),
  })
  const d = await res.json().catch(() => ({}))
  setCampaignSending(false)
  if (!res.ok) { uiAlert(d.error || 'خطا در ارسال'); return }
  uiAlert(`برای ${toFarsiNum(d.sent)} نفر از ${toFarsiNum(d.attempted)} مراجع این گروه ارسال شد.`)
  setCampaignMessage('')
  loadCampaigns()
 }

 return (
  <div className="max-w-3xl mx-auto">
   <PageHeader title="رشد و مراجعان" desc="لیست انتظار، نظرات مراجعان، آمار کسب‌وکار و ارسال پیام گروهی." />
   <div className="flex bg-white rounded-xl border border-sand p-1 mb-4 overflow-x-auto">
    {growthTabs.map(({ key: k, label }) => (
     <button key={k} onClick={() => setGrowthSubTab(k)}
      className={`flex-1 text-xs py-2 rounded-lg font-medium whitespace-nowrap px-3 transition-all ${activeGrowthTab === k ? 'bg-ink text-white' : 'text-soot'}`}>
      {label}{k === 'waitlist' && waitlistCount > 0 ? ` (${toFarsiNum(waitlistCount)})` : ''}
     </button>
    ))}
   </div>

   {/* ── لیست انتظار ─────────────────────────────────────────── */}
   {activeGrowthTab === 'waitlist' && (
    <div className="space-y-2">
     <p className="text-xs text-soot mb-2">وقتی ساعت آزادی برای کسی که این‌جا منتظر است پیدا کردید، «اطلاع بده» را بزنید تا پیامک/ایمیل برایش برود.</p>
     {waitlist.length === 0 ? (
      <EmptyState icon="👥" title="لیست انتظار خالی است"
       desc="وقتی همه‌ی ساعت‌های شما پر باشد، مراجعان می‌توانند در لیست انتظار ثبت‌نام کنند و همین‌جا نمایش داده می‌شوند." />
     ) : waitlist.map(w => (
      <div key={w.id} className="bg-white rounded-xl border border-sand p-4">
       <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-ink">{w.client_name}</span>
        <span className="text-xs text-soot font-mono">{w.case_number}</span>
       </div>
       <div className="text-xs text-soot mb-2">
        {w.contact_phone || w.contact_email} {w.session_type && `• ${w.session_type === 'online' ? 'آنلاین' : 'حضوری'}`}
       </div>
       {w.note && <p className="text-xs text-ink bg-gray-100 rounded-lg p-2 mb-2">{w.note}</p>}
       <div className="flex gap-2">
        <button onClick={() => notifyWaitlistEntry(w.id, `سلام ${w.client_name}، یک ظرفیت تازه برای نوبت باز شد. برای رزرو وارد پنل خودتان شوید.`)}
         className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">اطلاع بده</button>
        <button onClick={() => removeWaitlistEntry(w.id)}
         className="py-2 px-3 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">حذف</button>
       </div>
      </div>
     ))}
    </div>
   )}

   {/* ── نظرات مراجعان ───────────────────────────────────────── */}
   {activeGrowthTab === 'reviews' && (
    <div className="space-y-2">
     {reviews.length === 0 ? (
      <EmptyState icon="📝" title="هنوز نظری ثبت نشده است"
       desc="پس از برگزاری جلسات، مراجعان می‌توانند از پنل خود نظر و امتیاز ثبت کنند؛ نظرات پیش از انتشار به تایید شما می‌رسند." />
     ) : reviews.map(r => (
      <div key={r.id} className="bg-white rounded-xl border border-sand p-4">
       <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-ink">{r.client_name}</span>
        <span className="text-amber-500 text-sm">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
       </div>
       {r.comment && <p className="text-sm text-ink mt-1 mb-2">{r.comment}</p>}
       <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600' : r.status === 'hidden' ? 'bg-gray-100 text-soot' : 'bg-amber-500/10 text-amber-600'}`}>
         {r.status === 'approved' ? 'منتشرشده' : r.status === 'hidden' ? 'مخفی' : 'در انتظار بررسی'}
        </span>
        <div className="flex gap-2">
         {r.status !== 'approved' && (
          <button onClick={() => moderateReview(r.id, 'approved')} className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">انتشار</button>
         )}
         {r.status !== 'hidden' && (
          <button onClick={() => moderateReview(r.id, 'hidden')} className="text-xs px-2.5 py-1 border border-sand text-soot rounded-lg hover:bg-gray-50">مخفی‌کردن</button>
         )}
        </div>
       </div>
      </div>
     ))}
    </div>
   )}

   {/* ── آمار کسب‌وکار ───────────────────────────────────────── */}
   {activeGrowthTab === 'analytics' && (
    !analytics ? <div className="text-center py-16 text-soot">در حال بارگذاری...</div> : (
     <div className="space-y-4">
      <p className="text-xs text-soot">90 روز اخیر</p>
      <div className="grid grid-cols-2 gap-3">
       <div className="bg-white rounded-xl border border-sand p-4">
        <p className="text-xs text-soot mb-1">درآمد خالص</p>
        <p className="text-lg font-bold text-ink">{analytics.netRevenue.toLocaleString('en-US')} ت</p>
       </div>
       <div className="bg-white rounded-xl border border-sand p-4">
        <p className="text-xs text-soot mb-1">پرونده‌های تازه</p>
        <p className="text-lg font-bold text-ink">{toFarsiNum(analytics.newCases)}</p>
       </div>
       <div className="bg-white rounded-xl border border-sand p-4">
        <p className="text-xs text-soot mb-1">نرخ سوختن جلسه (no-show)</p>
        <p className={`text-lg font-bold ${analytics.noShowRate > 15 ? 'text-red-600' : 'text-ink'}`}>{toFarsiNum(analytics.noShowRate)}٪</p>
        <p className="text-[11px] text-soot mt-0.5">{toFarsiNum(analytics.sessionsForfeited)} از {toFarsiNum(analytics.sessionsTotal)} جلسه</p>
       </div>
       <div className="bg-white rounded-xl border border-sand p-4">
        <p className="text-xs text-soot mb-1">کارمزد پرداخت‌شده</p>
        <p className="text-lg font-bold text-ink">{analytics.totalOutflow.toLocaleString('en-US')} ت</p>
       </div>
      </div>
      {Object.keys(analytics.revenueByPurpose).length > 0 && (
       <div className="bg-white rounded-xl border border-sand p-4">
        <p className="text-xs text-soot mb-3">درآمد به تفکیک نوع</p>
        <div className="space-y-2">
         {Object.entries(analytics.revenueByPurpose).map(([purpose, amount]) => {
          const label = purpose === 'stage' ? 'جلسه' : purpose === 'interview' ? 'مصاحبه' : purpose === 'assessment' ? 'ارزیابی' : purpose === 'package' ? 'پروتکل درمان' : purpose === 'session' ? 'جلسه‌ی جایگزین' : purpose === 'extra_charge' ? 'شارژ اضافه' : purpose
          const pct = analytics.totalInflow > 0 ? Math.round((amount / analytics.totalInflow) * 100) : 0
          return (
           <div key={purpose}>
            <div className="flex justify-between text-xs text-soot mb-1">
             <span>{label}</span><span>{amount.toLocaleString('en-US')} ت ({toFarsiNum(pct)}٪)</span>
            </div>
            <div className="bg-gray-100 rounded-full h-1.5"><div className="bg-ink h-1.5 rounded-full" style={{ width: `${pct}%` }} /></div>
           </div>
          )
         })}
        </div>
       </div>
      )}
      {analytics.caseGrowth.length > 1 && (
       <div className="bg-white rounded-xl border border-sand p-4">
        <p className="text-xs text-soot mb-3">پرونده‌های تازه به تفکیک هفته</p>
        <div className="flex items-end gap-1 h-20">
         {analytics.caseGrowth.map(w => {
          const max = Math.max(...analytics.caseGrowth.map(x => x.count), 1)
          return <div key={w.week} title={`${w.week}: ${w.count}`} className="flex-1 bg-ink/80 rounded-t" style={{ height: `${(w.count / max) * 100}%`, minHeight: w.count > 0 ? '4px' : '1px' }} />
         })}
        </div>
       </div>
      )}
     </div>
    )
   )}

   {/* ── پیام گروهی (کمپین) ──────────────────────────────────── */}
   {activeGrowthTab === 'campaigns' && (
    <div className="space-y-4">
     <div className="bg-white rounded-2xl border border-sand p-5">
      <h2 className="text-sm font-display font-semibold text-ink mb-3">ارسال پیام گروهی</h2>
      <div className="grid grid-cols-2 gap-3 mb-3">
       <div>
        <label className="text-xs text-soot mb-1 block">کانال</label>
        <div className="flex bg-gray-100 rounded-lg p-1">
         {(['sms', 'email'] as const).map(c => (
          <button key={c} onClick={() => setCampaignChannel(c)}
           className={`flex-1 text-xs py-1.5 rounded-md font-medium ${campaignChannel === c ? 'bg-white text-ink shadow-sm' : 'text-soot'}`}>
           {c === 'sms' ? 'پیامک' : 'ایمیل'}
          </button>
         ))}
        </div>
       </div>
       <div>
        <label className="text-xs text-soot mb-1 block">مخاطبان</label>
        <select value={campaignSegment} onChange={e => setCampaignSegment(e.target.value as any)}
         className="w-full text-xs px-2 py-2 border border-sand rounded-lg bg-white">
         <option value="all">همه‌ی مراجعان</option>
         <option value="inactive_30">غیرفعال (30+ روز بدون جلسه)</option>
         <option value="inactive_90">غیرفعال (90+ روز بدون جلسه)</option>
        </select>
       </div>
      </div>
      <textarea value={campaignMessage} onChange={e => setCampaignMessage(e.target.value)} rows={4}
       placeholder="مثلا: مطب ما در تعطیلات نوروز از 1 تا 4 فروردین تعطیل است."
       className="w-full text-sm px-3 py-2 border border-sand rounded-xl focus:outline-none focus:border-ink resize-none mb-3" />
      <button onClick={sendCampaign} disabled={campaignSending}
       className="w-full py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40">
       {campaignSending ? 'در حال ارسال...' : 'ارسال'}
      </button>
     </div>
     {campaigns.length > 0 && (
      <div className="bg-white rounded-2xl border border-sand p-5">
       <h2 className="text-sm font-display font-semibold text-ink mb-3">تاریخچه</h2>
       <div className="space-y-2">
        {campaigns.map(c => (
         <div key={c.id} className="text-xs border-b border-sand pb-2 last:border-0">
          <div className="flex justify-between text-soot mb-1">
           <span>{c.channel === 'sms' ? 'پیامک' : 'ایمیل'} • {toFarsiNum(c.recipient_count)} نفر</span>
           <span>{new Date(c.created_at).toLocaleDateString('fa-IR')}</span>
          </div>
          <p className="text-ink">{c.message}</p>
         </div>
        ))}
       </div>
      </div>
     )}
    </div>
   )}
  </div>
 )
}
