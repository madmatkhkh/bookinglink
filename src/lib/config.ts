// ─── تنظیماتِ سراسریِ پلتفرم ─────────────────────────────────────
// اسمِ نمایشیِ پلتفرم — تا انتخابِ اسمِ نهایی placeholder است و فقط همین‌جا عوض می‌شود
export const PLATFORM_NAME = 'نوبت‌لینک'

// slugهایی که با مسیرهای سیستمی تداخل دارند و قابلِ ثبت نیستند
export const RESERVED_SLUGS = [
  'api', 'super', 'admin', 'panel', 'book', 'my', 'login',
  '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'assets',
]

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending_payment: 'در انتظارِ پرداخت',
  payment_submitted: 'در انتظارِ تأییدِ پرداخت',
  confirmed: 'قطعی شد',
  cancelled: 'لغو شد',
  completed: 'برگزار شد',
  no_show: 'حاضر نشد',
}

export const MODE_LABEL: Record<string, string> = {
  online: 'آنلاین',
  in_person: 'حضوری',
  both: 'آنلاین یا حضوری',
}
