-- ───────────────────────────────────────────────────────────────────────────
-- 0052 — قالب پیامک سفارشی هر tenant + بازبینی اجباری پیش از ارسال
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent.
--
-- چرا این جدول لازم شد: تا امروز متن یادآوری نوبت یک الگوی ثابت در پنل sms.ir
-- بود (SMS_IR_REMINDER_TEMPLATE_ID) و همه‌ی tenantها دقیقا یک جمله می‌فرستادند.
-- متن سفارشی از مسیر send/verify ممکن نیست (فقط پارامتر می‌گیرد)، پس باید از
-- send/bulk روی خط اختصاصی برود — و آن خط، خطِ پلتفرم است نه خط هر مطب.
--
-- نتیجه‌ی مستقیم این واقعیت: ریسک متمرکز است. اگر یک tenant متن تبلیغاتی
-- بفرستد، خط پلتفرم بلک‌لیست می‌شود و OTP همه‌ی tenantهای دیگر هم می‌خوابد.
-- برای همین status اجباری است و ارسال فقط با 'approved' انجام می‌شود:
--
--   pending_review  →  (سوپرادمین)  →  approved | rejected
--
-- و هر ویرایشی status را دوباره به pending_review برمی‌گرداند (منطق در
-- API؛ این‌جا فقط مقدار پیش‌فرض). بدون آن قاعده، tenant می‌توانست یک متن
-- بی‌خطر تایید بگیرد و بعد محتوایش را عوض کند.
--
-- kind فعلا فقط 'reminder' است. عمدا CHECK صریح دارد تا اضافه‌شدن نوع جدید
-- یک تصمیم آگاهانه با migration باشد، نه یک رشته‌ی تایپی که بی‌صدا ذخیره شود.
--
-- یک ردیف به‌ازای هر (tenant, kind) — قالب ویرایش می‌شود، نه اینکه نسخه‌ی
-- جدید انباشته شود. تاریخچه‌ی نسخه‌ها نیاز امروز نیست.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.sms_templates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  kind          text not null default 'reminder',
  body          text not null,
  status        text not null default 'pending_review',
  review_note   text,                      -- دلیل رد، که به خود tenant نشان داده می‌شود
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sms_templates_kind_check   check (kind = any (array['reminder'::text])),
  constraint sms_templates_status_check check (status = any (array['pending_review'::text, 'approved'::text, 'rejected'::text]))
);

create unique index if not exists sms_templates_tenant_kind_uniq
  on public.sms_templates (tenant_id, kind);

-- cron یادآوری هر شب فقط ردیف‌های approved را می‌خواند
create index if not exists sms_templates_status_idx
  on public.sms_templates (status);
