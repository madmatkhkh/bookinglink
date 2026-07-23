'use client'
// ── تب «قابلیت‌ها» ─────────────────────────────────────────────────────────
// خانه‌ی قابلیت‌های سطح-مجموعه که نه «تنظیمات» صفحه‌ی عمومی‌اند و نه کار روزمره.
// فعلا یک بخش دارد: پیامک. کمپین و لیست انتظار عمدا همان‌جا زیر «رشد و
// مراجعان» ماندند — آن‌ها کار روزمره‌ی جذب مراجع‌اند، نه مدیریت زیرساخت پیامک.
import { useState, useEffect, useCallback } from 'react'
import { uiAlert } from '@/components/ui/Dialog'
import { PageHeader } from '../shared'
import { REMINDER_PLACEHOLDERS, REMINDER_PLACEHOLDER_HELP, SMS_BODY_MAX } from '@/lib/smsTemplates'

type Allowance = {
 unlimited: boolean; quota: number; usedThisMonth: number
 quotaRemaining: number; creditRemaining: number; remaining: number
}
type Template = {
 id: string; body: string; status: 'pending_review' | 'approved' | 'rejected'
 review_note: string | null; updated_at: string
}
type SmsData = {
 allowance: Allowance; template: Template | null; defaultBody: string
 customSendingAvailable: boolean; canEdit: boolean
 leadHours: number; leadOptions: number[]
}

const LEAD_LABEL: Record<number, string> = {
 2: '2 ساعت قبل', 4: '4 ساعت قبل', 6: '6 ساعت قبل',
 12: '12 ساعت قبل', 24: 'یک روز قبل', 48: 'دو روز قبل',
}

const STATUS_STYLE: Record<Template['status'], { label: string; cls: string }> = {
 pending_review: { label: 'در انتظار بررسی', cls: 'bg-amber-100 text-amber-800' },
 approved: { label: 'تاییدشده — در حال استفاده', cls: 'bg-emerald-100 text-emerald-800' },
 rejected: { label: 'رد شده', cls: 'bg-red-100 text-red-700' },
}

