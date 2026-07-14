'use client'
// ── ماژول «روزهای کاری» — پنجمین تب جداشده از PsychologyAdmin (فاز 4) ────────
// تنیده‌ترین تب تا این‌جا. مرز جداسازی طبق همان قاعده‌ی ثابت:
//   داخل این فایل: تقویم ماه، ویرایشگر ساعت‌های روز، ذخیره‌ی برنامه، نمای
//   «برنامه‌ی نوبت‌ها» (هفته/ماه) و همه‌ی state محلی‌شان.
//   در والد ماند: allSessions/allStages/bookings و loaderهایشان،
//   apptsForDate (پل داده‌ی مشترک — به‌صورت prop تابعی می‌آید)،
//   cancelAppointment/cancelDay/announceDelay (به fetchAll و loaderهای مشترک
//   گره خورده‌اند)، persistQuickTimes (پروفایل + snapshot والد را می‌سازد).
// پرش «مشاهده‌ی همه» از داشبورد با prop یک‌بارمصرف jump/onJumpConsumed
// انجام می‌شود (والد فقط درخواست را ثبت می‌کند، این‌جا اجرا می‌شود).
import { useState, useEffect } from 'react'
import { toFarsiNum, toLatinNum, getCurrentJalali, getDaysInJalaliMonth, jalaliDateTimeToTimestamp, PERSIAN_MONTHS } from '@/lib/calendar'
import { uiAlert } from '@/components/ui/Dialog'
import { PageHeader, timeKey, enTime } from '../shared'

// اعتبارسنجی و نرمال‌سازی ساعت دلخواه واردشده‌ی دکتر (مثلا «9», «9:30», «14:05»)
function parseCustomTime(raw: string): string | null {
 const s = toLatinNum(raw || '').trim()
 const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/)
 if (!m) return null
 const h = parseInt(m[1], 10)
 const min = m[2] ? parseInt(m[2], 10) : 0
 if (h < 0 || h > 23 || min < 0 || min > 59) return null
 return `${h}:${String(min).padStart(2, '0')}`
}

export type SchedAppt = {
 time: string; name: string; type: string; mode?: string; loc?: string; color: string
 kind: 'interview' | 'assessment' | 'custom' | 'session'; id: string; caseNumber: string; delayMinutes?: number | null
}
export type SchedJump = { day: number; month: number; year: number }

