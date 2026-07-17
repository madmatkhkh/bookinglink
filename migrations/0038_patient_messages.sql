-- 0038 — پیام‌های متخصص برای مراجع (دارو / تجویز / توصیه / عمومی)
-- کاملا additive و امن روی دیتابیس زنده. هیچ drop/rename ندارد.
-- یک کانال یک‌طرفه متخصص→مراجع، جدا از «یادداشت بالینی» (که خصوصی است و هرگز
-- به مراجع نشان داده نمی‌شود) و جدا از «یادداشت برای مراجع» هر جلسه (که به یک
-- جلسه‌ی خاص گره خورده). این‌جا پیام مستقل از جلسه است — مثل تجویز دارو یا توصیه.

create table if not exists public.psy_patient_messages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  resource_id  uuid references public.resources(id) on delete set null,
  case_number  text not null,
  kind         text not null default 'general',   -- medication | prescription | recommendation | general
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists psy_patient_messages_case_idx on public.psy_patient_messages (tenant_id, case_number);