export default function CapabilitiesTab({ slug }: { slug: string }) {
 const [data, setData] = useState<SmsData | null>(null)
 const [body, setBody] = useState('')
 const [saving, setSaving] = useState(false)
 const [leadSaving, setLeadSaving] = useState(false)
 const [loadError, setLoadError] = useState('')

 const load = useCallback(async () => {
  try {
   const res = await fetch(`/api/t/${slug}/panel/sms`)
   if (!res.ok) { setLoadError('خواندن اطلاعات پیامک ناموفق بود'); return }
   const d: SmsData = await res.json()
   setData(d)
   setBody(d.template?.body || d.defaultBody)
  } catch { setLoadError('اتصال برقرار نشد') }
 }, [slug])

 useEffect(() => { load() }, [load])

 async function saveLead(hours: number) {
  setLeadSaving(true)
  try {
   const res = await fetch(`/api/t/${slug}/panel/sms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_hours: hours }),
   })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { await uiAlert(d.error || 'ذخیره ناموفق بود'); return }
   await load()
  } catch { await uiAlert('اتصال برقرار نشد') } finally { setLeadSaving(false) }
 }

 async function save() {
  setSaving(true)
  try {
   const res = await fetch(`/api/t/${slug}/panel/sms`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
   })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { await uiAlert(d.error || 'ذخیره ناموفق بود'); return }
   await load()
   await uiAlert(d.status === 'approved'
    ? 'متن ذخیره شد.'
    : 'متن ذخیره شد و برای بررسی ارسال شد. تا تایید، یادآوری‌ها با متن پیش‌فرض فرستاده می‌شوند.')
  } catch { await uiAlert('اتصال برقرار نشد') } finally { setSaving(false) }
 }

 if (loadError) return <div className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{loadError}</div>
 if (!data) return <div className="h-40 bg-white rounded-2xl border border-sand animate-pulse" aria-hidden="true" />

 const { allowance: al, template } = data
 const dirty = body.trim() !== (template?.body || '')

 return (
  <div className="space-y-4 pb-24">
   <PageHeader title="قابلیت‌ها" desc="قابلیت‌های مجموعه‌ی خود را از این‌جا مدیریت کنید." />

   <section className="bg-white rounded-2xl border border-sand p-4 space-y-4">
    <div>
     <h2 className="text-sm font-display font-bold text-ink">پیامک</h2>
     <p className="text-xs text-soot mt-1 leading-relaxed">
      سهمیه‌ی پیامک شما و متن یادآوری نوبتی که برای مراجعان فرستاده می‌شود.
     </p>
    </div>

    {/* ── سهمیه و اعتبار ── */}
    {al.unlimited ? (
     <div className="text-xs text-soot bg-gray-50 border border-sand rounded-xl p-3">
      محدودیت پیامکی برای حساب شما فعال نیست.
     </div>
    ) : (
     <div className="grid grid-cols-3 gap-2">
      {[
       { label: 'سهمیه‌ی این ماه', value: al.quota },
       { label: 'مصرف‌شده', value: al.usedThisMonth },
       { label: 'باقی‌مانده', value: al.remaining },
      ].map(s => (
       <div key={s.label} className="border border-sand rounded-xl p-3 text-center">
        <div className="text-lg font-bold text-ink tnum">{s.value}</div>
        <div className="text-[11px] text-soot mt-0.5">{s.label}</div>
       </div>
      ))}
     </div>
    )}
    {!al.unlimited && al.creditRemaining > 0 && (
     <p className="text-[11px] text-soot -mt-2">
      از این مقدار، <span className="tnum">{al.creditRemaining}</span> پیامک از بسته‌ی شارژ شماست (بدون انقضا).
     </p>
    )}

    <hr className="border-sand" />

    {/* ── زمان ارسال یادآوری ── */}
    <div className="space-y-2">
     <h3 className="text-sm font-semibold text-ink">یادآوری چه زمانی فرستاده شود؟</h3>
     <p className="text-xs text-soot leading-relaxed">
      فاصله‌ی پیامک یادآوری تا خود نوبت. اگر یک اجرا از دست برود، اجرای بعدی
      همچنان یادآوری را می‌فرستد — فقط دیرتر.
     </p>
     <div className="flex gap-2 flex-wrap">
      {data.leadOptions.map(h => (
       <button key={h} type="button" disabled={!data.canEdit || leadSaving}
        onClick={() => saveLead(h)}
        className={`text-xs rounded-xl px-3 py-2 border transition-colors disabled:opacity-50 ${
         data.leadHours === h ? 'bg-ink text-white border-ink' : 'border-sand text-soot'}`}>
        {LEAD_LABEL[h] || `${h} ساعت قبل`}
       </button>
      ))}
     </div>
     {data.leadHours < 12 && (
      <p className="text-[11px] text-amber-800 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 leading-relaxed">
       فاصله‌های کوتاه فقط وقتی دقیق کار می‌کنند که زمان‌بند پلتفرم ساعتی اجرا شود.
       اگر روزانه اجرا شود، ممکن است یادآوری اصلا نرسد.
      </p>
     )}
    </div>

    <hr className="border-sand" />

    {/* ── متن یادآوری نوبت ── */}
    <div className="space-y-3">
     <div className="flex items-center justify-between gap-2 flex-wrap">
      <h3 className="text-sm font-semibold text-ink">متن یادآوری نوبت</h3>
      {template && (
       <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${STATUS_STYLE[template.status].cls}`}>
        {STATUS_STYLE[template.status].label}
       </span>
      )}
     </div>

     <p className="text-xs text-soot leading-relaxed">
      این متن پیش از نوبت به مراجع پیامک می‌شود. چون از خط مشترک نوبت‌لینک ارسال
      می‌شود، هر متن پیش از استفاده یک بار بررسی می‌شود. تا زمان تایید، یادآوری‌ها با
      متن پیش‌فرض فرستاده می‌شوند — قطع نمی‌شوند.
      <br />
      طبق قوانین اپراتور، هر سه جاگذار {'{name}'}، {'{date}'} و {'{time}'} باید در متن باشند؛
      پیام بی‌نام‌ونشان از خط خدماتی مجاز نیست.
     </p>

     {template?.status === 'rejected' && template.review_note && (
      <div className="text-xs text-red-700 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
       <strong>دلیل رد:</strong> {template.review_note}
      </div>
     )}

     {!data.customSendingAvailable && (
      <div className="text-xs text-amber-800 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
       ارسال با متن سفارشی هنوز روی پلتفرم فعال نیست؛ فعلا متن پیش‌فرض ارسال می‌شود.
      </div>
     )}

     <textarea
      value={body}
      onChange={e => setBody(e.target.value)}
      disabled={!data.canEdit}
      rows={4}
      maxLength={SMS_BODY_MAX}
      className="w-full p-3 rounded-xl border border-sand text-sm leading-relaxed focus:outline-none focus:border-ink disabled:bg-gray-50 disabled:text-soot"
     />

     <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-soot">
      <div className="flex items-center gap-1.5 flex-wrap">
       <span>جاگذارها:</span>
       {REMINDER_PLACEHOLDERS.map(p => (
        <button key={p} type="button" disabled={!data.canEdit}
         onClick={() => setBody(b => `${b}{${p}}`)}
         title={REMINDER_PLACEHOLDER_HELP[p]}
         className="px-1.5 py-0.5 border border-sand rounded-md font-mono text-ink disabled:opacity-50">
         {`{${p}}`}
        </button>
       ))}
      </div>
      <span className="tnum">{body.length} / {SMS_BODY_MAX}</span>
     </div>

     {data.canEdit ? (
      <button onClick={save} disabled={saving || !dirty}
       className="px-4 py-2.5 rounded-xl bg-ink text-white text-sm font-medium disabled:opacity-50">
       {saving ? 'در حال ذخیره…' : 'ذخیره و ارسال برای بررسی'}
      </button>
     ) : (
      <p className="text-[11px] text-soot">تغییر متن پیامک فقط از حساب صاحب مجموعه ممکن است.</p>
     )}
    </div>
   </section>
  </div>
 )
}
