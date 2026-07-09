import Link from 'next/link'

export const metadata = { title: 'قوانین و شرایطِ استفاده — نوبت‌لینک' }

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper text-ink" dir="rtl">
      <div className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="text-xs text-soot hover:text-ink">← بازگشت به صفحه‌ی اصلی</Link>
        <h1 className="font-display font-extrabold text-2xl mt-4 tracking-tightest">قوانین و شرایطِ استفاده</h1>
        <p className="text-xs text-soot mt-1">آخرین به‌روزرسانی: تیرِ ۱۴۰۵</p>

        <div className="mt-8 space-y-7 text-sm leading-7 text-ink/90">
          <section>
            <h2 className="font-display font-bold text-base mb-2">۱. سرویس</h2>
            <p>
              نوبت‌لینک بسترِ نوبت‌دهیِ آنلاین برایِ متخصص‌ها و کسب‌وکارهای خدماتی است. محتوایِ هر صفحه‌ی
              نوبت‌دهی (خدمات، قیمت‌ها، زمان‌ها، فرمِ پذیرش) توسطِ خودِ آن مجموعه تعریف و مدیریت می‌شود و
              مسئولیتِ صحتِ آن با همان مجموعه است.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۲. حساب و ورود</h2>
            <p>
              ورودِ متخصص‌ها و مراجعان با کدِ یک‌بارمصرفِ پیامکی انجام می‌شود. مسئولیتِ حفاظت از خطِ موبایلِ
              ثبت‌شده با صاحبِ آن است؛ هر اقدامی که با ورودِ موفق از آن شماره انجام شود، اقدامِ صاحبِ حساب
              محسوب می‌شود.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۳. پرداخت‌ها</h2>
            <p>
              پرداختِ آنلاین از طریقِ درگاهِ دارایِ مجوز (زیبال) انجام می‌شود و وجه به حسابِ ارائه‌دهنده‌ی
              خدمت تسویه می‌گردد. در روشِ کارت‌به‌کارت، تراکنش مستقیماً میانِ مراجع و ارائه‌دهنده است و
              نوبت‌لینک صرفاً ثبت‌کننده‌ی اعلامِ پرداخت است. قواعدِ کنسلی و بازپرداختِ هر مجموعه در صفحه‌ی
              همان مجموعه اعلام می‌شود.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۴. استفاده‌ی منصفانه</h2>
            <p>
              ثبتِ نوبت یا پرونده با هویتِ غیرواقعی، تلاش برایِ اختلال در سرویس، و هر استفاده‌ی خلافِ قوانینِ
              جاریِ کشور ممنوع است و می‌تواند به تعلیقِ دسترسی منجر شود.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۵. حدودِ مسئولیت</h2>
            <p>
              نوبت‌لینک بسترِ نرم‌افزاریِ نوبت‌دهی است و طرفِ ارائه‌ی خدماتِ تخصصی (درمانی، مشاوره‌ای و…)
              نیست؛ کیفیت و نتیجه‌ی خدمات بر عهده‌ی ارائه‌دهنده‌ی آن است. تلاشِ ما دسترس‌پذیریِ پایدارِ
              سرویس است، اما وقفه‌های خارج از کنترل (قطعیِ زیرساخت، شبکه و…) ممکن است رخ دهد.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۶. تغییرات</h2>
            <p>هر تغییرِ مهم در همین صفحه منتشر و تاریخِ به‌روزرسانی اصلاح می‌شود.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
