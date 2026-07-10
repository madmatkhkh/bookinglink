-- ─────────────────────────────────────────────────────────────────────────────
-- تیکت پشتیبانی — متخصص/درمانگر از پنل خودش مشکل یا درخواست قابلیت تازه ثبت
-- می‌کند؛ سوپرادمین از /super/tickets می‌بیند و پاسخ/وضعیت را عوض می‌کند.
-- additive — امن روی دیتابیس زنده.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists support_tickets (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id),
  submitted_by_name text not null default '',
  category text not null default 'other',   -- 'bug' | 'feature' | 'billing' | 'other'
  subject text not null,
  message text not null,
  status text not null default 'open',      -- 'open' | 'in_progress' | 'resolved' | 'closed'
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_tenant_idx on support_tickets(tenant_id);
create index if not exists support_tickets_status_idx on support_tickets(status);
