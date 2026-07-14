'use client'
// ── ماژول «تأیید پرداخت‌ها» — چهارمین تب جداشده از PsychologyAdmin (فاز 4) ───
// این تب عمدا **فقط نمایش** است: state چهارگانه‌ی pending (مرحله‌ها/پروتکل‌ها/
// جلسه‌ها/بازپرداخت‌ها) و اکشن‌های تایید/رد در والد مانده‌اند، چون به
// loaderهای مشترک (fetchAll/loadAllSessions/loadAllStages) و بج سایدبار و
// کارت‌های داشبورد گره خورده‌اند — همه از راه props می‌آیند. کارت‌های
// PendingSection/PendingPayCard/RefundPendingCard که فقط همین تب مصرفشان
// می‌کرد، همراه تب منتقل شدند. تایپ‌های Session/Package/CaseStage از والد
// type-only import می‌شوند (erase در build؛ چرخه‌ی runtime ندارد).
import { useState } from 'react'
import React from 'react'
import { toFarsiNum, PERSIAN_MONTHS } from '@/lib/calendar'
import { uiConfirm } from '@/components/ui/Dialog'
import { Glyph } from '@/components/Glyph'
import { PRICING } from '@/lib/config'
import { stageTitle } from '@/lib/flow'
import { PageHeader } from '../shared'
import type { Session, Package, CaseStage } from '../../PsychologyAdmin'

function PendingSection({ title, icon, count, children }: { title: string; icon: string; count: number; children: React.ReactNode }) {
 return (
  <div>
   <div className="flex items-center gap-2 mb-3">
    <Glyph icon={icon} className="w-5 h-5 shrink-0 text-ink" />
    <h3 className="text-sm font-semibold text-ink">{title}</h3>
    <span className={`text-xs px-2 py-0.5 rounded-full ${count > 0 ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-gray-100 text-soot'}`}>{toFarsiNum(count)}</span>
   </div>
   {count === 0 ? (
    <div className="text-center py-6 text-xs text-gray-300 bg-white rounded-xl border border-dashed border-sand">موردی نیست</div>
   ) : (
    <div className="space-y-2">{children}</div>
   )}
  </div>
 )
}

function PendingPayCard({ name, caseNumber, amount, receipt, sub, children }: {
 name: string; caseNumber: string; amount: number; receipt?: string; sub?: string; children: React.ReactNode
}) {
 return (
  <div className="bg-white rounded-xl border border-sand p-4">
   <div className="flex items-start justify-between mb-2">
    <div>
     <div className="flex items-center gap-2">
      <span className="font-medium text-ink text-sm">{name}</span>
      <span className="text-xs px-2 py-0.5 bg-gray-100 text-soot rounded-md font-mono">{caseNumber}</span>
     </div>
     {sub && <div className="text-xs text-soot mt-0.5">{sub}</div>}
    </div>
    <span className="text-sm font-semibold text-amber-600 shrink-0">{amount.toLocaleString('en-US')} ت</span>
   </div>
   {receipt && (
    <div className="bg-gray-50 rounded-lg p-2.5 border border-sand mb-3">
     <p className="text-xs text-soot mb-0.5">فیش واریزی:</p>
     <p className="text-xs text-ink whitespace-pre-wrap break-words">{receipt}</p>
    </div>
   )}
   {children}
  </div>
 )
}

// کارت بازپرداخت کنسلی: نمایش کارت مراجع + ورودی فیش واریز
function RefundPendingCard({ name, caseNumber, card, amount, onDone }: {
 name: string; caseNumber: string; card: string; amount: number; onDone: (ref: string) => void
}) {
 const [ref, setRef] = useState('')
 const [saving, setSaving] = useState(false)
 return (
  <div className="bg-white rounded-xl border border-sand p-4">
   <div className="flex items-start justify-between mb-2">
    <div className="flex items-center gap-2">
     <span className="font-medium text-ink text-sm">{name}</span>
     <span className="text-xs px-2 py-0.5 bg-gray-100 text-soot rounded-md font-mono">{caseNumber}</span>
    </div>
    <span className="text-sm font-semibold text-amber-600 shrink-0">{amount.toLocaleString('en-US')} ت</span>
   </div>
   <div className="bg-amber-500/10 rounded-lg p-2.5 border border-amber-500/20 mb-3">
    <p className="text-xs text-soot mb-0.5">شماره کارت مراجع برای واریز:</p>
    <p dir="ltr" className="font-mono text-sm text-ink tracking-wider text-right">{card || '—'}</p>
   </div>
   <input value={ref} onChange={e => setRef(e.target.value)} placeholder="متن فیش واریز (کد پیگیری/تاریخ)"
    className="w-full text-sm px-3 py-2 border border-sand rounded-lg mb-2 focus:outline-none focus:border-ink" />
   <button disabled={saving || !ref.trim()}
    onClick={async () => { if (!await uiConfirm(`واریز بازپرداخت ${amount.toLocaleString('en-US')} تومان به کارت مراجع ثبت شود؟`)) return; setSaving(true); await onDone(ref); setSaving(false) }}
    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-40">
    {saving ? 'در حال ثبت...' : '✓ ثبت واریز بازپرداخت'}
   </button>
  </div>
 )
}

