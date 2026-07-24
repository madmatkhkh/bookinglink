'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { PERSIAN_MONTHS, PERSIAN_WEEKDAYS_FULL, toFarsiNum, getCurrentJalali, getDaysInJalaliMonth, jalaliDateTimeToTimestamp, jalaliWeekday } from '@/lib/calendar'
import { uiAlert } from '@/components/ui/Dialog'
import { useModalBackClose } from '@/lib/useModalBackClose'
import { usePatientFeatures } from '@/components/PsyPublic'
import { moduleOn } from '@/lib/moduleManifest'

// انتخاب زمان یک جلسه — مشترک بین پنل مراجع و فرم مصاحبه.
//
// دو حالت دارد:
//   بدون onConfirm → خودش روی psy/schedule-one ثبت می‌کند (رفتار قدیمی پنل مراجع)
//   با onConfirm   → فقط زمان را برمی‌گرداند و تصمیم با فراخواننده است. این همان
//                    چیزی است که پرداخت آنلاین لازم دارد: اول زمان انتخاب شود،
//                    بعد با همان زمان به درگاه برویم، و ثبت نهایی در کال‌بک انجام
//                    شود. اگر onConfirm خطا برگرداند، اسلات انتخابی پاک و برنامه
//                    دوباره خوانده می‌شود تا مراجع وقت تازه‌ای ببیند.
//
// ⚠️ redirecting: وقتی onConfirm دارد مرورگر را به جای دیگری (درگاه) می‌فرستد،
// باید `{ ok: true, redirecting: true }` برگرداند و این کامپوننت هیچ کاری نکند
// — نه onDone، نه بسته‌شدن. دلیلش useModalBackClose است: موقع بسته‌شدن مودال یک
// history.back() می‌زند تا ورودی‌ای که خودش به تاریخچه اضافه کرده مصرف شود، و
// همان history.back() ناوبری در حال انجام به درگاه را **لغو می‌کند** — بدون هیچ
// خطایی. علامتش این است که مراجع وقت را انتخاب می‌کند، هیچ اتفاقی نمی‌افتد و به
// همین صفحه برمی‌گردد. پس در حالت redirecting مودال عمدا باز و در حالت لودینگ
// می‌ماند تا خود مرورگر صفحه را ترک کند.

// حداقل چیزی که این کامپوننت از یک جلسه لازم دارد (نه کل تایپ Session صفحه‌ها)
export type SlotPickerSession = {
  id: string
  session_type?: string
}

export type SlotConfirmResult = { ok: boolean; error?: string; redirecting?: boolean }

