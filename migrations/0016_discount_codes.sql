-- ─────────────────────────────────────────────────────────────────────────────
-- کدهایِ تخفیف — per-resource. هر متخصص خودش کد می‌سازد (درصدی یا مبلغِ ثابت)،
-- مراجع در لحظه‌ی پرداخت واردش می‌کند. additive — امن روی دیتابیسِ زنده.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists psy_discount_codes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  code text not null,                        -- ذخیره‌شده به‌صورتِ یکدست (حروفِ بزرگِ لاتین/عدد)
  discount_type text not null default 'percent',  -- 'percent' | 'fixed'
  discount_value numeric not null,           -- درصد (۰-۱۰۰) یا مبلغِ ثابت (تومان)
  is_active boolean not null default true,
  max_uses int,                              -- null = نامحدود
  used_count int not null default 0,
  expires_at timestamptz,                    -- null = بدونِ انقضا
  created_at timestamptz not null default now()
);
create unique index if not exists psy_discount_codes_uniq on psy_discount_codes(resource_id, code);
