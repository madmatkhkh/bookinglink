-- 0033 — پایه‌ی حسابداری شفاف: مرجع بانکی، کمیسیون قابل‌تنظیم، تسویه‌ی ردیابی‌شونده
-- کاملا additive و امن روی دیتابیس زنده. هیچ drop/rename/تغییر نوع ندارد.

-- ── تسک ۱: شماره پیگیری بانکی (refNumber زیبال) ──────────────────────────────
-- این عدد را زیبال موقع verify برمی‌گرداند ولی تا الان هیچ‌جا ذخیره نمی‌شد و
-- برای همیشه از دست می‌رفت. برای تطبیق با صورت‌حساب بانکی و ارائه به مالیات
-- حیاتی است. هم روی intent (منبع پرداخت) هم روی ledger (منبع حقیقت حسابداری).
alter table public.psy_payment_intents add column if not exists bank_ref_number text;
alter table public.ledger_entries       add column if not exists bank_ref_number text;

-- ── تسک ۲: کمیسیون سراسری قابل‌تغییر + override به‌ازای هر متخصص ──────────────
-- کمیسیون سراسری تا الان یک ثابت هاردکد در کد (config.ts = 7) بود. برای این‌که
-- بدون دیپلوی مجدد قابل تغییر باشد، به یک ردیف در platform_settings منتقل می‌شود.
-- جدول key/value ساده — هر تنظیم سراسری بعدی هم همین‌جا می‌نشیند.
create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
-- مقدار اولیه = همان ۷٪ فعلی، تا رفتار عوض نشود. اگر ردیف از قبل باشد دست نمی‌خورد.
insert into public.platform_settings (key, value)
  values ('commission_percent', '7'::jsonb)
  on conflict (key) do nothing;

-- override اختیاری per-متخصص: null یعنی «از سراسری تبعیت کن». عددی بین 0 تا 100.
alter table public.psy_resource_profiles
  add column if not exists commission_percent_override numeric;

-- ── تسک ۳: تسویه‌ی ردیابی‌شونده و متصل به تراکنش ─────────────────────────────
-- ستون‌های تازه‌ی settlements: شماره پیگیری بانکی واریز + تاریخ واقعی واریز +
-- وضعیت (تا بشود «ثبت‌شده ولی هنوز واریزنشده» را هم نگه داشت).
alter table public.settlements add column if not exists bank_ref_number text;
alter table public.settlements add column if not exists paid_at         timestamptz;
alter table public.settlements add column if not exists status          text not null default 'paid';

-- جدول واسط: هر تسویه به دقیقا کدام ردیف‌های ledger (تراکنش‌ها) مربوط است.
-- این همان چیزی است که حسابرس می‌خواهد — «این واریز پوشش‌دهنده‌ی این ۴۷ تراکنش».
-- unique روی ledger_entry_id: یک تراکنش نباید در دو تسویه‌ی مختلف حساب شود.
create table if not exists public.settlement_items (
  id              uuid primary key default gen_random_uuid(),
  settlement_id   uuid not null references public.settlements(id) on delete cascade,
  ledger_entry_id uuid not null references public.ledger_entries(id),
  doctor_amount   bigint not null,
  created_at      timestamptz not null default now(),
  unique (ledger_entry_id)
);
create index if not exists settlement_items_settlement_idx on public.settlement_items (settlement_id);
