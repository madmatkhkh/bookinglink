import Link from 'next/link'
import { SUPPORT_EMAIL } from '@/lib/config'
import { PLAN_PRICING } from '@/lib/plans'

export const metadata = { title: 'قوانین و شرایط استفاده — نوبت‌لینک' }

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper text-ink" dir="rtl">
      <div className="max-w-2xl mx-auto px-6 py-14">
        <Link href="/" className="text-xs text-soot hover:text-ink">← بازگشت به صفحه‌ی اصلی</Link>
        <h1 className="font-display font-extrabold text-2xl mt-4 tracking-tightest">قوانین و شرایط استفاده</h1>
        <p className="text-xs text-soot mt-1">آخرین به‌روزرسانی: تیر ۱۴۰۵</p>

        <div className="mt-8 space-y-7 text-sm leading-7 text-ink/90">
          <section>
            <h2 className="font-display font-bold text-base mb-2">۱. سرویس</h2>
            <p>
              نوبت‌لینک بستر نوبت‌دهی آنلاین برای متخصص‌ها و کسب‌وکارهای خدماتی است. محتوای هر صفحه‌ی
              نوبت‌دهی (خدمات، قیمت‌ها، زمان‌ها، فرم پذیرش) توسط خود آن مجموعه تعریف و مدیریت می‌شود و
              مسئولیت صحت آن با همان مجموعه است.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۲. حساب و ورود</h2>
            <p>
              ورود متخصص‌ها و مراجعان با کد یک‌بارمصرف پیامکی انجام می‌شود. مسئولیت حفاظت از خط موبایل
              ثبت‌شده با صاحب آن است؛ هر اقدامی که با ورود موفق از آن شماره انجام شود، اقدام صاحب حساب
              محسوب می‌شود.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۳. پرداخت‌ها</h2>
            <p>
              پرداخت آنلاین از طریق درگاه دارای مجوز (زیبال) انجام می‌شود. کارمزد خدمات پلتفرم
              مطابق پلن انتخابی ارائه‌دهنده (<span className="tnum">{PLAN_PRICING.team.feePct}% تا {PLAN_PRICING.base.feePct}%</span> از مبلغ هر
              پرداخت آنلاین موفق، با کف و سقف مشخص، به‌علاوه مالیات بر ارزش افزوده) طبق تعرفه‌ی
              اعلام‌شده در بخش «تعرفه‌ها»ی صفحه‌ی اصلی است و به‌همراه حق اشتراک ماهانه هنگام تسویه از
              سهم ارائه‌دهنده کسر می‌شود؛ مابقی وجوه به‌صورت دوره‌ای با ارائه‌دهنده تسویه و به حساب او
              واریز می‌گردد. این مبالغ از سهم ارائه‌دهنده کسر می‌شود و مبلغی اضافه بر قیمت
              اعلام‌شده از پرداخت‌کننده دریافت نمی‌شود. قواعد کنسلی و بازپرداخت هر مجموعه در صفحه‌ی همان
              مجموعه اعلام می‌شود.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۴. کنسلی و بازپرداخت</h2>
            <p>
              مراجع می‌تواند مطابق مهلت کنسلی اعلام‌شده توسط هر مجموعه، نوبت خود را از پنل شخصی‌اش لغو
              کند. در صورت لغو در مهلت مجاز یا لغو نوبت توسط خود مجموعه، وجه پرداختی طبق قواعد همان
              مجموعه بازگردانده می‌شود؛ بازپرداخت تراکنش‌های درگاه به همان کارت/حساب مبدا انجام می‌گیرد.
              اگر پرداختی انجام شود اما نوبت به هر دلیل ثبت نشود، مبلغ به‌صورت خودکار از سمت درگاه به
              پرداخت‌کننده برگشت داده می‌شود.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۵. استفاده‌ی منصفانه</h2>
            <p>
              ثبت نوبت یا پرونده با هویت غیرواقعی، تلاش برای اختلال در سرویس، و هر استفاده‌ی خلاف قوانین
              جاری کشور ممنوع است و می‌تواند به تعلیق دسترسی منجر شود.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۶. حدود مسئولیت</h2>
            <p>
              نوبت‌لینک بستر نرم‌افزاری نوبت‌دهی است و طرف ارائه‌ی خدمات تخصصی (درمانی، مشاوره‌ای و…)
              نیست؛ کیفیت و نتیجه‌ی خدمات بر عهده‌ی ارائه‌دهنده‌ی آن است. تلاش ما دسترس‌پذیری پایدار
              سرویس است، اما وقفه‌های خارج از کنترل (قطعی زیرساخت، شبکه و…) ممکن است رخ دهد.
            </p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۷. تغییرات</h2>
            <p>هر تغییر مهم در همین صفحه منتشر و تاریخ به‌روزرسانی اصلاح می‌شود.</p>
          </section>
          <section>
            <h2 className="font-display font-bold text-base mb-2">۸. تماس</h2>
            <p>
              برای هر سوال درباره‌ی این شرایط یا سرویس، از طریق ایمیل <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="underline underline-offset-4">{SUPPORT_EMAIL}</a> یا
              بخش «تماس با ما» در صفحه‌ی اصلی با ما در ارتباط باشید. کاربران نوبت‌لینک از داخل پنل خود نیز می‌توانند تیکت پشتیبانی ثبت کنند.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
