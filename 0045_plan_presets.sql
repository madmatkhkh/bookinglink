-- ───────────────────────────────────────────────────────────────────────────
-- 0045 — فاز P1 قیمت‌گذاری (MODULES.md بخش 9): پلن‌ها + grandfathering
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent. هیچ رفتاری برای tenantهای موجود عوض نمی‌شود:
--   1) constraint پلن باز می‌شود تا 'base' و 'team' هم مجاز باشند
--      ('free' قدیمی می‌ماند و در کد alias پلن پایه است — UPDATE روی دیتای زنده نداریم).
--   2) دو اصلاح نمایشی کاتالوگ (بخش 9.2) — کلیدها دست‌نخورده.
--   3) grandfathering (بخش 9.7): برای هر tenant موجود، به‌ازای هر ماژول
--      پلتفرمی که امروز از راه default_on روشن است، یک ردیف صریح کاشته
--      می‌شود تا با اعمال preset پلن‌ها چیزی از دست ندهند.
--   4) کلید 'plans_enforced' در platform_settings: تا وقتی true نشده، کد
--      preset پلن را اصلا اعمال نمی‌کند (دیپلوی کد قبل از این migration
--      هیچ‌چیز را نمی‌شکند — همان الگوی fail-open ماژول‌ها).
-- ترتیب حل بعد از این migration (بخش 9.8):
--   is_active=false → خاموش ← ردیف tenant_features ← preset پلن ← default_on
-- ───────────────────────────────────────────────────────────────────────────

-- 1) پلن‌های جدید در constraint (free قدیمی حفظ می‌شود)
alter table public.tenants drop constraint if exists tenants_plan_check;
alter table public.tenants add constraint tenants_plan_check
  check (plan = any (array['free'::text, 'base'::text, 'pro'::text, 'team'::text]));

-- 2) اصلاح نمایشی کاتالوگ — واژگان نیچی از لایه‌ی پلتفرم حذف (بخش 9.2)
update public.modules set
  display_name = 'چندپرسنلی (تیم)',
  description  = 'ورود مستقل پرسنل، تب پرسنل، انتخابگر پرسنل در رزرو'
  where key = 'multi_therapist';
update public.modules set description = 'کنسل از پنل مشتری طبق سیاست کنسلی هر مجموعه'
  where key = 'patient_self_cancel';
update public.modules set description = 'خرید جلسه‌ی اضافه از پنل مشتری'
  where key = 'patient_buy_extra_session';
update public.modules set description = 'ثبت‌نام مشتری وقتی ظرفیت خالی نیست + اطلاع‌رسانی دستی'
  where key = 'waitlist';
update public.modules set display_name = 'نظرات و امتیاز مشتریان',
  description = 'ثبت نظر توسط مشتری + مدیریت و انتشار'
  where key = 'reviews';
update public.modules set description = 'پیام گروهی به مشتریان (سگمنت غیرفعال 30/90 روز)'
  where key = 'campaigns';

-- 3) grandfathering — ردیف صریح برای وضعیت روشن امروز (فقط ماژول‌های platform؛
--    ماژول‌های نیچی از preset پلن عبور نمی‌کنند و default_on برایشان کافی است).
--    ON CONFLICT: ردیف موجود (سوییچ دستی سوپرادمین) هرگز بازنویسی نمی‌شود.
insert into public.tenant_features (tenant_id, feature_key, enabled, source)
select t.id, m.key, true, 'manual'
from public.tenants t
cross join public.modules m
where m.scope = 'platform' and m.default_on = true and m.is_active = true
on conflict (tenant_id, feature_key) do nothing;

-- 4) از این به بعد کد اجازه‌ی اعمال preset پلن را دارد
insert into public.platform_settings (key, value)
  values ('plans_enforced', 'true'::jsonb)
  on conflict (key) do nothing;
