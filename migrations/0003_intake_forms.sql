-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0003: فرمِ رزروِ قابلِ‌تنظیم (per-resource)
-- additive و امن — یک جدولِ جدید، هیچ‌چیزِ موجودی تغییر نمی‌کند.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists psy_intake_forms (
  resource_id uuid primary key references resources(id) on delete cascade,
  schema jsonb not null default '{"sections":[]}',
  updated_at timestamptz not null default now()
);
alter table psy_intake_forms enable row level security;
