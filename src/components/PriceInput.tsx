'use client'
// ─────────────────────────────────────────────────────────────────────────────
// ورودی مبلغ با ممیز جداکننده‌ی هزارگان، زنده حین تایپ (50000 → 50,000).
//
// چرا یک کامپوننت جدا لازم بود: <input type="number"> ذاتا کاما را رد می‌کند
// (مقدارش باید یک رشته‌ی عددی خالص باشد)، پس امکان نمایش جداکننده حین تایپ
// در آن وجود ندارد. اینجا از type="text" با inputMode="numeric" استفاده شده
// (کیبورد گوشی همچنان عددی می‌ماند) و خودمان جداکننده را اضافه/حذف می‌کنیم.
//
// همان فرمت (`toLocaleString('en-US')`) که قبلا فقط برای *نمایش* مبالغ در کل
// پروژه استفاده می‌شد (money() در PatientsTab/FinanceTab/PsychologyAdmin/...)
// اینجا برای *ورودی* هم به کار رفته، تا شکل عدد در همه‌جا یکسان بماند.
//
// ورودی فارسی هم پذیرفته می‌شود (رقم فارسی حین تایپ) و به لاتین نرمال می‌شود؛ چیزی که در
// state/فراخوانی onChange می‌رود همیشه یک عدد لاتین خالص است — مطابق قرارداد
// پروژه (ارقام لاتین در همه‌ی خروجی‌ها).
// ─────────────────────────────────────────────────────────────────────────────
import { toLatinNum } from '@/lib/calendar'

export default function PriceInput({
  value, onChange, placeholder, className, min = 0,
}: {
  value: number
  onChange: (n: number) => void
  placeholder?: string
  className?: string
  min?: number
}) {
  const display = Number.isFinite(value) ? value.toLocaleString('en-US') : ''

  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      value={display}
      onChange={e => {
        const digitsOnly = toLatinNum(e.target.value).replace(/[^\d]/g, '')
        const n = digitsOnly ? parseInt(digitsOnly, 10) : 0
        onChange(Math.max(min, n))
      }}
      placeholder={placeholder}
      className={className}
    />
  )
}
