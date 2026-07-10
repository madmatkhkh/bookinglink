'use client'
// ─────────────────────────────────────────────────────────────────────────────
// انتخاب‌گر چرخشی (Wheel Picker) — همون سبک کوچیک/مینیمال پیکرهای بومی
// موبایل (اسکرول‌کن، وسط بایسته). جایگزین select/input خام قبلی برای هر جایی
// که تاریخ می‌گیریم.
//
// WheelColumn: یک ستون اسکرول‌پذیر با اسنپ — پایه‌ی همه‌چیز.
// MonthYearWheel: دو ستون (ماه + سال) — برای جاهایی که فقط ماه/سال لازم است
//   (مثل تعریف پروتکل درمان).
// JalaliDateWheel: سه ستون (روز، ماه، سال) — برای تاریخ کامل تولد و مشابه،
//   به‌صورت modal با دکمه‌ی «تأیید»/«انصراف» (دقیقا الگوی پیکر اندروید).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { PERSIAN_MONTHS, toFarsiNum, toLatinNum, getCurrentJalali, getDaysInJalaliMonth } from '@/lib/calendar'

const ITEM_H = 36
const VISIBLE_PAD = 2 // تعداد ردیف خالی بالا/پایین تا اولین/آخرین آیتم هم بتواند وسط بایستد

