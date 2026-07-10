# پیاده‌سازی طراحی مونوکروم روی bookinglink

این پوشه فایل‌های آماده برای کپی در ریپوی `bookinglink` است — طراحی مونوکروم
(سفید/مشکی/خاکستری) به سبک Cal.com، با تیتر Estedad و بدنه‌ی Vazirmatn،
اعداد لاتین و RTL. همه با قراردادها و توکن‌های موجود کدت هماهنگ است.

## فایل‌ها و مقصدشان

| از این‌جا | به این‌جا در ریپو | کار |
|---|---|---|
| `tailwind.config.js` | `tailwind.config.js` | **جایگزین کن.** توکن‌های `paper/sand/ink/soot` مونوکروم شدند، پالت `brand` خاکستری شد، و فونت `display: Estedad` اضافه شد. چون نام‌ها همان قبلی‌اند، همه‌ی `className`های موجود خودکار مونوکروم می‌شوند. |
| `src/app/globals.additions.css` | ابتدای `src/app/globals.css` | بلوک داخلش را بعد سه خط `@tailwind` بچسبان (@font-face استداد + انیمیشن‌ها). و خط `:root { --brand: 13 148 136 }` را به `--brand: 10 10 10` عوض کن. بقیه‌ی فایل دست‌نخورده. |
| `src/app/layout.tsx` | `src/app/layout.tsx` | **جایگزین کن.** فقط preconnect و متادیتا اضافه شده؛ لینک Vazirmatn حفظ است. |
| `src/app/page.tsx` | `src/app/page.tsx` | **جایگزین کن.** لندینگ مونوکروم؛ کارت‌های نیچ همچنان داینامیک از `/api/niches` و اینماد فوتر حفظ است. |
| `src/app/login/page.tsx` | `src/app/login/page.tsx` | **جدید.** ورود متخصص (OTP دو مرحله‌ای). |
| `src/app/signup/page.tsx` | `src/app/signup/page.tsx` | **جدید.** ثبت‌نام سلف‌سرویس. |
| `src/app/[slug]/panel/PsychologyAdmin.tsx` | همان مسیر | **جایگزین کن.** فقط `className`/رنگ — منطق دست‌نخورده. |
| `src/app/[slug]/page.tsx` | همان مسیر | **جایگزین کن.** سایت عمومی متخصص («سایت من») — فقط استایل. |
| `src/app/[slug]/my/page.tsx` | همان مسیر | **جایگزین کن.** پنل مراجع — فقط استایل. |
| `src/app/[slug]/interview/page.tsx` | همان مسیر | **جایگزین کن.** صفحه مصاحبه اولیه — فقط استایل. |
| `src/app/[slug]/book/[serviceId]/page.tsx` | همان مسیر | **جایگزین کن.** صفحه رزرو سرویس — فقط استایل. |

`login` و `signup` هر دو در `RESERVED_SLUGS` هستند، پس با روتینگ tenant تداخل ندارند. ✅

## پنل (PsychologyAdmin.tsx) — فقط استایل عوض شد

نقشه‌ی جایگزینی className (کاملا مکانیکی، بدون لمس منطق):
- لهجه‌ی برند تیل (`brand-*`) → مونوکروم: `bg-brand-600`→`bg-ink`، `text-brand-600/700`→`text-ink`، `border-brand-*`→`border-ink`/`border-sand`، `bg-brand-50`→`bg-sand`، `ring-brand-500`→`ring-ink`، `accent-brand-600`→`accent-ink`.
- بوردرها: `border-gray-100/200/50` → `border-sand`.
- متن: `text-gray-900/800/700`→`text-ink`، `text-gray-600/500/400`→`text-soot` (خاکستری کم‌رنگ‌تر مثل `gray-300` دست‌نخورده).
- تیترها: به هر `font-semibold/font-bold text-gray-900` کلاس `font-display` (استداد) اضافه شد (۲۶ تیتر).
- دکمه‌های اکشن آبی/بنفش (مصاحبه/ارزیابی) → `bg-ink`؛ بنر اطلاع آبی → خنثی.

**رنگ‌های معنایی حفظ‌شده (عمدا):** سبز = پرداخت‌شده/تأیید، کهربایی = در انتظار، قرمز = خطر/رد/لغو. این‌ها در پنل تأیید پرداخت نقش کارکردی دارند (مثل خود Cal.com که مونوکروم است ولی وضعیت‌ها رنگ دارند). اگر می‌خواهی این‌ها هم خاکستری شوند، بگو تا حذف‌شان کنم.

پیش‌نمایش بصری پنل به‌صورت فایل مستقل: `NobatLink Panel.dc.html` (تم دارک).

## دو تکه‌ی بک‌اند که باید اضافه کنی

طراحی UI کامل و وصل است، اما دو endpoint در کدت وجود ندارد:

1. **ورود متخصص** — مسیر موجود `/api/t/<slug>/otp` کوکی «مراجع» می‌نشاند
   (`setClientCookie`)، نه نشست پنل. یک endpoint بساز که بعد از `verifyOtp`
   موفق، `createPanelSession(res, tenantId)` را صدا بزند (مثلا
   `POST /api/t/<slug>/panel/login`) و در `login/page.tsx` آدرس fetch را به آن
   عوض کن. الان به `/api/t/<slug>/otp` وصل است تا فلو تست شود.

2. **ثبت‌نام سلف‌سرویس** — طبق نقشه‌ی راه «فاز ۳» است و endpoint ندارد.
   `signup/page.tsx` به `POST /api/signup` می‌فرستد (که باید ردیف `tenants` +
   `tenant_profiles` را با `slug` و `niche_key` بسازد، سپس OTP و نشست پنل).
   تا آن موقع، فرم با پاسخ 404 حالت «ثبت شد» را نشان می‌دهد تا UI تست شود.

## نکات
- **اعداد:** `toFarsiNum` در کدت از قبل لاتین برمی‌گرداند — پس همه‌جا لاتین می‌ماند. ✅
- **رنگ برند tenant:** مکانیزم `accent`/`theme_color` حفظ شده؛ فقط پیش‌فرضش خاکستری تیره است. اگر می‌خواهی صفحات عمومی tenant هم کاملا مونوکروم باشند، در layout `[slug]` تزریق `--brand` را بردار.
- **پنل ادمین:** حالت تیره و رنگ‌های معنایی `globals.css` (قرمز/کهربایی/…) دست‌نخورده‌اند تا معنایشان (خطا/هشدار) گم نشود.

پیش‌نمایش بصری همین طراحی‌ها به‌صورت فایل‌های مستقل هم در پروژه هست:
`NobatLink Landing.dc.html` و `NobatLink Login.dc.html`.
