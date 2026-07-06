-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0006 — فلوی پیش‌ازدرمان آزاد و تکرارپذیر (مصاحبه/ارزیابی)
--
-- قبل: هر پرونده دقیقاً یک «مصاحبه» و یک «ارزیابی» می‌توانست داشته باشد
--      (ستون‌های ثابت interview_*/assessment_* روی psy_cases، فلوی هاردکد در
--      flow_status). بعد: هر پرونده هر تعداد مرحله از هر نوع می‌تواند داشته
--      باشد؛ دکتر بعد از برگزاریِ هر مرحله تصمیم می‌گیرد چه چیزی بعدی است
--      (تکرار، ردکردن، رفتن مستقیم به پروتکلِ درمان).
--
-- ⚠️ این تغییر destructive است (ستون‌های interview_*/assessment_*/booking_date/
-- booking_time/flow_status از psy_cases حذف می‌شوند). چون فعلاً دیتای واقعیِ
-- زنده‌ای برای حفظ‌کردن نیست، ساده‌ترین راه همان روالِ همیشگی است: کلِ
-- supabase-schema.sql را از نو در سوپابیس اجرا کن (بعد از drop کاملِ جدول‌های
-- قبلی). این فایل فقط برای مستندسازیِ دقیقِ تغییر نگه داشته شده؛ لازم نیست
-- جداگانه اجرا شود اگر همان مسیرِ «بازسازیِ کامل» را رفتی.
--
-- اگر یک روز همین تغییر روی یک دیتابیسِ زنده با دیتای واقعی لازم شد، این
-- ALTERها (به‌جایِ drop/recreate) کارِ درست را انجام می‌دهند:
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists psy_stages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_number text not null,
  stage_type text not null,
  status text not null default 'awaiting_payment',
  price bigint not null default 0,
  paid boolean default false,
  payment_submitted boolean default false,
  payment_ref text,
  session_date text default '',
  session_time text default '',
  held boolean default false,
  notes text,
  cancel_notice text,
  resource_id uuid references resources(id),
  created_at timestamptz not null default now()
);
create index if not exists psy_stages_tenant_case_idx on psy_stages (tenant_id, case_number);
create index if not exists psy_stages_tenant_resource_idx on psy_stages (tenant_id, resource_id);
create index if not exists psy_stages_tenant_status_idx on psy_stages (tenant_id, status);
alter table psy_stages enable row level security;

alter table psy_cases add column if not exists current_stage_id uuid references psy_stages(id) on delete set null;

-- روی دیتای واقعی، این‌جا باید هر ردیفِ psy_cases که interview_date/assessment_date
-- پر داشت را به یک ردیفِ psy_stages تبدیل کنی (و اگر مرحله‌ی جاری هنوز باز بود،
-- current_stage_id را به آن ست کنی) قبل از drop کردنِ ستون‌های قدیمی. چون فعلاً
-- دیتای واقعی نیست، این تبدیل این‌جا نوشته نشده — مستقیم drop می‌کنیم:
alter table psy_cases drop column if exists flow_status;
alter table psy_cases drop column if exists booking_date;
alter table psy_cases drop column if exists booking_time;
alter table psy_cases drop column if exists interview_date;
alter table psy_cases drop column if exists interview_time;
alter table psy_cases drop column if exists interview_paid;
alter table psy_cases drop column if exists interview_payment_ref;
alter table psy_cases drop column if exists interview_payment_submitted;
alter table psy_cases drop column if exists interview_price;
alter table psy_cases drop column if exists interview_held;
alter table psy_cases drop column if exists interview_notes;
alter table psy_cases drop column if exists assessment_date;
alter table psy_cases drop column if exists assessment_time;
alter table psy_cases drop column if exists assessment_paid;
alter table psy_cases drop column if exists assessment_payment_ref;
alter table psy_cases drop column if exists assessment_payment_submitted;
alter table psy_cases drop column if exists assessment_price;
alter table psy_cases drop column if exists assessment_held;
alter table psy_cases drop column if exists assessment_notes;

drop index if exists psy_cases_tenant_id_flow_status_idx;