export function WheelColumn<T extends string | number>({
  items, value, onChange, width = 'w-full',
}: {
  items: T[]; value: T; onChange: (v: T) => void; width?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const programmatic = useRef(false)
  const idx = Math.max(0, items.indexOf(value))

  // وقتی value از بیرون عوض شد (نه از اسکرول خود کاربر)، بدون انیمیشن بپر روی جایگاه درست
  useEffect(() => {
    if (!ref.current) return
    const target = idx * ITEM_H
    if (Math.abs(ref.current.scrollTop - target) > 2) {
      programmatic.current = true
      ref.current.scrollTop = target
      requestAnimationFrame(() => { programmatic.current = false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handleScroll() {
    if (programmatic.current) return
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      if (!ref.current) return
      const raw = Math.round(ref.current.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(items.length - 1, raw))
      ref.current.scrollTo({ top: clamped * ITEM_H, behavior: 'smooth' })
      const v = items[clamped]
      if (v !== value) onChange(v)
    }, 100)
  }

  return (
    <div className={`relative ${width}`}>
      <div className="pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 h-9 border-y border-ink/15 rounded" />
      <div ref={ref} onScroll={handleScroll}
       className="h-[180px] overflow-y-scroll snap-y snap-mandatory [&::-webkit-scrollbar]:hidden"
       style={{ scrollbarWidth: 'none' }}>
       <div style={{ height: ITEM_H * VISIBLE_PAD }} />
       {items.map((it, i) => {
        const dist = Math.abs(i - idx)
        return (
         <div key={String(it)} onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })}
          className="flex items-center justify-center cursor-pointer select-none snap-center"
          style={{ height: ITEM_H, scrollSnapAlign: 'center' }}>
          <span className={`tnum transition-all ${
            dist === 0 ? 'text-ink font-bold text-base'
            : dist === 1 ? 'text-soot text-sm'
            : 'text-gray-300 text-xs'}`}>
           {it}
          </span>
         </div>
        )
       })}
       <div style={{ height: ITEM_H * VISIBLE_PAD }} />
      </div>
    </div>
  )
}

// ── ماه + سال (بدون روز) — برای پروتکل درمان و مشابه ──────────────────────
export function MonthYearWheel({
  month, year, onChange, yearsBack = 3, yearsForward = 1,
}: {
  month: number; year: number; onChange: (m: number, y: number) => void
  yearsBack?: number; yearsForward?: number
}) {
  const cur = getCurrentJalali()
  const years = Array.from({ length: yearsBack + yearsForward + 1 }, (_, i) => cur.year - yearsBack + i)
  return (
   <div className="flex items-center gap-2" dir="rtl">
    <WheelColumn items={PERSIAN_MONTHS} value={PERSIAN_MONTHS[month - 1]}
     onChange={name => onChange(PERSIAN_MONTHS.indexOf(name) + 1, year)} />
    <WheelColumn items={years.map(toFarsiNum)} value={toFarsiNum(year)}
     onChange={y => onChange(month, parseInt(toLatinNum(y)))} />
   </div>
  )
}

function monthItemsLabeled() {
  return PERSIAN_MONTHS.map((label, i) => ({ value: i + 1, label }))
}

// ── تاریخ کامل (روز/ماه/سال) به‌صورت modal — دقیقا الگوی پیکر بومی موبایل:
//    دکمه‌ای که مقدار فعلی را نشان می‌دهد، با لمس یک overlay با سه چرخ +
//    دکمه‌ی «تأیید»/«انصراف» باز می‌شود.
export function JalaliDateWheel({
  value, onChange, placeholder = 'انتخاب تاریخ', yearsBack = 90, yearsForward = 0, label,
}: {
  value: string // 'YYYY/MM/DD' یا خالی
  onChange: (v: string) => void
  placeholder?: string
  yearsBack?: number
  yearsForward?: number
  label?: string
}) {
  const cur = getCurrentJalali()
  const parts = value ? value.split('/').map(s => parseInt(s, 10)) : []
  const [open, setOpen] = useState(false)
  const [y, setY] = useState(parts[0] || cur.year - 20)
  const [m, setM] = useState(parts[1] || cur.month + 1)
  const [d, setD] = useState(parts[2] || cur.day)

  useEffect(() => {
   if (open) {
    const p = value ? value.split('/').map(s => parseInt(s, 10)) : []
    setY(p[0] || cur.year - 20); setM(p[1] || cur.month + 1); setD(p[2] || cur.day)
   }
   // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const years = Array.from({ length: yearsBack + yearsForward + 1 }, (_, i) => cur.year + yearsForward - i)
  const monthOpts = monthItemsLabeled()
  const dayCount = getDaysInJalaliMonth(y, m - 1)
  const dayItems = Array.from({ length: dayCount }, (_, i) => i + 1)
  const safeD = Math.min(d, dayCount)

  const displayValue = value ? `${toFarsiNum(parts[2])} ${PERSIAN_MONTHS[parts[1] - 1]} ${toFarsiNum(parts[0])}` : ''

  function confirm() {
   onChange(`${y}/${String(m).padStart(2, '0')}/${String(safeD).padStart(2, '0')}`)
   setOpen(false)
  }

  return (
   <>
    <button type="button" onClick={() => setOpen(true)}
     className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl bg-white flex items-center justify-between focus:outline-none hover:border-gray-300 transition-colors">
     <span className={displayValue ? 'text-ink' : 'text-soot'}>{displayValue || placeholder}</span>
     <svg viewBox="0 0 24 24" className="w-4 h-4 text-soot shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10.5h17" />
     </svg>
    </button>
    {open && (
     <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60]" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs p-5 shadow-xl" dir="rtl" onClick={e => e.stopPropagation()}>
       {label && <h3 className="text-sm font-display font-semibold text-ink mb-3 text-center">{label}</h3>}
       <div className="flex items-center gap-1.5">
        <WheelColumn items={dayItems.map(toFarsiNum)} value={toFarsiNum(safeD)}
         onChange={v => setD(parseInt(toLatinNum(v)))} />
        <WheelColumn items={monthOpts.map(o => o.label)} value={PERSIAN_MONTHS[m - 1]}
         onChange={label => setM(monthOpts.find(o => o.label === label)!.value)} />
        <WheelColumn items={years.map(toFarsiNum)} value={toFarsiNum(y)}
         onChange={v => setY(parseInt(toLatinNum(v)))} />
       </div>
       <div className="flex gap-2 mt-4">
        <button onClick={() => setOpen(false)} className="flex-1 py-2.5 border border-sand text-soot rounded-xl text-sm">انصراف</button>
        <button onClick={confirm} className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium">تأیید</button>
       </div>
      </div>
     </div>
    )}
   </>
  )
}
