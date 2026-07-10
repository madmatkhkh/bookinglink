// ───────────────────────────────────────────────────────────────
// مراحل پیش‌ازدرمان پرونده (جدول psy_stages) — دیگر فلوی هاردکد
// «مصاحبه یک‌بار → ارزیابی یک‌بار» نیست. هر پرونده هر تعداد مرحله از
// هر نوع می‌تواند داشته باشد. هر مرحله این چرخه را طی می‌کند:
//   awaiting_payment → payment_submitted → awaiting_booking → booked
// و بعد از برگزاری (held=true)، دکتر تصمیم می‌گیرد مرحله‌ی بعد چیست.
// ───────────────────────────────────────────────────────────────

export const STAGE_TYPES = ['interview', 'assessment'] as const
export type StageType = typeof STAGE_TYPES[number]

export const STAGE_STATUS = {
  AWAITING_PAYMENT: 'awaiting_payment',
  PAYMENT_SUBMITTED: 'payment_submitted',
  AWAITING_BOOKING: 'awaiting_booking',
  BOOKED: 'booked',
} as const
export type StageStatus = typeof STAGE_STATUS[keyof typeof STAGE_STATUS]

export const STAGE_TYPE_LABEL: Record<string, string> = {
  interview: 'مصاحبه',
  assessment: 'ارزیابی',
}

export const STAGE_STATUS_LABEL: Record<string, string> = {
  [STAGE_STATUS.AWAITING_PAYMENT]: 'منتظر پرداخت',
  [STAGE_STATUS.PAYMENT_SUBMITTED]: 'پرداخت اعلام شد (تأیید کنید)',
  [STAGE_STATUS.AWAITING_BOOKING]: 'منتظر گرفتن وقت',
  [STAGE_STATUS.BOOKED]: 'رزرو شد',
}

// برچسب ترکیبی برای نمایش سریع («مصاحبه: منتظر پرداخت»)
export function stageLabel(stageType: string, status: string): string {
  const t = STAGE_TYPE_LABEL[stageType] || stageType
  const s = STAGE_STATUS_LABEL[status] || status
  return `${t}: ${s}`
}
