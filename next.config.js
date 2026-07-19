/** @type {import('next').NextConfig} */

// ── Content-Security-Policy در حالت Report-Only ──────────────────────────────
// این سیاست هیچ‌چیز را بلاک نمی‌کند؛ فقط در کنسول مرورگر گزارش می‌دهد که «اگر
// این CSP فعال بود، چه چیزهایی بلاک می‌شدند». عمدا برای دسته‌های اطلاعاتی
// (img/font/connect/frame/form) فقط 'self' گذاشته‌ایم تا منابع خارجی واقعی
// (تصاویر R2، فونت‌ها، درگاه/فرم زیبال، هر API بیرونی) در گزارش‌ها ظاهر شوند و
// بعد آگاهانه به لیست سفید اضافه‌شان کنیم و آن‌وقت به CSP واقعی (بدون Report-Only)
// سوییچ کنیم. script/style با 'unsafe-inline' چون Next خودش inline تولید می‌کند
// و گزارش‌شان نویز است، نه سیگنال.
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  // ضد clickjacking — صفحه فقط داخل قاب هم‌مبدأ باز می‌شود (اپ خودش iframe ندارد)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // اجبار HTTPS برای یک سال روی همه‌ی زیردامنه‌ها (Vercel همیشه HTTPS است)
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // جلوگیری از MIME-sniffing مرورگر
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // نشت‌ندادن مسیر کامل صفحه به سایت‌های مقصد بیرونی
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // فعلا فقط گزارش — چیزی را نمی‌شکند
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
]

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // پیش‌فرض Next 14.2: صفحات داینامیک تا 30 ثانیه از Router Cache (کش
    // سمت کلاینت) سرو می‌شوند — یعنی برگشتن به یک صفحه (پنل دکتر/مراجع) ظرف
    // همان بازه، اول نسخه‌ی «قدیمی» کش‌شده را نشان می‌دهد و بعد ناگهان با
    // دیتای تازه جایگزین می‌شود («ریلود یهو عوض می‌شود»، دقیقا چیزی که گزارش
    // شد). staleTimes.dynamic=0 این کش را برای صفحات داینامیک خاموش می‌کند.
    staleTimes: { dynamic: 0 },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
module.exports = nextConfig
