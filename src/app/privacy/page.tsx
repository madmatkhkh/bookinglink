import Link from 'next/link'

export const metadata = { title: 'حریم خصوصی — نوبت‌لینک' }

// ─────────────────────────────────────────────────────────────────────────────
// سیاست حریم خصوصی — برای پلتفرمی که داده‌ی حساس سلامت روان نگه می‌دارد،
// وجود این صفحه پیش‌نیاز گرفتن مشتری واقعی است (هم اعتماد، هم شفافیت).
// متن عمدا ساده و بدون ادعاهای اثبات‌نشدنی نوشته شده.
// ─────────────────────────────────────────────────────────────────────────────
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper text-ink" dir="rtl">
      <div className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="text-xs text-soot hover:text-ink">← بازگشت به صفحه‌ی اصلی</Link>
        <h1 className="font-display font-extrabold text-2xl mt-4 tracking-tightest">حریم خصوصی</h1>
        <p className="text-xs text-soot mt-1">آخرین به‌روزرسانی: تیر 1405</p>

        <div className="mt-8 space-y-7 text-sm leading-7 text-ink/90">
          <section>
            <h2 className="font-display font-bold text-base mb-2">چه داده‌هایی نگهداری می‌شود؟</h2>
            <p>
              برای ارائه‌ی سرویس نوبت‌دهی، اطلاعاتی که خودتان هنگام ثبت نوبت وارد می‌کنید نگهداری می‌شود:
              نام، شماره‌ی تماس، زمان نوبت‌ها، و پاسخ‌هایی که به فرم پذیرش مجموعه‌ی مورد نظرتان می‌دهید.
              اطلاعات فرم پذیرش را همان متخصص/مجموعه تعریف کرده و فقط خود او به آن دسترسی دارد.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">چه کسی به داده‌ها دسترسی دارد؟</h2>
            <p>
              اطلاعات هر پرونده فقط برای متخصص/مجموعه‌ای که نزد او نوبت گرفته‌اید و خود شما (پس از ورود
              تاییدشده با کد پیامکی) قابل مشاهده است. نوبت‌لینک داده‌ی مراجعان را به هیچ شخص ثالثی نمی‌فروشد
              و برای تبلیغات استفاده نمی‌کند.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">داده‌ها کجا نگهداری می‌شود؟</h2>
            <p>
              داده‌ها در زیرساخت ابری معتبر با رمزنگاری در حالت سکون (encryption at rest) و انتقال
              رمزنگاری‌شده (HTTPS/TLS) نگهداری و جابه‌جا می‌شود. دسترسی سیستمی به داده‌ها محدود و مبتنی بر
              احراز هویت است.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">پیامک‌ها</h2>
            <p>
              شماره‌ی شما فقط برای کد ورود یک‌بارمصرف و یادآوری نوبت استفاده می‌شود — نه پیامک تبلیغاتی.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">حذف داده‌ها</h2>
            <p>
              اگر می‌خواهید پرونده‌تان حذف شود، درخواست را به همان مجموعه‌ای که نزد او نوبت گرفته‌اید بدهید؛
              مالک داده‌ی پرونده، همان مجموعه است و ابزار حذف کامل در پنلش وجود دارد.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">تغییرات این سیاست</h2>
            <p>
              هر تغییر مهم در همین صفحه منتشر و تاریخ به‌روزرسانی اصلاح می‌شود.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