export default function BookingsTab({
 loading, pendingStages, pendingPkgs, pendingSess, pendingRefunds, clientNameOf, sessionTypeOf,
 confirmStagePayment, rejectStagePayment, confirmPackagePayment, rejectPackagePayment,
 confirmSessionPayment, rejectSessionPayment, markRefunded,
}: {
 loading: boolean
 pendingStages: CaseStage[]
 pendingPkgs: Package[]
 pendingSess: Session[]
 pendingRefunds: Session[]
 clientNameOf: (caseNumber: string) => string
 sessionTypeOf: (caseNumber: string) => string | undefined
 confirmStagePayment: (stageId: string, label: string) => void
 rejectStagePayment: (stageId: string) => void
 confirmPackagePayment: (pkgId: string) => void
 rejectPackagePayment: (pkgId: string) => void
 confirmSessionPayment: (sessionId: string) => void
 rejectSessionPayment: (sessionId: string) => void
 markRefunded: (sessionId: string, refundRef: string) => Promise<void> | void
}) {
 // نام مراجع از روی پرونده‌ها — همان childOf قبلی، حالا از والد می‌آید
 const childOf = clientNameOf
 return (
     <div>
      <PageHeader title="تأیید پرداخت‌ها" desc="پرداخت‌های کارت‌به‌کارت اعلام‌شده توسط مراجعان، منتظر بررسی و تایید شما هستند." />
      {/* صندوق تأیید پرداخت‌ها — سه بخش */}
      {(() => {
       // childOf از props (clientNameOf) می‌آید — والد از روی state پرونده‌ها می‌سازد
       const interviewPending = pendingStages.filter(s => s.stage_type === 'interview')
       const assessmentPending = pendingStages.filter(s => s.stage_type === 'assessment')
       // هر چیزی که نه مصاحبه است نه ارزیابی (یعنی جلسه‌ی دلخواه) — بدون این،
       // کارت پرداختش اصلا رندر نمی‌شد و فقط شمارنده بالا می‌رفت.
       const customPending = pendingStages.filter(s => s.stage_type !== 'interview' && s.stage_type !== 'assessment')
       const pkgAmount = (p: Package) =>
        p.price || ((p.primary_sessions * (p.primary_session_type === 'online' ? PRICING.online : PRICING.offline)) +
        (p.secondary_sessions * (p.secondary_session_type === 'online' ? PRICING.online : PRICING.offline)))
       const totalPending = pendingStages.length + pendingPkgs.length + pendingSess.length + pendingRefunds.length
       const refundAmt = (s: Session) => {
        const full = s.price || (s.session_type === 'online' ? PRICING.online : PRICING.offline)
        return Math.round(full * (s.refund_percent || 50) / 100)
       }

       if (loading) return <div className="text-center py-16 text-soot">در حال بارگذاری...</div>

       return (
        <div className="space-y-6">
         <p className={`text-sm ${totalPending === 0 ? 'text-soot' : 'text-amber-600 font-medium'}`}>
          {totalPending === 0 ? 'مورد منتظر اقدامی وجود ندارد.' : `${toFarsiNum(totalPending)} مورد منتظر اقدام است.`}
         </p>

         {/* بخش 1: مصاحبه */}
         <PendingSection title="مصاحبه‌ی اولیه" icon="🩺" count={interviewPending.length}>
          {interviewPending.map(s => (
           <PendingPayCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
            amount={s.price || (sessionTypeOf(s.case_number) === 'online' ? PRICING.online : PRICING.offline)} receipt={s.payment_ref}>
            <div className="flex gap-2">
             <button onClick={() => confirmStagePayment(s.id, stageTitle(s))}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">تأیید پرداخت</button>
             <button onClick={() => rejectStagePayment(s.id)}
              className="flex-1 py-2 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">رد</button>
            </div>
           </PendingPayCard>
          ))}
         </PendingSection>

         {/* بخش 2: ارزیابی */}
         <PendingSection title="ارزیابی" icon="🧩" count={assessmentPending.length}>
          {assessmentPending.map(s => (
           <PendingPayCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
            amount={s.price || (sessionTypeOf(s.case_number) === 'online' ? PRICING.online : PRICING.offline)} receipt={s.payment_ref}>
            <div className="flex gap-2">
             <button onClick={() => confirmStagePayment(s.id, stageTitle(s))}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">تأیید پرداخت</button>
             <button onClick={() => rejectStagePayment(s.id)}
              className="flex-1 py-2 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">رد</button>
            </div>
           </PendingPayCard>
          ))}
         </PendingSection>

         {/* جلسه‌های دلخواه (stage_type = custom) — عنوانشان را خود دکتر گذاشته */}
         <PendingSection title="جلسه‌ی دلخواه" icon="📝" count={customPending.length}>
          {customPending.map(s => (
           <PendingPayCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
            amount={s.price || (sessionTypeOf(s.case_number) === 'online' ? PRICING.online : PRICING.offline)} receipt={s.payment_ref}
            sub={stageTitle(s)}>
            <div className="flex gap-2">
             <button onClick={() => confirmStagePayment(s.id, stageTitle(s))}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">تأیید پرداخت</button>
             <button onClick={() => rejectStagePayment(s.id)}
              className="flex-1 py-2 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">رد</button>
            </div>
           </PendingPayCard>
          ))}
         </PendingSection>

         {/* بخش 3: پروتکل‌های درمان */}
         <PendingSection title="پروتکل درمان" icon="📦" count={pendingPkgs.length}>
          {pendingPkgs.map(p => (
           <PendingPayCard key={p.id} name={childOf(p.case_number)} caseNumber={p.case_number}
            amount={pkgAmount(p)} receipt={p.payment_ref}
            sub={`${PERSIAN_MONTHS[parseInt(p.month) - 1]} ${p.year} • ${p.primary_sessions + p.secondary_sessions} جلسه`}>
            <div className="flex gap-2">
             <button onClick={() => confirmPackagePayment(p.id)}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">تأیید پرداخت</button>
             <button onClick={() => rejectPackagePayment(p.id)}
              className="flex-1 py-2 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">رد</button>
            </div>
           </PendingPayCard>
          ))}
         </PendingSection>

         {/* بخش 4: جلسات تکی/دلخواه (جدا از پروتکل درمان) */}
         <PendingSection title="جلسه‌ی دلخواه / جایگزین" icon="📝" count={pendingSess.length}>
          {pendingSess.map(s => (
           <PendingPayCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
            amount={s.price || (s.session_type === 'online' ? PRICING.online : PRICING.offline)} receipt={s.payment_ref}
            sub={s.title || 'جلسه‌ی جایگزین'}>
            <div className="flex gap-2">
             <button onClick={() => confirmSessionPayment(s.id)}
              className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">تأیید پرداخت</button>
             <button onClick={() => rejectSessionPayment(s.id)}
              className="flex-1 py-2 border border-red-500/30 text-red-600 hover:bg-red-500/5 rounded-lg text-sm">رد</button>
            </div>
           </PendingPayCard>
          ))}
         </PendingSection>

         {/* بخش 5: بازپرداخت کنسلی‌ها */}
         <PendingSection title="بازپرداخت کنسلی" icon="💸" count={pendingRefunds.length}>
          {pendingRefunds.map(s => (
           <RefundPendingCard key={s.id} name={childOf(s.case_number)} caseNumber={s.case_number}
            card={s.refund_card || ''} amount={refundAmt(s)}
            onDone={(ref) => markRefunded(s.id, ref)} />
          ))}
         </PendingSection>
        </div>
       )
      })()}

     </div>
 )
}
