-- ───────────────────────────────────────────────────────────────────────────
-- 0047 — فاز P3 قیمت‌گذاری (MODULES.md بخش 9.3): سهمیه‌ی پیامک + اعتبار شارژی
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent. تا این migration اجرا نشده، کد جدید ارسال پیامک را
-- نه می‌شمارد نه محدود می‌کند (fail-open) — استقرار از هر دو جهت امن.
--
-- مدل (فلسفه‌ی ledger — فقط INSERT):
--   sms_log:     یک ردیف به‌ازای هر پیامک واقعا ارسال‌شده.
--                charged: 'quota' (سهمیه‌ی ماه جلالی پلن) | 'credit' (بسته‌ی
--                شارژ) | 'over' (پیامک حیاتی مثل OTP که با اتمام هر دو باز هم
--                فرستاده شد — OTP هرگز بلاک نمی‌شود).
--   sms_credits: هر شارژ دستی سوپرادمین یک ردیف (منفی = اصلاح اشتباه).
--                مانده = sum(amount) - count(sms_log با charged='credit').
--
-- سیاست بلاک در کد: فقط ارسال‌های اختیاری (campaign / waitlist / reminder)
-- با اتمام سهمیه+اعتبار متوقف می‌شوند.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.sms_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  kind       text not null,   -- 'otp' | 'reminder' | 'campaign' | 'waitlist'
  charged    text not null default 'quota',  -- 'quota' | 'credit' | 'over'
  created_at timestamptz not null default now()
);
create index if not exists sms_log_tenant_month
  on public.sms_log (tenant_id, charged, created_at);

create table if not exists public.sms_credits (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  amount     integer not null,       -- تعداد پیامک؛ منفی مجاز (اصلاح)
  note       text,
  created_by text not null default 'super',
  created_at timestamptz not null default now()
);
create index if not exists sms_credits_tenant on public.sms_credits (tenant_id);

-- سهمیه‌ی ماهانه‌ی هر پلن (ماه جلالی) — بخش 9.3؛ 'free' قدیمی در کد = پایه.
-- تغییر عددها بدون دیپلوی: همین ردیف را در SQL Editor ویرایش کن.
insert into public.platform_settings (key, value)
  values ('plan_sms_quotas', '{"base": 150, "pro": 500, "team": 1500}'::jsonb)
  on conflict (key) do nothing;
