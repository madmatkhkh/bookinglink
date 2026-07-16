-- 0030 — slot_locks: تنها مرجع ضدتداخل زمان (راه‌حل اساسی برای مقیاس بالا)
-- کاملا additive و امن روی دیتابیس زنده.
--
-- ایده: هر رزرو (مصاحبه/ارزیابی/جلسه‌ی پکیج/جلسه‌ی جایگزین) قبل از هرچیز باید
-- یک ردیف در این جدول بگیرد. UNIQUE روی (tenant, resource, date, time) تضمین
-- می‌کند دو رزرو — از هر جدولی — هرگز یک اسلات را هم‌زمان نگیرند. برنامه دیگر
-- «اول چک کن گرفته‌شده؟» نمی‌کند (که در همزمانی می‌شکند)؛ فقط INSERT می‌زند و
-- 23505 یعنی گرفته‌شده. این اتمی و بین‌جدولی است.
--
-- status:
--   'pending' → قفل موقت (مراجع در حال پرداخت است)؛ با expires_at منقضی می‌شود.
--   'active'  → رزرو نهایی (پرداخت شد / رایگان بود / دکتر تایید کرد).
-- source_table/source_id → این قفل به کدام ردیف واقعی تعلق دارد (psy_stages/psy_sessions).

create table if not exists public.slot_locks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  resource_id   uuid not null,
  session_date  text not null,
  session_time  text not null,
  status        text not null default 'active',      -- 'pending' | 'active'
  source_table  text,                                -- 'psy_stages' | 'psy_sessions'
  source_id     uuid,
  case_number   text,
  expires_at    timestamptz,                         -- فقط برای pending
  created_at    timestamptz not null default now()
);

-- قلب سیستم: یک اسلات فعال/معلق فقط یک‌بار. INSERT دوم → 23505.
create unique index if not exists slot_locks_uniq
  on public.slot_locks (tenant_id, resource_id, session_date, session_time);

-- برای پاک‌سازی سریع قفل‌های منقضی‌شده
create index if not exists slot_locks_expiry
  on public.slot_locks (expires_at) where (status = 'pending');

-- برای یافتن قفل یک رزرو هنگام لغو/آزادسازی
create index if not exists slot_locks_source
  on public.slot_locks (source_table, source_id);

-- ── Backfill: رزروهای موجود که تاریخ/ساعت دارند → قفل active ─────────────────
-- ابتدا مرحله‌ها (مصاحبه/ارزیابی booked)، سپس جلسه‌ها. on conflict do nothing
-- تا اگر تداخل تاریخی وجود دارد (نباید باشد) اجرا نشکند.
insert into public.slot_locks (tenant_id, resource_id, session_date, session_time, status, source_table, source_id, case_number)
select tenant_id, resource_id, session_date, session_time, 'active', 'psy_stages', id, case_number
from public.psy_stages
where session_date is not null and session_date <> '' and session_time is not null and session_time <> ''
  and resource_id is not null
on conflict (tenant_id, resource_id, session_date, session_time) do nothing;

insert into public.slot_locks (tenant_id, resource_id, session_date, session_time, status, source_table, source_id, case_number)
select tenant_id, resource_id, session_date, session_time, 'active', 'psy_sessions', id, case_number
from public.psy_sessions
where session_date is not null and session_date <> '' and session_time is not null and session_time <> ''
  and resource_id is not null
on conflict (tenant_id, resource_id, session_date, session_time) do nothing;

-- ── اسلات‌های انتخاب‌شده‌ی پروتکل قبل از پرداخت (گزینه الف) ──────────────────
-- پرداخت آنلاین پروتکل حالا «اول انتخاب همه‌ی جلسات، بعد پرداخت» است. اسلات‌های
-- انتخاب‌شده اینجا (روی intent) نگه داشته می‌شوند تا callback بعد از پرداخت
-- موفق، جلسات واقعی را از رویشان بسازد.
alter table public.psy_payment_intents
  add column if not exists package_slots jsonb;

