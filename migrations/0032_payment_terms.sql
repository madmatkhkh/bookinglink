-- 0032 — شرایط و مقررات قبل از پرداخت (اختیاری، به‌ازای هر متخصص)
-- additive و امن روی دیتابیس زنده.

alter table public.psy_resource_profiles
  add column if not exists terms jsonb not null default '{"enabled": false, "extra": ""}'::jsonb;
