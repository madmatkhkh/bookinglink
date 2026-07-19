/** @type {import('next').NextConfig} */

// ── Content-Security-Policy (فعال/enforcing) ─────────────────────────────────
// بعد از چند روز در حالت Report-Only و یک بازرسی کامل کد برای همه‌ی منابع بیرونی
// (اسکریپت/استایل/فونت/تصویر/connect/frame/form)، حالا فعال است و واقعا بلاک
// می‌کند. منابع بیرونی شناخته‌شده در لیست سفیدند؛ هر منبع دیگری بلاک می‌شود
// (لایه‌ی دفاعی دوم ضد XSS).
//   • script/style: 'unsafe-inline' چون Next خودش inline تولید می‌کند.
//   • img: self + R2 (آواتار/لوگو) + trustseal.enamad.ir (نماد اعتماد در لندینگ).
//   • font: فقط self — فونت‌ها self-host اند (public/fonts). فایل globals.additions.css
//     که فونت CDN داشت import نمی‌شود (مرده)، پس چیزی از jsdelivr بار نمی‌شود.
//   • connect: فقط self — همه‌ی fetchها به /api خود اپ می‌روند.
//   • form-action: self + gateway.zibal.ir (درگاه؛ هرچند با ناوبری top-level باز
//     می‌شود که اصلا مشمول CSP نیست، محض احتیاط).
// اگر روزی منبع بیرونی تازه‌ای اضافه شد (مثلا اسکریپت آنالیتیکس یا فونت CDN)،
// باید همین‌جا به دسته‌ی مربوطه اضافه شود وگرنه مرورگر بلاکش می‌کند.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.nobatlink.com https://trustseal.enamad.ir",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "form-action 'self' https://gateway.zibal.ir",
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
  // CSP فعال — واقعا بلاک می‌کند
  { key: 'Content-Security-Policy', value: csp },
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
