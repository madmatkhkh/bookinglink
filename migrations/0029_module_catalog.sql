-- 0029 — کاتالوگ ماژول‌ها (قابلیت = محصول) — فاز 1 سند MODULES.md
-- کاملا additive و امن روی دیتابیس زنده. هیچ drop/rename ندارد.
-- اگر شماره‌ی 0029 قبلا محلی استفاده شده، فقط نام فایل را به شماره‌ی آزاد بعدی تغییر بده.

-- 1) کاتالوگ محصولات نوبت‌لینک -----------------------------------------------
create table if not exists public.modules (
  key           text primary key,
  display_name  text not null,
  description   text not null default '',
  scope         text not null default 'platform',   -- 'platform' | 'psychology' | ...
  depends_on    jsonb not null default '[]',         -- آرایه؛ عضو 'a|b' یعنی «حداقل یکی»
  default_on    boolean not null default false,      -- برای tenantهایی که ردیف tenant_features ندارند
  enforced      boolean not null default false,      -- آیا کد واقعا این کلید را گیت می‌کند؟ (فقط اینها در سوپرادمین سوییچ می‌گیرند)
  pricing_type  text not null default 'included',    -- 'included' | 'addon_monthly' | 'addon_once'
  price         bigint not null default 0,           -- تومان، فعلا فقط نمایشی/فاکتور دستی
  is_active     boolean not null default true,       -- خاموش‌کردن ماژول از کل پلتفرم
  sort_order    integer not null default 0
);

-- 2) ارتقای tenant_features (بدون rename) -------------------------------------
alter table public.tenant_features
  add column if not exists source text not null default 'manual';
  -- 'niche_default' | 'addon' | 'trial' | 'manual'
alter table public.tenant_features
  add column if not exists expires_at timestamptz;

-- 3) seed کاتالوگ — کلیدهای زنده‌ی فعلی عینا حفظ شده‌اند ------------------------
-- enforced=true یعنی گارد سرور همین الان (بعد از این جلسه) فعال است؛
-- بقیه با فازهای بعد (سایدبار داینامیک/جداسازی تب‌ها) enforced می‌شوند.
insert into public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) values
  ('pay_online',                'پرداخت آنلاین (زیبال)',        'درگاه زیبال، تایید خودکار، کمیسیون پلتفرم',                'platform', '[]',                                false /*per-resource فعلا*/, false, 10),
  ('card_to_card',              'پرداخت کارت‌به‌کارت',           'کارت‌به‌کارت با رسید + تب تایید پرداخت‌ها',                 'platform', '[]',                                false, true,  20),
  ('patient_self_cancel',       'کنسل توسط مراجع',              'کنسل از پنل مراجع طبق سیاست کنسلی هر متخصص',               'platform', '[]',                                true,  true,  30),
  ('patient_buy_extra_session', 'خرید جلسه‌ی جایگزین',           'خرید جلسه‌ی اضافه از پنل مراجع',                            'platform', '["pay_online|card_to_card"]',       true,  true,  40),
  ('discount_codes',            'کدهای تخفیف',                  'ساخت و مدیریت کد تخفیف',                                    'platform', '["pay_online|card_to_card"]',       true,  true,  50),
  ('waitlist',                  'لیست انتظار',                  'ثبت‌نام مراجع وقتی ظرفیت خالی نیست + اطلاع‌رسانی دستی',      'platform', '[]',                                true,  true,  60),
  ('reviews',                   'نظرات و امتیاز مراجعان',       'ثبت نظر توسط مراجع + مدیریت و انتشار',                       'platform', '[]',                                true,  true,  70),
  ('analytics',                 'تحلیل کسب‌وکار',               'داشبورد درآمد، no-show، رشد پرونده‌ها',                      'platform', '[]',                                true,  true,  80),
  ('campaigns',                 'کمپین پیامک/ایمیل',            'پیام گروهی به مراجعان (سگمنت غیرفعال 30/90 روز)',            'platform', '[]',                                true,  true,  90),
  ('reminders',                 'یادآور پیامکی نوبت',           'ارسال خودکار یادآور قبل از نوبت (cron)',                     'platform', '[]',                                true,  false, 100),
  ('online_meeting',            'جلسه‌ی آنلاین (لینک)',          'لینک Meet/Zoom/WhatsApp/Bale/تلفن برای جلسه‌های آنلاین',     'platform', '[]',                                true,  false, 110),
  ('multi_therapist',           'حالت کلینیک (چندپرسنلی)',      'ورود مستقل پرسنل، تب پرسنل، انتخابگر متخصص در رزرو',        'platform', '[]',                                false, true,  120),
  ('custom_domain',             'دامنه‌ی اختصاصی',              'اتصال دامنه‌ی خود مشتری (هنوز ساخته نشده)',                  'platform', '[]',                                false, false, 130),
  ('psy_stages',                'مراحل پیش‌ازدرمان',            'فلوی آزاد و تکرارپذیر مصاحبه/ارزیابی/دلخواه',                'psychology', '[]',                              true,  false, 210),
  ('psy_packages',              'پروتکل‌های درمان',             'پکیج جلسات ماهانه',                                          'psychology', '[]',                              true,  false, 220),
  ('clinical_notes',            'یادداشت بالینی (SOAP/DAP)',    'یادداشت ساختاریافته‌ی بالینی per-جلسه',                      'psychology', '[]',                              true,  false, 230),
  ('intake_form',               'فرم‌بیلدر رزرو',               'بخش/سوال/منطق شرطی — کاندید ارتقا به سطح پلتفرم',            'psychology', '[]',                              true,  false, 240)
on conflict (key) do nothing;

-- custom_domain هنوز وجود خارجی ندارد — در کاتالوگ هست ولی از پلتفرم خاموش:
update public.modules set is_active = false where key = 'custom_domain' and enforced = false;
