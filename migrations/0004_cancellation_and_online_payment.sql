-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0004: سیاستِ کنسلیِ قابلِ‌تنظیم + پرداختِ آنلاین (زیبال)
-- additive و امن — هیچ‌چیزِ موجودی را تغییر نمی‌دهد.
--
-- پیش‌فرضِ cancellation_policy دقیقاً همان رفتارِ سراسریِ قبلی است
-- (PSY_CANCEL = { partialHours: 12, partialPercent: 50 }) — یعنی روی
-- tenantهای فعلی هیچ تغییری در نتیجه ایجاد نمی‌شود مگر خودشان عوضش کنند.
-- ─────────────────────────────────────────────────────────────────────────────

alter table psy_resource_profiles add column if not exists cancellation_policy jsonb
  not null default '{"enabled":true,"threshold_hours":12,"early_refund_percent":50,"late_refund_percent":0}';

alter table psy_resource_profiles add column if not exists payment_methods jsonb
  not null default '{"card_to_card":true,"online":false}';

create table if not exists psy_payment_intents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id),
  case_number text not null,
  phone text not null,
  purpose text not null,
  ref_id uuid,
  amount int not null,
  authority text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists psy_payment_intents_authority_idx on psy_payment_intents (tenant_id, authority);
alter table psy_payment_intents enable row level security;