export default function ScheduleTab({
 api, resourceQS, resourceId, quickTimes, quickTimesSaving, persistQuickTimes,
 sessionModes, officeLocations, apptsForDate, cancelAppointment, cancelDay,
 announceDelay, onUnauthorized, onSaved, jump, onJumpConsumed,
}: {
 api: (path: string) => string
 resourceQS: string
 resourceId: string | null
 quickTimes: string[]
 quickTimesSaving: boolean
 persistQuickTimes: (next: string[]) => void
 sessionModes: string
 officeLocations: { title: string }[]
 apptsForDate: (dateStr: string) => SchedAppt[]
 cancelAppointment: (appt: SchedAppt) => void
 cancelDay: (dateStr: string, appts: SchedAppt[]) => void
 announceDelay: (appt: SchedAppt) => void
 onUnauthorized: () => void
 onSaved: () => void
 jump: SchedJump | null
 onJumpConsumed: () => void
}) {
 const today = getCurrentJalali()
 const [schedMonth, setSchedMonth] = useState(jump?.month ?? today.month)
 const [schedYear, setSchedYear] = useState(jump?.year ?? today.year)
 const [selectedDay, setSelectedDay] = useState<number | null>(null)
 const [selectedTimes, setSelectedTimes] = useState<string[]>([])
 const [slotTypes, setSlotTypes] = useState<Record<string, 'online' | 'offline'>>({})
 const [slotLocs, setSlotLocs] = useState<Record<string, string>>({})
 const [customTime, setCustomTime] = useState('')
 const [removeTimeMode, setRemoveTimeMode] = useState(false)
 const [isOff, setIsOff] = useState(false)
 const [schedSaving, setSchedSaving] = useState(false)
 const [schedSaved, setSchedSaved] = useState(false)
 const [schedSubTab, setSchedSubTab] = useState<'edit' | 'agenda'>('edit')
 const [agendaMode, setAgendaMode] = useState<'month' | 'week'>('week')
 const [weekIdx, setWeekIdx] = useState(0)
 const [monthSchedules, setMonthSchedules] = useState<{ date: string; available_times: string[]; is_off: boolean; slot_types?: Record<string, string>; slot_locs?: Record<string, string> }[]>([])

 const daysInMonth = getDaysInJalaliMonth(schedYear, schedMonth)
 const schedForDay = (d: number) => monthSchedules.find(s => s.date === `${schedYear}/${schedMonth + 1}/${d}`)

 // mount: اگر پرش از داشبورد است همان روز را باز کن، وگرنه ماه جاری
 useEffect(() => {
  if (jump) {
   loadMonthSchedules(jump.month, jump.year)
   selectSchedDay(jump.day, jump.month, jump.year)
   onJumpConsumed()
  } else {
   loadMonthSchedules(schedMonth, schedYear)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [])

 // سوییچ owner بین دکترها (resourceQS عوض می‌شود) → همان رفتار قبلی: ماه دوباره خوانده شود
 useEffect(() => {
  loadMonthSchedules(schedMonth, schedYear)
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [resourceQS])

 function changeMonth(dir: number) {
  let m = schedMonth + dir, y = schedYear
  if (m < 0) { m = 11; y-- }
  if (m > 11) { m = 0; y++ }
  setSchedMonth(m); setSchedYear(y)
  setSelectedDay(null); setSelectedTimes([]); setIsOff(false)
  setWeekIdx(0)
  loadMonthSchedules(m, y)
 }

 // برنامه‌ی کل ماه را بخوان تا روزهای تقویم رنگی شوند
 async function loadMonthSchedules(month: number, year: number) {
  try {
   const res = await fetch(api(`/schedule?year=${year}&month=${month + 1}${resourceQS}`), { cache: 'no-store' })
   const data = await res.json()
   setMonthSchedules(data.schedules || [])
  } catch {}
 }

 async function saveSchedule() {
  if (!selectedDay) return
  setSchedSaving(true)
  const date = `${schedYear}/${schedMonth + 1}/${selectedDay}`
  // نوع هر اسلات: هر اسلات یک نوع مشخص دارد (آنلاین یا یکی از مطب‌ها) — «هردو» حذف شد
  const mode = sessionModes
  const offlineLocs = officeLocations
  const firstLoc = offlineLocs[0]?.title
  const outTypes: Record<string, string> = {}
  const outLocs: Record<string, string> = {}
  for (const t of selectedTimes) {
   if (mode === 'online') outTypes[t] = 'online'
   else if (mode === 'offline') {
    outTypes[t] = 'offline'
    const loc = slotLocs[t] || firstLoc
    if (loc) outLocs[t] = loc
   } else {
    // حالت «هردو» در تنظیمات: دکتر برای هر اسلات آنلاین یا یک مطب را انتخاب می‌کند
    if (slotTypes[t] === 'offline') {
     outTypes[t] = 'offline'
     const loc = slotLocs[t] || firstLoc
     if (loc) outLocs[t] = loc
    } else {
     // پیش‌فرض یا انتخاب صریح آنلاین
     outTypes[t] = 'online'
    }
   }
  }
  try {
   const res = await fetch(api('/schedule'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     date, available_times: selectedTimes, is_off: isOff, slot_types: outTypes, slot_locs: outLocs,
     ...(resourceId ? { resource_id: resourceId } : {}),
    }),
   })
   setSchedSaving(false)
   if (res.status === 401) { uiAlert('نشست شما منقضی شده. دوباره وارد شوید.'); onUnauthorized(); return }
   if (!res.ok) {
    // متن واقعی پاسخ را بخوان (اگر JSON نبود، احتمالا بلاک سطح سرور/فایروال است)
    const raw = await res.text().catch(() => '')
    let msg = ''
    try { msg = JSON.parse(raw).error || '' } catch {}
    if (res.status === 403 && !msg) {
     uiAlert('ذخیره نشد (403). این خطا از خود برنامه نیست؛ درخواست توسط فایروال Vercel بلاک شده. در پنل Vercel → Firewall، گزینه‌ی «Attack Challenge Mode» را خاموش کن (یا Deployment Protection را بررسی کن).')
    } else {
     uiAlert(`ذخیره نشد (کد ${res.status}): ${msg || raw.slice(0, 200) || 'خطای ناشناخته'}`)
    }
    return
   }
   setSchedSaved(true)
   setTimeout(() => setSchedSaved(false), 2000)
   // بعد از ذخیره، همان روز و کل ماه را دوباره بخوان + رزروها را تازه کن
   selectSchedDay(selectedDay)
   loadMonthSchedules(schedMonth, schedYear)
   onSaved()
  } catch (e: any) {
   setSchedSaving(false)
   uiAlert('خطای شبکه: ' + (e?.message || e))
  }
 }

 // با کلیک روی هر روز، ساعت‌های ذخیره‌شده‌اش را بارگذاری کن تا ویرایش درست باشد
 async function selectSchedDay(d: number, month = schedMonth, year = schedYear) {
  setSelectedDay(d)
  setSelectedTimes([])
  setSlotTypes({})
  setSlotLocs({})
  setIsOff(false)
  setCustomTime('')
  const date = `${year}/${month + 1}/${d}`
  try {
   const res = await fetch(api(`/schedule?date=${date}${resourceQS}`), { cache: 'no-store' })
   const data = await res.json()
   if (data.schedule) {
    setSelectedTimes(data.schedule.available_times || [])
    setSlotTypes(data.schedule.slot_types || {})
    setSlotLocs(data.schedule.slot_locs || {})
    setIsOff(data.schedule.is_off || false)
   }
  } catch {}
 }

 return (
     <div className="max-w-2xl mx-auto">
      <PageHeader title="روزهای کاری" desc="روزها و ساعت‌های در دسترس را تنظیم کنید و برنامه‌ی نوبت‌ها را ببینید." />
      {/* زیرتب‌ها */}
      <div className="flex bg-white rounded-xl border border-sand p-1 mb-4">
       {([['edit', 'تنظیم روزها'], ['agenda', 'برنامه‌ی نوبت‌ها']] as const).map(([k, label]) => (
        <button key={k} onClick={() => setSchedSubTab(k)}
         className={`flex-1 text-sm py-2 rounded-lg font-medium transition-all ${schedSubTab === k ? 'bg-ink text-white' : 'text-soot'}`}>
         {label}
        </button>
       ))}
      </div>

      {/* نوار ماه (مشترک) */}
      <div className="bg-white rounded-2xl border border-sand p-3 mb-4 flex items-center justify-between gap-2">
       <button onClick={() => changeMonth(-1)} className="px-3 py-1.5 border border-sand rounded-lg text-xs text-soot hover:bg-gray-50 shrink-0">قبلی</button>
       <h2 className="text-sm sm:text-base font-display font-medium text-ink text-center">{PERSIAN_MONTHS[schedMonth]} {toFarsiNum(schedYear)}</h2>
       <button onClick={() => changeMonth(1)} className="px-3 py-1.5 border border-sand rounded-lg text-xs text-soot hover:bg-gray-50 shrink-0">بعدی</button>
      </div>

      {/* ════ نمای تنظیم روزها ════ */}
      {schedSubTab === 'edit' && (
       <>
        {/* راهنمای رنگ‌ها */}
        <div className="flex items-center justify-center gap-4 text-xs text-soot mb-3">
         <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/15 border border-emerald-500/40" /> روز کاری</span>
         <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> نوبت رزروشده</span>
        </div>

        <div className="bg-white rounded-2xl border border-sand p-5 mb-4">
         <div className="grid grid-cols-7 gap-1 mb-2">
          {['ش','ی','د','س','چ','پ','ج'].map(d => (
           <div key={d} className="text-center text-xs text-soot py-1">{d}</div>
          ))}
         </div>
         <div className="grid grid-cols-7 gap-1">
          {Array(2).fill(null).map((_, i) => <div key={i} />)}
          {Array(daysInMonth).fill(null).map((_, i) => {
           const d = i + 1
           const isPast = schedYear === today.year && schedMonth === today.month && d < today.day
           const sched = schedForDay(d)
           const totalSlots = sched?.available_times?.length || 0
           const dateStr = `${schedYear}/${schedMonth + 1}/${d}`
           const booked = apptsForDate(dateStr).length
           const isSel = selectedDay === d
           return (
            <div key={d}
             onClick={() => { if (!isPast) selectSchedDay(d) }}
             className={`relative text-center py-2.5 rounded-lg text-sm transition-all
              ${isPast ? 'text-gray-300 cursor-default' : 'cursor-pointer'}
              ${isSel ? 'ring-2 ring-ink font-medium' : ''}
              ${!isPast && totalSlots > 0 ? 'bg-emerald-500/10 text-emerald-700' : ''}
              ${!isPast && totalSlots === 0 ? 'text-soot hover:bg-gray-50' : ''}`}>
             {toFarsiNum(d)}
             {!isPast && totalSlots > 0 && (
              <span className="block text-[10px] mt-0.5 text-emerald-600">{toFarsiNum(totalSlots)} ساعت</span>
             )}
             {booked > 0 && (
              <span className="absolute top-1 left-1 w-4 h-4 bg-amber-100 text-amber-800 text-[10px] rounded-full flex items-center justify-center font-bold leading-none">{toFarsiNum(booked)}</span>
             )}
            </div>
           )
          })}
         </div>
        </div>

        {selectedDay && (
         <div className="bg-white rounded-2xl border border-sand p-5">
          <h3 className="text-sm font-medium text-ink mb-1">
           ساعات کاری — {toFarsiNum(selectedDay)} {PERSIAN_MONTHS[schedMonth]}
          </h3>
          <p className="text-xs text-soot mb-4">ساعت‌هایی که نوبت می‌دهی را انتخاب کن. اگر هیچ ساعتی انتخاب نکنی، آن روز تعطیل محسوب می‌شود.</p>
          {sessionModes === 'both' && (
           <p className="text-[11px] text-soot mb-3">روی نوع هر ساعت بزن تا بین آنلاین و مطب‌های حضوری جابجا شود. هر ساعت یک نوع مشخص دارد.</p>
          )}
          {sessionModes === 'offline' && officeLocations.length > 1 && (
           <p className="text-[11px] text-soot mb-3">روی هر ساعت بزن تا بین مطب‌ها جابجا شود.</p>
          )}

          {/* افزودن/حذف ساعت از لیست سریع این دکتر — این لیست برای همه‌ی روزها مشترک است */}
          <div className="flex items-center gap-2 mb-1.5">
           <input value={customTime} onChange={e => setCustomTime(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') {
             const t = parseCustomTime(customTime)
             if (!t) { uiAlert('ساعت نامعتبر است — مثال: 9:30 یا 14:00'); return }
             if (!quickTimes.includes(t)) persistQuickTimes([...quickTimes, t])
             if (!selectedTimes.includes(t)) setSelectedTimes(prev => [...prev, t])
             setCustomTime('')
            }}}
            placeholder="ساعت دلخواه (مثلا 9:30)"
            className="flex-1 text-sm px-3 py-2 border border-sand rounded-xl" dir="ltr" />
           <button onClick={() => {
             const t = parseCustomTime(customTime)
             if (!t) { uiAlert('ساعت نامعتبر است — مثال: 9:30 یا 14:00'); return }
             if (!quickTimes.includes(t)) persistQuickTimes([...quickTimes, t])
             if (!selectedTimes.includes(t)) setSelectedTimes(prev => [...prev, t])
             setCustomTime('')
            }}
            disabled={quickTimesSaving}
            className="px-4 py-2 border border-sand text-ink rounded-xl text-sm font-medium hover:bg-sand shrink-0 disabled:opacity-50">
            افزودن
           </button>
           <button onClick={() => setRemoveTimeMode(v => !v)}
            disabled={quickTimesSaving}
            className={`px-4 py-2 border rounded-xl text-sm font-medium shrink-0 disabled:opacity-50 ${removeTimeMode ? 'bg-ink border-ink text-white' : 'border-sand text-ink hover:bg-gray-100'}`}>
            حذف
           </button>
          </div>
          {removeTimeMode && (
           <p className="text-[11px] text-ink mb-3">هر ساعتی را که می‌خواهی از لیست گزینه‌ها کامل حذف کنی، لمس کن. برای خروج از این حالت، دوباره «حذف» را بزن.</p>
          )}

          <div className="grid grid-cols-3 gap-2 mb-4">
           {Array.from(new Set([...quickTimes, ...selectedTimes])).sort((a, b) => timeKey(a) - timeKey(b)).map(t => {
            const dateStr = `${schedYear}/${schedMonth + 1}/${selectedDay}`
            const takenBy = apptsForDate(dateStr).find(a => a.time === t)
            const slotTs = jalaliDateTimeToTimestamp(dateStr, t)
            const isPastTime = slotTs !== null && slotTs <= Date.now()
            const selected = selectedTimes.includes(t)
            const locked = !!takenBy || isPastTime
            const mode = sessionModes
            const offlineLocs = officeLocations
            // گزینه‌های ممکن برای این اسلات (بدون «هردو» — هر اسلات یک نوع مشخص دارد)
            type Opt = { kind: 'online' | 'offline'; loc?: string; label: string }
            const opts: Opt[] = []
            if (mode === 'both' || mode === 'online') opts.push({ kind: 'online', label: 'آنلاین' })
            if (mode === 'both' || mode === 'offline') {
             if (offlineLocs.length <= 1) opts.push({ kind: 'offline', loc: offlineLocs[0]?.title, label: `${offlineLocs[0]?.title || 'حضوری'}` })
             else offlineLocs.forEach(l => opts.push({ kind: 'offline', loc: l.title, label: `${l.title}` }))
            }
            const fixed = opts.length === 1
            const curKind = slotTypes[t] === 'offline' ? 'offline' : slotTypes[t] === 'online' ? 'online' : ''
            const curLoc = slotLocs[t]
            let curIdx = opts.findIndex(o => o.kind === curKind && (o.kind !== 'offline' || (o.loc || '') === (curLoc || '')))
            if (curIdx < 0) curIdx = 0 // پیش‌فرض: اولین گزینه
            const curLabel = opts[curIdx]?.label
            const setOpt = (o: Opt) => {
             setSlotTypes(prev => ({ ...prev, [t]: o.kind }))
             setSlotLocs(prev => { const n = { ...prev }; if (o.kind === 'offline' && o.loc) n[t] = o.loc; else delete n[t]; return n })
            }
            const cycle = (ev: { stopPropagation: () => void }) => {
             ev.stopPropagation()
             setOpt(opts[(curIdx + 1) % opts.length])
            }
            const removeThisTime = () => {
             if (quickTimes.includes(t)) persistQuickTimes(quickTimes.filter(x => x !== t))
             setSelectedTimes(prev => prev.filter(x => x !== t))
             setSlotTypes(st => { const n = { ...st }; delete n[t]; return n })
             setSlotLocs(sl => { const n = { ...sl }; delete n[t]; return n })
            }
            return (
             <div key={t}
              onClick={() => {
               if (removeTimeMode) { removeThisTime(); return }
               if (locked) return
               if (selected) {
                setSelectedTimes(prev => prev.filter(x => x !== t))
                setSlotTypes(st => { const n = { ...st }; delete n[t]; return n })
                setSlotLocs(sl => { const n = { ...sl }; delete n[t]; return n })
               } else {
                setSelectedTimes(prev => [...prev, t])
                setOpt(opts[0]) // پیش‌فرض: اولین گزینه (بدون «هردو»)
               }
              }}
              className={`relative text-center py-2 border rounded-xl text-sm transition-all
               ${removeTimeMode ? 'cursor-pointer border-sand bg-gray-100 text-ink hover:bg-gray-200' :
                isPastTime ? 'border-sand bg-gray-50 text-gray-300 cursor-not-allowed line-through' :
                takenBy ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 cursor-not-allowed' :
                'cursor-pointer ' + (selected ? 'border-ink bg-sand text-ink font-medium' : 'border-sand text-soot hover:border-gray-300')}`}>
              {enTime(t)}
              {!removeTimeMode && takenBy && !isPastTime && <span className="block text-[10px] mt-0.5">🔒 {takenBy.name}</span>}
              {!removeTimeMode && selected && !locked && (
               fixed
                ? <span className="block text-[10px] mt-1 text-ink">{opts[0]?.label}</span>
                : <button onClick={cycle}
                  className="block w-full text-[10px] mt-1 text-ink bg-white/70 border border-sand rounded py-0.5 hover:bg-white truncate">{curLabel}</button>
              )}
             </div>
            )
           })}
          </div>
          <button onClick={saveSchedule} disabled={schedSaving}
           className="w-full py-3 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-ink/90 transition-colors">
           {schedSaving ? 'در حال ذخیره...' : schedSaved ? 'ذخیره شد!' : 'ذخیره برنامه'}
          </button>
         </div>
        )}
       </>
      )}

      {/* ════ نمای برنامه‌ی نوبت‌ها ════ */}
      {schedSubTab === 'agenda' && (
       <div className="space-y-3">
        {/* تاگل هفتگی/ماهانه */}
        <div className="flex bg-white rounded-xl border border-sand p-1">
         {([['week', 'هفتگی'], ['month', 'ماهانه']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setAgendaMode(k)}
           className={`flex-1 text-sm py-1.5 rounded-lg font-medium transition-all ${agendaMode === k ? 'bg-ink text-white' : 'text-soot'}`}>
           {label}
          </button>
         ))}
        </div>

        {(() => {
         const WEEK = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']
         // مرز هفته‌ها (شنبه‌ها در روزهای 6، 13، 20، 27 شروع می‌شوند؛ هفته‌ی اول 1 تا 5)
         const weekStarts = [1, 6, 13, 20, 27].filter(s => s <= daysInMonth)
         const wIdx = Math.min(weekIdx, weekStarts.length - 1)
         let rangeStart = 1, rangeEnd = daysInMonth
         if (agendaMode === 'week') {
          rangeStart = weekStarts[wIdx]
          rangeEnd = (weekStarts[wIdx + 1] ? weekStarts[wIdx + 1] - 1 : daysInMonth)
         }

         const days = []
         for (let d = rangeStart; d <= rangeEnd; d++) {
          const dateStr = `${schedYear}/${schedMonth + 1}/${d}`
          const sched = schedForDay(d)
          const appts = apptsForDate(dateStr)
          const slotTimes = sched?.available_times || []
          const extra = appts.map(a => a.time).filter(t => !slotTimes.includes(t))
          const allTimes = Array.from(new Set([...slotTimes, ...extra])).sort((a, b) => timeKey(a) - timeKey(b))
          if (allTimes.length === 0) continue
          days.push({ d, dateStr, appts, allTimes, weekday: WEEK[(d + 1) % 7] })
         }

         return (
          <>
           {agendaMode === 'week' && (
            <div className="flex items-center justify-between bg-white rounded-xl border border-sand px-3 py-2 gap-2">
             <button onClick={() => setWeekIdx(i => Math.max(0, i - 1))} disabled={wIdx === 0}
              className="px-3 py-1.5 border border-sand rounded-lg text-xs text-soot disabled:opacity-30 shrink-0">قبلی</button>
             <span className="text-xs text-soot text-center">هفته‌ی {toFarsiNum(wIdx + 1)} — {toFarsiNum(rangeStart)} تا {toFarsiNum(rangeEnd)} {PERSIAN_MONTHS[schedMonth]}</span>
             <button onClick={() => setWeekIdx(i => Math.min(weekStarts.length - 1, i + 1))} disabled={wIdx >= weekStarts.length - 1}
              className="px-3 py-1.5 border border-sand rounded-lg text-xs text-soot disabled:opacity-30 shrink-0">بعدی</button>
            </div>
           )}

           {days.length === 0 ? (
            <div className="text-center py-16 text-soot bg-white rounded-2xl border border-sand">
             {agendaMode === 'week' ? 'برای این هفته روز کاری‌ای تنظیم نشده است.' : 'برای این ماه روز کاری‌ای تنظیم نشده است.'}
            </div>
           ) : days.map(({ d, appts, allTimes, weekday }) => (
            <div key={d} className="bg-white rounded-2xl border border-sand p-4">
             <div className="flex items-center justify-between mb-3 pb-2 border-b border-sand">
              <span className="text-sm font-semibold text-ink">{weekday} {toFarsiNum(d)} {PERSIAN_MONTHS[schedMonth]}</span>
              <div className="flex items-center gap-2">
               <span className="text-xs text-soot">{toFarsiNum(appts.length)} از {toFarsiNum(allTimes.length)} رزرو</span>
               {appts.length > 0 && (
                <button onClick={() => cancelDay(`${schedYear}/${schedMonth + 1}/${d}`, appts)}
                 className="text-xs px-2 py-0.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5">لغو روز</button>
               )}
              </div>
             </div>
             <div className="space-y-1.5">
              {allTimes.map(t => {
               const appt = appts.find(a => a.time === t)
               const slotType = schedForDay(d)?.slot_types?.[t]
               const slotLoc = schedForDay(d)?.slot_locs?.[t]
               const slotTypeLabel = slotType === 'online' ? 'آنلاین' : slotType === 'offline' ? `${slotLoc || 'حضوری'}` : 'خالی'
               return (
                <div key={t} className="flex items-center gap-3 text-sm">
                 <span className="font-mono text-xs text-soot w-12 shrink-0">{enTime(t)}</span>
                 {appt ? (
                  <span className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs ${appt.color}`}>
                   <span className="font-medium">{appt.mode === 'online' ? '🎥 ' : appt.mode === 'offline' ? '🏥 ' : ''}{appt.name}</span>
                   <span className="flex items-center gap-2">
                    <span className="opacity-75">{appt.type}{appt.loc ? ` — ${appt.loc}` : ''}</span>
                    {!!appt.delayMinutes && (
                     <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded font-medium">⏱ {toFarsiNum(appt.delayMinutes)} د تاخیر</span>
                    )}
                    <button onClick={() => announceDelay(appt)}
                     className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-amber-600 hover:bg-amber-500/20">⏱ تاخیر</button>
                    <button onClick={() => cancelAppointment(appt)}
                     className="px-1.5 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-red-600 hover:bg-red-500/20">لغو</button>
                   </span>
                  </span>
                 ) : (
                  <span className="flex-1 px-3 py-1.5 rounded-lg border border-dashed border-sand text-xs text-gray-300">{slotTypeLabel}</span>
                 )}
                </div>
               )
              })}
             </div>
            </div>
           ))}
          </>
         )
        })()}
       </div>
      )}
     </div>
 )
}
