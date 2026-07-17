-- 0039 — دو کار additive و امن روی دیتابیس زنده:
--  (الف) تضمین وجود جدول یادداشت بالینی و ستون‌های session_id/stage_id.
--        بدون این ستون‌ها، یادداشت بالینی گره‌خورده به یک جلسه ذخیره/بازیابی
--        نمی‌شد و دکتر بعد از ثبت آن را نمی‌دید.
--  (ب) افزودن session_type به psy_stages تا نوع هر جلسه (آنلاین/حضوری) مستقل
--        از نوع کلی پرونده تعیین شود. null یعنی از نوع پرونده ارث می‌برد.

create table if not exists public.psy_clinical_notes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  case_number text not null,
  resource_id uuid,
  session_id  uuid,
  stage_id    uuid,
  format      text not null default 'soap',
  fields      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.psy_clinical_notes add column if not exists session_id uuid;
alter table public.psy_clinical_notes add column if not exists stage_id uuid;
create index if not exists psy_clinical_notes_case_idx on public.psy_clinical_notes (tenant_id, case_number);

alter table public.psy_stages add column if not exists session_type text;
