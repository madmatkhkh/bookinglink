// ─── تنظیمات سراسری پلتفرم ─────────────────────────────────────
// اسم نمایشی پلتفرم — تا انتخاب اسم نهایی placeholder است و فقط همین‌جا عوض می‌شود
export const PLATFORM_NAME = 'نوبت‌لینک'

// ── اطلاعات تماس پلتفرم — لازم برای احراز شاپرک/زیبال و اینماد ──
// روی لندینگ (بخش «تماس با ما») و فوتر نمایش داده می‌شوند.
// ⚠️ قبل از اعلام آمادگی به زیبال این دو مقدار را با اطلاعات واقعی پر کن —
// SUPPORT_PHONE تا وقتی خالی باشد اصلا نمایش داده نمی‌شود (شماره‌ی الکی بدتر است)،
// ولی داور شاپرک معمولا انتظار شماره تماس دارد، پس پر کردنش جدی است.
export const SUPPORT_EMAIL = 'support@nobatlink.com'
export const SUPPORT_PHONE = ''

// کارمزد پلتفرم (پلن رایگان) — درصدی از هر پرداخت آنلاین موفق که سهم
// نوبت‌لینک است و در تسویه با متخصص کسر می‌شود. همه‌جای متن‌های عمومی
// (تعرفه‌ها، FAQ، قوانین) از همین ثابت می‌خوانند — تغییرش فقط همین‌جا.
export const PLATFORM_COMMISSION_PERCENT = 7

// اسلاگ یک صفحه‌ی نمونه‌ی واقعی (مثلا tenant تستی خودت) — اگر پر شود، روی
// لندینگ لینک «دیدن نمونه صفحه‌ی رزرو» نشان داده می‌شود تا داور شاپرک بتواند
// فرایند کامل خرید (انتخاب خدمت → قیمت → پرداخت) را ببیند. خالی = مخفی.
export const DEMO_SLUG = ''

// slugهایی که با مسیرهای سیستمی تداخل دارند و قابل ثبت نیستند
export const RESERVED_SLUGS = [
  'api', 'super', 'admin', 'panel', 'book', 'my', 'login',
  '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'assets',
]

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending_payment: 'در انتظار پرداخت',
  payment_submitted: 'در انتظار تأیید پرداخت',
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

// ── قیمت‌گذاری نیچ روانشناسی (سازگاری با پنل منتقل‌شده) ──────
// منبع اصلی PSY_PRICING در psy.ts است؛ این‌جا برای importهای قدیمی پنل می‌آید.
export { PSY_PRICING as PRICING, PSY_CANCEL as CANCEL, PSY_BOOKING as BOOKING } from './psy'
