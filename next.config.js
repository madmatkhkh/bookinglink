/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // پیش‌فرضِ Next 14.2: صفحاتِ داینامیک تا 30 ثانیه از Router Cache (کشِ
    // سمتِ کلاینت) سرو می‌شوند — یعنی برگشتن به یک صفحه (پنلِ دکتر/مراجع) ظرفِ
    // همان بازه، اول نسخه‌ی «قدیمی»ِ کش‌شده را نشان می‌دهد و بعد ناگهان با
    // دیتایِ تازه جایگزین می‌شود («ریلود یهو عوض می‌شود»، دقیقاً چیزی که گزارش
    // شد). staleTimes.dynamic=0 این کش را برایِ صفحاتِ داینامیک خاموش می‌کند.
    staleTimes: { dynamic: 0 },
  },
}
module.exports = nextConfig
