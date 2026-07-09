// صفحه‌ی ۴۰۴ برندشده — قبلاً کاربر صفحه‌ی خامِ انگلیسیِ خودِ Next را می‌دید که
// با هویتِ فارسی/RTL محصول در تضاد بود.
export default function NotFound() {
  return (
    <main className="min-h-screen bg-paper text-ink flex items-center justify-center px-6" dir="rtl">
      <div className="text-center max-w-sm">
        <div className="font-display font-extrabold text-6xl tracking-tightest tnum">404</div>
        <h1 className="font-display font-bold text-lg mt-4">این صفحه پیدا نشد</h1>
        <p className="text-sm text-soot mt-2 leading-6">
          نشانی که واردِ آن شدید وجود ندارد یا جابه‌جا شده است. اگر لینکِ یک متخصص را دنبال می‌کنید، املای نشانی را بررسی کنید.
        </p>
        <a href="/" className="inline-block mt-6 text-sm font-semibold text-white bg-ink px-5 py-2.5 rounded-lg hover:opacity-90">
          بازگشت به صفحه‌ی اصلی
        </a>
      </div>
    </main>
  )
}
