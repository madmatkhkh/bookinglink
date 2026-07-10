'use client'
// تقویم ماهانه‌ی جلالی عمومی — روزها بی‌درنگ رندر می‌شوند، محتوای هر روز
// (تعداد اسلات و…) از بیرون تزریق می‌شود تا لود آسنکرون تقویم را فلش ندهد.
import { PERSIAN_MONTHS, PERSIAN_WEEKDAYS_SHORT, getDaysInJalaliMonth, jalaliWeekday, toFarsiNum } from '@/lib/calendar'
import { ReactNode } from 'react'

export default function MonthCalendar({
  year, month, onPrev, onNext, renderDay,
}: {
  year: number
  month: number
  onPrev: () => void
  onNext: () => void
  renderDay: (day: number) => ReactNode
}) {
  const days = getDaysInJalaliMonth(year, month)
  const firstWd = jalaliWeekday(year, month, 1) // 0=شنبه

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="w-9 h-9 rounded-xl border border-gray-200 text-gray-500">‹</button>
        <div className="text-sm font-bold">{PERSIAN_MONTHS[month - 1]} {toFarsiNum(year)}</div>
        <button onClick={onNext} className="w-9 h-9 rounded-xl border border-gray-200 text-gray-500">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {PERSIAN_WEEKDAYS_SHORT.map(w => (
          <div key={w} className="text-[11px] text-gray-400 py-1">{w}</div>
        ))}
        {Array.from({ length: firstWd }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => (
          <div key={i + 1}>{renderDay(i + 1)}</div>
        ))}
      </div>
    </div>
  )
}
