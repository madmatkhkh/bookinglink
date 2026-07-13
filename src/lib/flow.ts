// ───────────────────────────────────────────────────────────────
// مراحل پرونده (جدول psy_stages) — دیگر فلوی هاردکد «مصاحبه یک‌بار →
// ارزیابی یک‌بار» نیست. هر پرونده هر تعداد مرحله از هر نوع می‌تواند داشته
// باشد. هر مرحله این چرخه را طی می‌کند:
//   awaiting_payment → payment_submitted → awaiting_booking → booked
// و بعد از برگزاری (held=true)، دکتر تصمیم می‌گیرد جلسه‌ی بعدی چیست.
//
// این تنها مسیر «دادن یک جلسه به مراجع» است. قبلا یک مسیر دوم موازی هم بود
// (جلسه‌ی تکی روی psy_sessions) که همان کار را با رفتار متفاوت انجام می‌داد و
// مدام با این اشتباه گرفته می‌شد؛ حذف شد و انعطافش (عنوان دلخواه) به همین‌جا
// منتقل شد: stage_type = 'custom' + عنوان در ستون title.
// ───────────────────────────────────────────────────────────────

export const STAGE_TYPES = ['interview', 'assessment', 'custom'] as const
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
  custom: 'جلسه',
}

// عنوان قابل نمایش یک مرحله — همه‌جا (پنل دکتر و پنل مراجع) باید از این رد شود،
// نه مستقیم از STAGE_TYPE_LABEL؛ وگرنه مرحله‌ی دلخواه به‌جای عنوان خودش برچسب
// عمومی «جلسه» می‌گیرد.
export function stageTitle(stage: { stage_type: string; title?: string | null }): string {
  const custom = (stage.title || '').trim()
  if (custom) return custom
  return STAGE_TYPE_LABEL[stage.stage_type] || stage.stage_type
}

export const STAGE_STATUS_LABEL: Record<string, string> = {
  [STAGE_STATUS.AWAITING_PAYMENT]: 'منتظر پرداخت',
  [STAGE_STATUS.PAYMENT_SUBMITTED]: 'پرداخت اعلام شد (تایید کنید)',
  [STAGE_STATUS.AWAITING_BOOKING]: 'منتظر گرفتن وقت',
  [STAGE_STATUS.BOOKED]: 'رزرو شد',
}

// برچسب ترکیبی برای نمایش سریع («مصاحبه: منتظر پرداخت»)
export function stageLabel(stage: { stage_type: string; title?: string | null; status: string }): string {
  const s = STAGE_STATUS_LABEL[stage.status] || stage.status
  return `${stageTitle(stage)}: ${s}`
}

// ─────────────────────────────────────────────────────────────────────────────
// «پرونده‌ی پیش‌نویس رهاشده»
//
// فرم مصاحبه پرونده و اولین مرحله را قبل از پرداخت می‌سازد — و باید هم بسازد:
// کارت‌به‌کارت بدون پرونده اصلا کار نمی‌کند (مراجع فیش می‌دهد، دکتر بعدا تاییدش
// می‌کند)، و اگر مراجع وسط کار برود، با همان پرونده می‌تواند بعدا از پنل خودش
// ادامه بدهد بدون پرکردن دوباره‌ی کل فرم.
//
// ولی کسی که فرم را پر کرده و حتی **ادعای پرداخت هم نکرده**، هنوز مراجع نیست.
// چنین پرونده‌ای نباید:
//   • در لیست پرونده‌های دکتر و شمارنده‌ها بیاید (شلوغی بی‌فایده)
//   • جلوی ثبت‌نام دوباره‌ی خود همان شخص را بگیرد (چک تکراری)
//
// مرز دقیق: به‌محض اینکه مراجع فیش بفرستد (payment_submitted / payment_ref) یا
// پرداخت آنلاینش تایید شود (paid)، پرونده واقعی می‌شود — یعنی دقیقا همان لحظه‌ای
// که دکتر باید کاری انجام دهد.
export function isDraftCase(c: {
  status?: string | null
  current_stage?: { status?: string; paid?: boolean | null; payment_submitted?: boolean | null; payment_ref?: string | null } | null
}): boolean {
  if (c.status !== 'pending') return false      // یک‌بار تایید شده = پرونده‌ی واقعی
  const s = c.current_stage
  if (!s) return false                          // مرحله‌ی بازی ندارد — قضاوت نمی‌کنیم
  if (s.paid || s.payment_submitted || s.payment_ref) return false  // پول یا ادعای پول در کار است
  return s.status === STAGE_STATUS.AWAITING_PAYMENT
}
