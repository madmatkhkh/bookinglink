'use client'
import { Pricing, PRICING_VAT_PERCENT, resolvePrice } from '@/lib/psy'
import PriceInput from '@/components/PriceInput'
import { genId } from '../shared'
import DiscountCodesSection from './DiscountCodesSection'
import type { ResourceProfileView, SettingsSub } from './types'

// ── تنظیمات: پرداخت‌ها / قیمت‌گذاری / شرایط و مقررات ─────────────────────────
//
// دومین برش از تب تنظیمات (بعد از فرم‌بیلدر). این سه زیرتب با هم آمدند چون
// همگی فقط روی `profile` کار می‌کنند (کارت‌ها، شبا، روش‌های پرداخت، قیمت،
// مالیات، متن شرایط) — یعنی سطح وابستگی مشترک و کوچکی دارند: کل این 239 خط
// روی هم فقط 6 prop می‌خواهد.
//
// نکته‌ی چیدمان: در فایل والد این بلوک‌ها با بلوک‌های «پروفایل» درهم بودند
// (profile → payments → profile → appearance → payments → pricing ...). چون
// هر بلوک پشت `settingsSubTab === X` است و هم‌زمان فقط یکی رندر می‌شود،
// گروه‌کردنشان هیچ تغییر بصری نمی‌دهد — فقط ترتیب *داخل* هر زیرتب مهم است،
// که عینا حفظ شده.
export default function SettingsPayments({
 sub, profile, patchProfile, cardToCardAllowed, isOwner, moduleOn, slug, viewingResourceId,
}: {
 sub: SettingsSub | null
 profile: ResourceProfileView
 patchProfile: (p: Partial<ResourceProfileView>) => void
 cardToCardAllowed: boolean
 isOwner: boolean
 moduleOn: (key: string) => boolean
 slug: string
 viewingResourceId: string
}) {
 const settingsSubTab = sub
 const me = { isOwner }
 const mod = moduleOn
 return (
  <>
  {settingsSubTab === 'payments' && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">روش‌های پرداخت</h2>
   {!cardToCardAllowed ? (
    <>
     <p className="text-xs text-soot mb-4">
      پرداخت مراجعان به‌صورت آنلاین (درگاه پرداخت نوبت‌لینک) انجام می‌شود — تایید خودکار، بدون نیاز به بررسی دستی شما.
     </p>
     <div className="flex items-center justify-between p-3 rounded-xl border border-sand">
      <div>
       <span className="text-sm text-ink block">پرداخت آنلاین (درگاه نوبت‌لینک)</span>
       <span className="text-[11px] text-soot">فعال — مراجع بلافاصله بعد از پرداخت می‌تواند ادامه دهد</span>
      </div>
      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">فعال</span>
     </div>
    </>
   ) : (
    <>
     <p className="text-xs text-soot mb-4">
      آنلاین یعنی مراجع بلافاصله بعد پرداخت می‌تواند ادامه دهد (بدون نیاز به تایید شما).
      کارت‌به‌کارت مثل قبل: مراجع فیشش را می‌فرستد و شما تایید می‌کنید.
     </p>
     <div className="space-y-2">
      <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer">
       <div>
        <span className="text-sm text-ink block">کارت‌به‌کارت</span>
        <span className="text-[11px] text-soot">نیاز به تایید دستی شما دارد</span>
       </div>
       <input type="checkbox" checked={profile.payment_methods.card_to_card}
        onChange={e => patchProfile({ payment_methods: { ...profile.payment_methods, card_to_card: e.target.checked } })}
        className="w-5 h-5 accent-ink" />
      </label>
      <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer">
       <div>
        <span className="text-sm text-ink block">پرداخت آنلاین (درگاه نوبت‌لینک)</span>
        <span className="text-[11px] text-soot">تایید خودکار — مراجع بلافاصله می‌تواند نوبت بگیرد</span>
       </div>
       <input type="checkbox" checked={profile.payment_methods.online}
        onChange={e => patchProfile({ payment_methods: { ...profile.payment_methods, online: e.target.checked } })}
        className="w-5 h-5 accent-ink" />
      </label>
      {!profile.payment_methods.card_to_card && !profile.payment_methods.online && (
       <p className="text-[11px] text-ink px-1">حداقل یک روش باید فعال بماند.</p>
      )}
     </div>
    </>
   )}
  </section>
  )}

  {settingsSubTab === 'payments' && cardToCardAllowed && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">شماره کارت‌های واریزی</h2>
   <p className="text-xs text-soot mb-4">این کارت‌ها در صفحه‌ی پرداخت کارت‌به‌کارت به مراجع نمایش داده می‌شوند.</p>
   <div className="space-y-3">
    {profile.cards.map((c, i) => (
     <div key={c.id} className="border border-sand rounded-xl p-3 bg-gray-50 space-y-2">
      <div className="flex items-center gap-2">
       <input value={c.number}
        onChange={e => {
         const next = [...profile.cards]; next[i] = { ...c, number: e.target.value }
         patchProfile({ cards: next })
        }}
        dir="ltr" placeholder="6037-9900-0000-0000"
        className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg bg-white font-mono tracking-wider focus:outline-none focus:border-ink" />
       <button onClick={() => patchProfile({ cards: profile.cards.filter((_, j) => j !== i) })}
        className="text-xs px-2.5 py-2 border border-red-500/30 text-red-600 rounded-lg shrink-0 hover:bg-red-500/5">حذف</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
       <input value={c.holder}
        onChange={e => {
         const next = [...profile.cards]; next[i] = { ...c, holder: e.target.value }
         patchProfile({ cards: next })
        }}
        placeholder="نام صاحب کارت"
        className="text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
       <input value={c.bank || ''}
        onChange={e => {
         const next = [...profile.cards]; next[i] = { ...c, bank: e.target.value }
         patchProfile({ cards: next })
        }}
        placeholder="نام بانک (اختیاری)"
        className="text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
      </div>
     </div>
    ))}
   </div>
   <button onClick={() => patchProfile({ cards: [...profile.cards, { id: genId('card'), number: '', holder: '' }] })}
    className="mt-3 text-xs px-3 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand">+ افزودن کارت</button>
  </section>
  )}

  {settingsSubTab === 'payments' && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">شبای دریافت سهم از پرداخت آنلاین</h2>
   <p className="text-xs text-soot mb-4">
    برای واریز خودکار سهم شما لازم است. تا ثبت نشود، تسویه به‌صورت دستی هماهنگ می‌شود.
   </p>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <input
     dir="ltr"
     placeholder="IR00 0000 0000 0000 0000 0000 00"
     value={profile.settlement_sheba}
     onChange={e => patchProfile({ settlement_sheba: e.target.value })}
     className="border border-sand rounded-xl px-3 py-2 text-sm tnum focus:outline-none focus:border-ink" />
    <input
     placeholder="نام صاحب حساب"
     value={profile.settlement_sheba_holder_name}
     onChange={e => patchProfile({ settlement_sheba_holder_name: e.target.value })}
     className="border border-sand rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink" />
   </div>
  </section>
  )}

  {settingsSubTab === 'pricing' && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">قیمت‌گذاری</h2>
   <p className="text-xs text-soot mb-4">فقط نوع حضور قیمت را تعیین می‌کند — مصاحبه، ارزیابی، و جلسه هرکدام با همین دو قیمت حساب می‌شوند. روی رزروهای تازه اعمال می‌شود (رزروهای قبلی با همان قیمت زمان ثبت‌شان می‌مانند).</p>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div>
     <label className="text-xs text-soot mb-1 block">هزینه‌ی هر جلسه‌ی آنلاین (تومان)</label>
     <PriceInput value={profile.pricing.online}
      onChange={n => patchProfile({ pricing: { ...profile.pricing, online: n } })}
      className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
    </div>
    <div>
     <label className="text-xs text-soot mb-1 block">هزینه‌ی هر جلسه‌ی حضوری (تومان)</label>
     <PriceInput value={profile.pricing.offline}
      onChange={n => patchProfile({ pricing: { ...profile.pricing, offline: n } })}
      className="w-full text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
    </div>
   </div>

   {/* مالیات بر ارزش افزوده‌ی خود متخصص — اختیاری، جدا از کارمزد پلتفرم.
       وقتی روشن است، همین‌جا قیمت نهایی (پایه+مالیات) هم نشان داده
       می‌شود؛ همان عددی که واقعا از مراجع گرفته می‌شود (resolvePrice). */}
   <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer mt-4">
    <div>
     <span className="text-sm text-ink block">احتساب مالیات بر ارزش افزوده ({PRICING_VAT_PERCENT}٪)</span>
     <span className="text-xs text-soot">روی قیمت جلسات اضافه و از مراجع دریافت می‌شود.</span>
    </div>
    <input type="checkbox" checked={profile.pricing.vat_enabled}
     onChange={e => patchProfile({ pricing: { ...profile.pricing, vat_enabled: e.target.checked } })}
     className="w-5 h-5 accent-ink shrink-0" />
   </label>

   {profile.pricing.vat_enabled && (
    <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer mt-2 mr-4">
     <div>
      <span className="text-sm text-ink block">نمایش تفکیک مالیات به مراجع</span>
      <span className="text-xs text-soot">مثلا «50,000 + مالیات = 55,000»، به‌جای فقط عدد نهایی.</span>
     </div>
     <input type="checkbox" checked={profile.pricing.vat_visible_to_client}
      onChange={e => patchProfile({ pricing: { ...profile.pricing, vat_visible_to_client: e.target.checked } })}
      className="w-5 h-5 accent-ink shrink-0" />
    </label>
   )}

   {profile.pricing.vat_enabled && (
    <div className="mt-3 bg-gray-50 rounded-xl p-3.5 text-xs text-soot space-y-1.5">
     <div className="flex items-center justify-between">
      <span>قیمت نهایی جلسه‌ی آنلاین (با مالیات)</span>
      <span className="font-medium text-ink tnum">{resolvePrice('online', profile.pricing).toLocaleString('en-US')} تومان</span>
     </div>
     <div className="flex items-center justify-between">
      <span>قیمت نهایی جلسه‌ی حضوری (با مالیات)</span>
      <span className="font-medium text-ink tnum">{resolvePrice('offline', profile.pricing).toLocaleString('en-US')} تومان</span>
     </div>
    </div>
   )}

   <div className="border-t border-sand mt-4 pt-4">
    <label className="text-xs text-soot mb-1 block">هزینه‌ی هر دقیقه‌ی اضافه (تومان)</label>
    <p className="text-xs text-soot mb-2">اگر جلسه‌ای بیشتر از مدت معمول طول بکشد، برای محاسبه‌ی هزینه‌ی دقایق اضافه (هنگام ارسال شارژ اضافه) استفاده می‌شود. صفر یعنی هزینه‌ی اضافه محاسبه نمی‌شود.</p>
    <PriceInput value={profile.pricing.extra_minute_price}
     onChange={n => patchProfile({ pricing: { ...profile.pricing, extra_minute_price: n } })}
     className="w-36 text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
   </div>
  </section>
  )}

  {settingsSubTab === 'pricing' && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">سیاست کنسلی جلسه</h2>
   <p className="text-xs text-soot mb-4">وقتی مراجع خودش یک جلسه را کنسل می‌کند، طبق همین قانون بازپرداخت محاسبه می‌شود.</p>
   <label className="flex items-center justify-between p-3 rounded-xl border border-sand cursor-pointer mb-3">
    <span className="text-sm text-ink">مراجع اجازه‌ی کنسل‌کردن خودکار داشته باشد</span>
    <input type="checkbox" checked={profile.cancellation_policy.enabled}
     onChange={e => patchProfile({ cancellation_policy: { ...profile.cancellation_policy, enabled: e.target.checked } })}
     className="w-5 h-5 accent-ink shrink-0" />
   </label>
   {profile.cancellation_policy.enabled && (
    <div className="space-y-3 bg-gray-50 rounded-xl p-3.5">
     <div className="flex items-center gap-2">
      <span className="text-xs text-soot shrink-0">اگه حداقل</span>
      <input type="number" min={0} value={profile.cancellation_policy.threshold_hours}
       onChange={e => patchProfile({ cancellation_policy: { ...profile.cancellation_policy, threshold_hours: parseInt(e.target.value) || 0 } })}
       className="w-16 text-sm px-2 py-1.5 border border-sand rounded-lg bg-white text-center" />
      <span className="text-xs text-soot shrink-0">ساعت قبل از جلسه کنسل کرد:</span>
     </div>
     <div className="flex items-center gap-2 pr-2">
      <span className="text-xs text-soot shrink-0">چند درصد پول برگردد؟</span>
      <input type="number" min={0} max={100} value={profile.cancellation_policy.early_refund_percent}
       onChange={e => patchProfile({ cancellation_policy: { ...profile.cancellation_policy, early_refund_percent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) } })}
       className="w-16 text-sm px-2 py-1.5 border border-sand rounded-lg bg-white text-center" />
      <span className="text-xs text-soot shrink-0">٪</span>
     </div>
     <div className="flex items-center gap-2 pt-2 border-t border-sand">
      <span className="text-xs text-soot shrink-0">اگه دیرتر از اون (نزدیک‌تر به جلسه) کنسل کرد، چند درصد برگردد؟</span>
      <input type="number" min={0} max={100} value={profile.cancellation_policy.late_refund_percent}
       onChange={e => patchProfile({ cancellation_policy: { ...profile.cancellation_policy, late_refund_percent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) } })}
       className="w-16 text-sm px-2 py-1.5 border border-sand rounded-lg bg-white text-center shrink-0" />
      <span className="text-xs text-soot shrink-0">٪</span>
     </div>
    </div>
   )}
  </section>
  )}

  {settingsSubTab === 'pricing' && mod('discount_codes') && (
   <DiscountCodesSection slug={slug} isOwner={!!me?.isOwner} viewingResourceId={viewingResourceId} />
  )}

  {settingsSubTab === 'terms' && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">شرایط و مقررات قبل از پرداخت</h2>
   <p className="text-xs text-soot mb-4">اگر روشن باشد، مراجع پیش از هر پرداخت باید این متن را ببیند و با تیک‌زدن آن را بپذیرد — وگرنه دکمه‌ی پرداخت غیرفعال می‌ماند. اگر خاموش باشد، این بخش برای مراجع اصلا نمایش داده نمی‌شود.</p>

   <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
    <input type="checkbox" checked={profile.terms.enabled}
     onChange={e => patchProfile({ terms: { ...profile.terms, enabled: e.target.checked } })}
     className="w-4 h-4" />
    <span className="text-sm text-ink">پیش از پرداخت از مراجع تاییدیه بگیر</span>
   </label>

   <div className={profile.terms.enabled ? '' : 'opacity-50 pointer-events-none'}>
    <label className="text-xs text-soot mb-1 block">متن شرایط و مقررات</label>
    <p className="text-xs text-soot mb-2">هر مدل و فرمتی که خودتان می‌خواهید — مدت جلسه، هزینه‌ی دقیقه‌ی اضافه، شرایط کنسلی هر دو طرف، یا هر نکته‌ی دیگر. دقیقا همین متن به مراجع نشان داده می‌شود.</p>
    <textarea value={profile.terms.extra} rows={7} maxLength={2000}
     onChange={e => patchProfile({ terms: { ...profile.terms, extra: e.target.value } })}
     placeholder={'مثلا:\nمدت هر جلسه 50 دقیقه است. هر دقیقه‌ی اضافه 50,000 تومان محاسبه می‌شود.\nکنسلی تا 12 ساعت قبل: 50٪ بازگشت وجه. دیرتر از آن: بدون بازگشت.\nدر صورت کنسلی از طرف من، جلسه‌ی جایگزین رایگان تعیین می‌شود.'}
     className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink resize-none" />
   </div>
  </section>
  )}
  </>
 )
}
