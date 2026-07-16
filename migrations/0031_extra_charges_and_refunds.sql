-- 0031 — شارژ اضافه (ارسال لینک پرداخت) + بازپرداخت دستی
-- کاملا additive و امن روی دیتابیس زنده. هیچ drop/rename ندارد.
-- اگر شماره‌ی 0031 قبلا محلی استفاده شده، فقط نام فایل را به شماره‌ی آزاد بعدی تغییر بده.

-- 1) شارژ اضافه — دکتر یک مبلغ دلخواه برای پرونده تعریف می‌کند، در پنل مراجع
--    قابل‌پرداخت (آنلاین یا کارت‌به‌کارت) می‌شود. کاملا مستقل از فلوی
--    مصاحبه/ارزیابی/پروتکل — هیچ نوبتی به آن گره نمی‌خورد و قفل اسلات لازم ندارد.
create table if not exists public.psy_extra_charges (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  resource_id           uuid references public.resources(id) on delete set null,
  case_number           text not null,
  title                 text not null,                          -- بابت چه چیزی («هزینه‌ی ۱۵ دقیقه اضافه»)
  amount                bigint not null check (amount > 0),
  status                text not null default 'awaiting_payment', -- awaiting_payment | payment_submitted | paid
  payment_ref           text,                                    -- متن فیش کارت‌به‌کارت
  payment_reject_reason text,
  created_at            timestamptz not null default now()
);
create index if not exists psy_extra_charges_case_idx on public.psy_extra_charges (tenant_id, case_number);

-- 2) بازپرداخت دستی — برای وقتی دکتر (نه به‌خاطر کنسلی نوبت، بلکه به هر دلیل
--    دیگری) مبلغی به مراجع برمی‌گرداند. برخلاف شارژ اضافه، این یک عمل قطعی و
--    همان لحظه است (نه چیزی که مراجع باید تایید/پرداخت کند) — پس همان لحظه‌ی
--    ثبت هم در این جدول هم در ledger_entries (direction='outflow') می‌نشیند.
create table if not exists public.psy_refunds (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  resource_id  uuid references public.resources(id) on delete set null,
  case_number  text not null,
  amount       bigint not null check (amount > 0),
  note         text,
  recorded_by  text,
  created_at   timestamptz not null default now()
);
create index if not exists psy_refunds_case_idx on public.psy_refunds (tenant_id, case_number);
