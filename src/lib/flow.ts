// ───────────────────────────────────────────────────────────────
// ماشینِ حالتِ فلوی پرونده (flow_status روی bookings)
// هر مرحله این چرخه را طی می‌کند:
//   awaiting_payment → payment_submitted → awaiting_booking → booked
// و دکتر بین مرحله‌ها را باز می‌کند.
// ───────────────────────────────────────────────────────────────

export const FLOW = {
  // مرحله‌ی ۱: مصاحبه‌ی اولیه با والدین
  INTERVIEW_AWAITING_PAYMENT: 'interview_awaiting_payment',   // فرم ثبت شد، باید کارت‌به‌کارت پرداخت شود
  INTERVIEW_PAYMENT_SUBMITTED: 'interview_payment_submitted', // مراجع زد «پرداخت کردم»
  INTERVIEW_AWAITING_BOOKING: 'interview_awaiting_booking',   // دکتر پرداخت را تأیید کرد، مراجع وقت بگیرد
  INTERVIEW_BOOKED: 'interview_booked',                       // وقت مصاحبه گرفته شد
  INTERVIEW_REJECTED: 'interview_rejected',

  // مرحله‌ی ۲: ارزیابیِ کودک
  ASSESSMENT_AWAITING_PAYMENT: 'assessment_awaiting_payment', // دکتر مرحله‌ی ارزیابی را فعال کرد
  ASSESSMENT_PAYMENT_SUBMITTED: 'assessment_payment_submitted',
  ASSESSMENT_AWAITING_BOOKING: 'assessment_awaiting_booking', // دکتر پرداخت را تأیید کرد
  ASSESSMENT_BOOKED: 'assessment_booked',

  // مرحله‌ی ۳: پروتکل درمان (جزئیاتِ پرداخت در جدولِ packages مدیریت می‌شود)
  PACKAGE_ASSIGNED: 'package_assigned',
} as const

export type FlowStatus = typeof FLOW[keyof typeof FLOW]

// برچسبِ فارسیِ هر حالت (برای پنل دکتر)
export const FLOW_LABEL: Record<string, string> = {
  [FLOW.INTERVIEW_AWAITING_PAYMENT]: 'مصاحبه: منتظر پرداخت',
  [FLOW.INTERVIEW_PAYMENT_SUBMITTED]: 'مصاحبه: پرداخت اعلام شد (تأیید کنید)',
  [FLOW.INTERVIEW_AWAITING_BOOKING]: 'مصاحبه: منتظر گرفتنِ وقت',
  [FLOW.INTERVIEW_BOOKED]: 'مصاحبه رزرو شد',
  [FLOW.INTERVIEW_REJECTED]: 'مصاحبه رد شد',
  [FLOW.ASSESSMENT_AWAITING_PAYMENT]: 'ارزیابی: منتظر پرداخت',
  [FLOW.ASSESSMENT_PAYMENT_SUBMITTED]: 'ارزیابی: پرداخت اعلام شد (تأیید کنید)',
  [FLOW.ASSESSMENT_AWAITING_BOOKING]: 'ارزیابی: منتظر گرفتنِ وقت',
  [FLOW.ASSESSMENT_BOOKED]: 'ارزیابی رزرو شد',
  [FLOW.PACKAGE_ASSIGNED]: 'پروتکل درمان فعال',
}

// حالت‌هایی که منتظرِ تأییدِ پرداخت توسط دکتر هستند
export const NEEDS_PAYMENT_CONFIRM = new Set<string>([
  FLOW.INTERVIEW_PAYMENT_SUBMITTED,
  FLOW.ASSESSMENT_PAYMENT_SUBMITTED,
])