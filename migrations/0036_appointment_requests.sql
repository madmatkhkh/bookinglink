-- 0036 — درخواست نوبت جدید توسط مراجع
-- additive و امن. مراجعی که مرحله‌ی بازی ندارد (تمام‌شده یا برگشته) می‌تواند
-- درخواست نوبت جدید با یک توضیح ثبت کند؛ دکتر تأیید یا رد می‌کند. تأیید یعنی
-- دکتر یک مرحله‌ی جدید برای پرونده می‌سازد (همان فلوی موجود).

create table if not exists public.psy_appointment_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  resource_id   uuid references public.resources(id) on delete set null,
  case_number   text not null,
  note          text,                                  -- توضیح مراجع درباره‌ی درخواست
  status        text not null default 'pending',        -- pending | approved | rejected
  reject_reason text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists psy_appointment_requests_case_idx on public.psy_appointment_requests (tenant_id, case_number);
create index if not exists psy_appointment_requests_pending_idx on public.psy_appointment_requests (tenant_id, status);
