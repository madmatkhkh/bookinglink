-- ─────────────────────────────────────────────────────────────────────────────
-- سیستمِ حسابداریِ نوبت‌لینک (جولای ۲۰۲۶)
--
-- دو جدول:
-- 1) ledger_entries — دفترِ حساب. هر تراکنشِ نهایی‌شده (آنلاین یا کارت‌به‌کارت)
--    یک ردیفِ *تغییرناپذیر* اینجا می‌سازد. منبعِ حقیقتِ حسابداری. هیچ‌وقت
--    ویرایش/حذف نمی‌شود؛ فقط INSERT. برایِ مستنداتِ دائمی و ردگیریِ اختلاف.
-- 2) settlements — دفترِ تسویه. وقتی سوپرادمین سهمِ یک دکتر را دستی/بانکی واریز
--    کرد، اینجا ثبت می‌کند تا معلوم باشد چه مقدار از بدهیِ پلتفرم به دکتر
--    تسویه شده و چه مقدار معوق مانده.
--
-- additive — امن روی دیتابیسِ زنده.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists ledger_entries (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id),
  case_number text,
  -- نوعِ آیتم: مصاحبه/ارزیابی/پروتکل/جلسه/بازپرداخت
  purpose text not null,          -- 'interview' | 'assessment' | 'package' | 'session' | 'refund'
  -- روشِ پرداخت
  method text not null,           -- 'online' | 'card_to_card'
  -- جهتِ پول از دیدِ کلِ سیستم: پرداختِ مراجع (+) یا بازپرداخت به مراجع (−)
  direction text not null default 'inflow',  -- 'inflow' | 'outflow'
  amount bigint not null,         -- تومان، همیشه مثبت؛ جهت با direction مشخص می‌شود
  -- سهمِ پلتفرم و دکتر (فقط برایِ تراکنشِ آنلاین معنی دارد؛ کارت‌به‌کارت مستقیم
  -- بینِ مراجع و دکتر است، سهمِ پلتفرم = 0)
  commission_amount bigint not null default 0,
  doctor_amount bigint not null default 0,
  -- ردِ منبع — کدام رکورد این تراکنش را ساخت (برایِ حسابرسی/تطبیق)
  source_table text,              -- 'psy_stages' | 'psy_packages' | 'psy_sessions' | 'psy_payment_intents'
  source_id uuid,
  payment_intent_id uuid,         -- اگر آنلاین بود، لینک به psy_payment_intents
  -- برایِ تراکنشِ آنلاین: آیا سهمِ دکتر خودکار (تسهیمِ زیبال) واریز شده؟
  split_applied boolean not null default false,
  -- چه کسی ثبت کرد (برایِ کارت‌به‌کارت = تاییدکننده)
  recorded_by text,               -- 'system' | 'owner' | 'staff' | 'zibal_callback'
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ledger_tenant_idx on ledger_entries(tenant_id);
create index if not exists ledger_resource_idx on ledger_entries(resource_id);
create index if not exists ledger_created_idx on ledger_entries(created_at);
-- جلوگیری از ثبتِ دوباره‌ی یک تراکنشِ واحد (idempotency) — یک source یک بار
create unique index if not exists ledger_source_uniq on ledger_entries(source_table, source_id, purpose)
  where source_table is not null and source_id is not null;

create table if not exists settlements (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id),
  -- مبلغی که پلتفرم بابتِ سهمِ دکتر به او واریز کرده
  amount bigint not null,
  method text not null default 'manual',   -- 'manual' | 'auto_split'
  -- بازه‌ای که این تسویه پوششش می‌دهد (اختیاری، برایِ مستندسازی)
  covers_from timestamptz,
  covers_to timestamptz,
  reference text,                 -- شماره‌ی پیگیریِ واریزِ بانکی
  note text,
  recorded_by text default 'super',
  created_at timestamptz not null default now()
);
create index if not exists settlements_tenant_idx on settlements(tenant_id);
create index if not exists settlements_resource_idx on settlements(resource_id);
