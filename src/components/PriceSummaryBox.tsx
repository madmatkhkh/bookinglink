'use client'
// ─────────────────────────────────────────────────────────────────────────────
// جعبه‌ی «مبلغ قابل پرداخت» — یک کامپوننت مشترک برای همه‌جای پنل مراجع که
// قیمت نشان داده می‌شود، تا شکل نمایش همه‌جا دقیقا یکی باشد.
//
// چرا لازم شد: قبلا هر صفحه (مصاحبه‌ی اولیه، پرداخت مرحله، خرید جلسه‌ی
// جایگزین، خرید پروتکل) خودش جداگانه JSX می‌ساخت؛ وقتی مالیات بر ارزش‌افزوده
// اضافه شد، فقط دو تا از این چهار جا به‌روز شدند و حتی آن دو با ترتیب اشتباه
// (مبلغ نهایی بالا، تفکیک پایین). حالا هر جا این کامپوننت استفاده شود، تغییر
// بعدی (مثلا اگر روزی نرخ مالیات یا شکل نمایش عوض شود) فقط این‌جا لازم است.
//
// ترتیب همیشه: قیمت پایه → مالیات (اگر نشان داده شود) → مبلغ قابل پرداخت،
// هرکدام در ردیف افقی خودش (نه یک رشته‌ی متنی با «+» که در RTL می‌تواند
// جهت اعداد را به‌هم بریزد).
// ─────────────────────────────────────────────────────────────────────────────

export default function PriceSummaryBox({
  base, vat, final, showVat, discount,
}: {
  base: number
  vat: number
  final: number
  showVat: boolean
  // اگر کد تخفیف اعمال شده، فقط قیمت اصلی خط‌خورده + قیمت تخفیف‌خورده نشان
  // داده می‌شود؛ ترکیب هم‌زمان تخفیف و تفکیک مالیات شلوغ و گیج‌کننده می‌شود.
  discount?: { originalFinal: number; discountedFinal: number } | null
}) {
  if (discount) {
    return (
      <div className="bg-sand border border-sand rounded-xl p-4 mb-3">
       <div className="flex items-center justify-between">
        <span className="text-xs text-soot">مبلغ قابل پرداخت</span>
        <span className="text-base font-bold text-ink">
         <span className="text-soot line-through text-xs ml-1.5 tnum">{discount.originalFinal.toLocaleString('en-US')}</span>
         <span className="tnum">{discount.discountedFinal.toLocaleString('en-US')}</span> تومان
        </span>
       </div>
      </div>
    )
  }

  if (!showVat) {
    return (
      <div className="bg-sand border border-sand rounded-xl p-4 mb-3">
       <div className="flex items-center justify-between">
        <span className="text-xs text-soot">مبلغ قابل پرداخت</span>
        <span className="text-base font-bold text-ink tnum">{final.toLocaleString('en-US')} تومان</span>
       </div>
      </div>
    )
  }

  return (
    <div className="bg-sand border border-sand rounded-xl p-4 mb-3 space-y-1.5">
     <div className="flex items-center justify-between text-xs text-soot">
      <span>قیمت جلسه</span>
      <span className="tnum">{base.toLocaleString('en-US')} تومان</span>
     </div>
     <div className="flex items-center justify-between text-xs text-soot">
      <span>مالیات ارزش‌افزوده</span>
      <span className="tnum">{vat.toLocaleString('en-US')} تومان</span>
     </div>
     <div className="flex items-center justify-between pt-1.5 border-t border-sand/70">
      <span className="text-xs text-soot">مبلغ قابل پرداخت</span>
      <span className="text-base font-bold text-ink tnum">{final.toLocaleString('en-US')} تومان</span>
     </div>
    </div>
  )
}
