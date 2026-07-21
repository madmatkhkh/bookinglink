// ─── تنظیمات سراسری پلتفرم ─────────────────────────────────────
// اسم نمایشی پلتفرم — تا انتخاب اسم نهایی placeholder است و فقط همین‌جا عوض می‌شود
export const PLATFORM_NAME = 'نوبت‌لینک'

// ── اطلاعات تماس پلتفرم — لازم برای احراز شاپرک/زیبال و اینماد ──
// روی لندینگ (بخش «تماس با ما») و فوتر نمایش داده می‌شوند.
// ⚠️ قبل از اعلام آمادگی به زیبال این دو مقدار را با اطلاعات واقعی پر کن —
// SUPPORT_PHONE تا وقتی خالی باشد اصلا نمایش داده نمی‌شود (شماره‌ی الکی بدتر است)،
// ولی داور شاپرک معمولا انتظار شماره تماس دارد، پس پر کردنش جدی است.
export const SUPPORT_EMAIL = 'info@nobatlink.com'
export const SUPPORT_PHONE = '09134682153'

// کارمزد legacy — فقط fallback مدل قدیمی (قبل از migration 0046). از وقتی
// ردیف plan_fees در platform_settings هست، کارمزد واقعی per-پلن با کف/سقف از
// lib/commission.resolveTransactionFee می‌آید و این ثابت هرگز استفاده نمی‌شود.
// متن‌های عمومی (لندینگ/قوانین) دیگر از این نمی‌خوانند — از PLAN_PRICING در
// lib/plans.ts می‌خوانند. عدد 3 = درصد پلن پایه، تا حتی fallback هم با
// اعلامیه‌ی عمومی سازگار بماند (7% قدیمی بازنشسته شد — بدون مشتری، بدون مهاجرت).
export const PLATFORM_COMMISSION_PERCENT = 3

// ── حالت تست پرداخت ────────────────────────────────────────────
// وقتی PAYMENT_TEST_MODE=true باشد، پرداخت آنلاین به‌جای رفتن به درگاه واقعی
// زیبال، یک صفحه‌ی شبیه‌سازی داخلی نشان می‌دهد («پرداخت موفق» / «لغو») که همان
// منطق نهایی‌سازی واقعی را اجرا می‌کند — بدون پول واقعی و بدون خروج از برنامه.
// ⚠️ env-gated است و پیش‌فرض خاموش؛ روی پروداکشن هرگز نباید true باشد.
// NEXT_PUBLIC نسخه فقط برای این است که UI بتواند یک نشان «حالت تست» نمایش دهد.
export const PAYMENT_TEST_MODE =
  process.env.PAYMENT_TEST_MODE === 'true' || process.env.NEXT_PUBLIC_PAYMENT_TEST_MODE === 'true'

// اسلاگ یک صفحه‌ی نمونه‌ی واقعی (مثلا tenant تستی خودت) — اگر پر شود، روی
// لندینگ لینک «دیدن نمونه صفحه‌ی رزرو» نشان داده می‌شود تا داور شاپرک بتواند
// فرایند کامل خرید (انتخاب خدمت → قیمت → پرداخت) را ببیند. خالی = مخفی.
export const DEMO_SLUG = 'psysoleimani'

// slugهایی که با مسیرهای سیستمی تداخل دارند و قابل ثبت نیستند
export const RESERVED_SLUGS = [
  'api', 'super', 'admin', 'panel', 'book', 'my', 'login', 'signup', 'pay-sim',
  '_next', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'assets',
]

// نشانی اختصاصی: حروف کوچک لاتین، عدد، و - _ . در میانه.
// شروع و پایان همیشه حرف یا عدد است تا نشانی‌هایی مثل `.a` یا `x-` نسازیم، و دو
// جداکننده‌ی پشت‌سرهم (`a..b`, `a-_b`) هم مجاز نیست چون در عمل تایپی هستند و
// نشانی‌های نزدیک‌به‌هم و گیج‌کننده می‌سازند.
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9]|[-_.](?=[a-z0-9])){1,38}[a-z0-9]$/

// پیام واحد خطای نشانی — همه‌جا (ثبت‌نام، پنل، API) از همین یکی استفاده شود
export const SLUG_RULE_TEXT = 'حروف کوچک انگلیسی، عدد و . _ - (3 تا 40 نویسه)'

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