// ==================== SLOT PICKER (تک‌جلسه‌ای) ====================
export default function SlotPicker({ session, phone, caseNumber, onClose, onDone, title = 'انتخاب زمان جلسه', confirmLabel = 'ثبت زمان جلسه', onConfirm, resourceId, sessionType, officeLocation }: {
 session?: SlotPickerSession; phone: string; caseNumber: string; onClose: () => void; onDone: () => void
 title?: string; confirmLabel?: string; onConfirm?: (date: string, time: string) => Promise<SlotConfirmResult>
 resourceId?: string | null
 // نوع جلسه (آنلاین/حضوری) وقتی `session` در دست نیست (مثلا مراحل پیش‌ازدرمان) —
 // هم برای فیلترکردن اسلات‌ها هم برای نمایش واضح به مراجع که این وقت مال کدام نوع است
 sessionType?: 'online' | 'offline'
 officeLocation?: string
}) {
 const { slug } = useParams<{ slug: string }>()
 useModalBackClose(true, onClose)
 // ماژول لیست انتظار — اگر برای این مجموعه خاموش باشد، دکمه‌ی «افزودن به لیست
 // انتظار» اصلا نشان داده نمی‌شود (سرورش هم از فاز 2 گیت شده). fail-open.
 const patientFeatures = usePatientFeatures(slug)
 const waitlistOn = moduleOn(patientFeatures, 'waitlist')
 const today = getCurrentJalali()
 const [curMonth, setCurMonth] = useState(today.month)
 const [curYear, setCurYear] = useState(today.year)
 const [schedule, setSchedule] = useState<Record<string, string[]>>({})
 const [slotTypes, setSlotTypes] = useState<Record<string, Record<string, string>>>({})
 const [selectedDay, setSelectedDay] = useState<number | null>(null)
 const [selectedSlot, setSelectedSlot] = useState<string>('')
 const [saving, setSaving] = useState(false)
 const [loadingSched, setLoadingSched] = useState(true)
 const [waitlistJoined, setWaitlistJoined] = useState(false)
 const [waitlistJoining, setWaitlistJoining] = useState(false)

 async function joinWaitlist() {
  if (!resourceId) return
  setWaitlistJoining(true)
  const res = await fetch(`/api/t/${slug}/psy/waitlist`, {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ case_number: caseNumber, resource_id: resourceId, session_type: session?.session_type || sessionType }),
  })
  setWaitlistJoining(false)
  if (res.ok) setWaitlistJoined(true)
  else uiAlert('ثبت در لیست انتظار ناموفق بود')
 }

 useEffect(() => { loadSchedule(curMonth, curYear) }, [curMonth, curYear])

 async function loadSchedule(month: number, year: number) {
  setLoadingSched(true)
  const rq = resourceId ? `&resource_id=${resourceId}` : ''
  const res = await fetch(`/api/t/${slug}/psy/schedule?year=${year}&month=${month + 1}${rq}`, { cache: 'no-store' })
  const data = await res.json()
  const map: Record<string, string[]> = {}
  const types: Record<string, Record<string, string>> = {}
  for (const s of data.schedules || []) {
   const day = parseInt(s.date.split('/')[2]).toString()
   if (!s.is_off && s.available_times?.length > 0) { map[day] = s.available_times; types[day] = s.slot_types || {} }
  }
  setSchedule(map)
  setSlotTypes(types)
  setLoadingSched(false)
 }

 function changeMonth(dir: number) {
  let m = curMonth + dir, y = curYear
  if (m < 0) { m = 11; y-- }
  if (m > 11) { m = 0; y++ }
  setCurMonth(m); setCurYear(y); setSelectedDay(null); setSelectedSlot('')
 }

 async function confirm() {
  if (!selectedDay || !selectedSlot) return
  setSaving(true)
  const date = `${curYear}/${curMonth + 1}/${selectedDay}`
  if (onConfirm) {
   const r = await onConfirm(date, selectedSlot)
   // مرورگر دارد به درگاه می‌رود — دست به هیچ‌چیز نزن. بستن مودال این‌جا یعنی
   // history.back() هوک، که ناوبری در حال انجام را بی‌صدا لغو می‌کند. عمدا در
   // حالت saving می‌مانیم تا مراجع لودینگ ببیند و صفحه ترک شود.
   if (r.ok && r.redirecting) return
   setSaving(false)
   if (!r.ok) { uiAlert(r.error || 'ثبت نشد'); setSelectedSlot(''); loadSchedule(curMonth, curYear); return }
   onDone()
   return
  }
  const res = await fetch(`/api/t/${slug}/psy/schedule-one`, {
   method: 'POST', headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
    session_id: session!.id, case_number: caseNumber, phone,
    session_date: date, session_time: selectedSlot
   })
  })
  const data = await res.json().catch(() => ({}))
  setSaving(false)
  if (!res.ok) { uiAlert(data.error || 'ثبت نشد'); setSelectedSlot(''); loadSchedule(curMonth, curYear); return }
  onDone()
 }

 const daysInMonth = getDaysInJalaliMonth(curYear, curMonth)
 // آفست شروع ماه (چند خانه‌ی خالی قبل از روز 1) — باید هر ماه دوباره محاسبه
 // شود، چون هر ماه با روز هفته‌ی متفاوتی شروع می‌شود. curMonth این‌جا
 // صفرپایه است (فروردین=0)، ولی jalaliWeekday ماه یک‌پایه می‌خواهد، پس +1.
 const startDay = jalaliWeekday(curYear, curMonth + 1, 1)
 const isPastDay = (d: number) =>
  curYear < today.year || (curYear === today.year && (curMonth < today.month || (curMonth === today.month && d <= today.day)))
 const slotsForDay = (d: number) => {
  const base = schedule[String(d)] || []
  const dayTypes = slotTypes[String(d)] || {}
  const want = session?.session_type || sessionType // 'online' | 'offline' | undefined
  return base.filter(t => {
   const ts = jalaliDateTimeToTimestamp(`${curYear}/${curMonth + 1}/${d}`, t)
   if (!(ts === null || ts > Date.now())) return false
   // اسلات بدون نوع برای هر دو آزاد است؛ در غیر این صورت باید با نوع جلسه بخواند
   const st = dayTypes[t]
   return !want || !st || st === want
  })
 }
 const availDays = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  .filter(d => !isPastDay(d) && slotsForDay(d).length > 0)

 return (
  <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center sm:p-4" dir="rtl">
   <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
    <div className="flex items-center justify-between p-4 border-b border-sand sticky top-0 bg-white">
     <h3 className="text-sm font-display font-semibold text-ink">{title}</h3>
     <button onClick={onClose} className="text-soot text-lg leading-none">✕</button>
    </div>
    {(session?.session_type || sessionType) && (
     <div className="px-4 pt-3 space-y-2">
      <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-sand text-ink border border-sand">
       {(session?.session_type || sessionType) === 'online' ? '🎥 این جلسه آنلاین است' : `🏥 این جلسه حضوری است${officeLocation ? ` — ${officeLocation}` : ''}`}
      </span>
      {(session?.session_type || sessionType) === 'offline' && (
       <p className="text-[11px] text-soot leading-5">
        ⏱ ساعت انتخابی تقریبی است؛ ممکن است جلسه چند دقیقه با تاخیر شروع شود. سعی می‌شود همان سر ساعت اعلام‌شده رعایت شود.
       </p>
      )}
     </div>
    )}
    <div className="p-4">
     <div className="flex items-center justify-between mb-4">
      <button onClick={() => changeMonth(-1)} className="w-8 h-8 border border-sand rounded-lg text-soot">›</button>
      <span className="text-sm font-medium text-ink">{PERSIAN_MONTHS[curMonth]} {toFarsiNum(curYear)}</span>
      <button onClick={() => changeMonth(1)} className="w-8 h-8 border border-sand rounded-lg text-soot">‹</button>
     </div>
     <div className="grid grid-cols-7 gap-1 mb-2">
      {PERSIAN_WEEKDAYS_FULL.map(d => <div key={d} className="text-center text-[10px] leading-tight text-soot py-1">{d}</div>)}
     </div>
     <div className="grid grid-cols-7 gap-1 mb-4">
      {Array(startDay).fill(null).map((_, i) => <div key={i} />)}
      {Array(daysInMonth).fill(null).map((_, i) => {
       const d = i + 1
       const hasSlot = !loadingSched && availDays.includes(d)
       const isSel = selectedDay === d
       return (
        <div key={d} onClick={() => { if (hasSlot) { setSelectedDay(d); setSelectedSlot('') } }}
         className={`text-center py-2 rounded-lg text-sm ${hasSlot ? 'cursor-pointer hover:bg-sand' : 'text-gray-300'} ${isSel ? 'bg-sand text-ink font-medium' : 'text-ink'}`}>
         {toFarsiNum(d)}
         {hasSlot && <span className="block w-1 h-1 rounded-full bg-emerald-500 mx-auto mt-0.5" />}
        </div>
       )
      })}
     </div>
     {loadingSched && (
      <p className="text-center text-xs text-soot mb-4">در حال بارگذاری برنامه...</p>
     )}
     {!loadingSched && availDays.length === 0 && (
      <div className="text-center mb-4">
       <p className="text-xs text-soot mb-2">برای این ماه ساعت آزادی موجود نیست.</p>
       {resourceId && waitlistOn && !waitlistJoined && (
        <button onClick={joinWaitlist} disabled={waitlistJoining}
         className="text-xs px-4 py-2 border border-ink text-ink rounded-lg hover:bg-sand disabled:opacity-40">
         {waitlistJoining ? 'در حال ثبت...' : '+ افزودن به لیست انتظار'}
        </button>
       )}
       {waitlistJoined && <p className="text-xs text-emerald-600">به لیست انتظار اضافه شدید — هروقت ظرفیتی باز شد به شما خبر می‌دهیم.</p>}
      </div>
     )}
     {selectedDay && (
      <div className="grid grid-cols-3 gap-2 mb-4">
       {slotsForDay(selectedDay).map(slot => (
        <div key={slot} onClick={() => setSelectedSlot(slot)}
         className={`text-center py-2 border rounded-lg text-sm cursor-pointer ${selectedSlot === slot ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 font-medium' : 'border-sand text-soot'}`}>
         {selectedSlot === slot && '✓ '}{slot}
        </div>
       ))}
      </div>
     )}
     <button onClick={confirm} disabled={!selectedDay || !selectedSlot || saving}
      className="w-full py-3 bg-accent text-white rounded-xl text-sm font-medium disabled:opacity-40">
      {saving ? (onConfirm ? 'در حال اتصال...' : 'در حال ثبت...') : confirmLabel}
     </button>
    </div>
   </div>
  </div>
 )
}
