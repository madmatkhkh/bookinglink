-- ───────────────────────────────────────────────────────────────────────────
-- 0049 — فاز P5 قیمت‌گذاری (MODULES.md بخش 9.6/9.9): جدول فاکتورها
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent. فاکتور = صورت‌حساب ماه جلالی هر tenant، ساخته‌شده از
-- روی ledger (که تغییرناپذیر است، پس اعداد فاکتور پایدارند): حق اشتراک +
-- جمع کارمزدهای تراکنش همان ماه، همه با تفکیک پایه/مالیات بر ارزش افزوده.
--
-- صدور: در همان cron بیلینگ (/api/cron/subscriptions) — برای «ماه قبل» (که
-- کامل شده) اگر فاکتوری با اقلام غیرصفر قابل‌ساخت باشد و قبلا صادر نشده باشد.
-- idempotent با unique (tenant_id, period_key).
--
-- نکته: کارمزدهای «مدل قدیمی» (override per-متخصص یا پیش از 0046) ستون تفکیک
-- ندارند و روی فاکتور نمی‌آیند — فاکتور فقط مدل جدید را پوشش می‌دهد (مستند در
-- چنج‌لاگ). status فعلا همیشه 'issued' است؛ چرخه‌ی paid با تسویه در فاز بعد.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  period_key         text not null,                -- '1405/04' (ماه جلالی)
  status             text not null default 'issued',
  vat_rate           numeric not null default 10,  -- نرخ لحظه‌ی صدور (دیتا، نه هاردکد)
  subscription_base  bigint not null default 0,
  subscription_vat   bigint not null default 0,
  txn_fee_base       bigint not null default 0,
  txn_fee_vat        bigint not null default 0,
  txn_count          integer not null default 0,
  total_base         bigint not null default 0,
  total_vat          bigint not null default 0,
  total              bigint not null default 0,
  created_at         timestamptz not null default now()
);
create unique index if not exists invoices_tenant_period_uniq
  on public.invoices (tenant_id, period_key);
