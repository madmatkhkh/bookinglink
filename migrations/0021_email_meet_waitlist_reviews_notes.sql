-- ─────────────────────────────────────────────────────────────────────────────
-- additive — امن روی دیتابیسِ زنده. پیاده‌سازیِ درخواستِ «قابلیت‌هایی که رقبا
-- دارن و ما نداریم» (بجز همگام‌سازیِ گوگل‌کلندر و صورتحسابِ بیمه که کنار گذاشته شد).
-- ─────────────────────────────────────────────────────────────────────────────

-- ۱) ورودِ ایمیلی — برای مراجع/مشتریِ خارج از ایران که پیامکِ ایرانی بهش نمی‌رسه.
--    ستونِ phone در otps از این پس یک شناسه‌ی عمومی است (شماره یا ایمیل)؛
--    channel مشخص می‌کند کدام.
alter table otps add column if not exists channel text not null default 'sms';

alter table psy_cases add column if not exists contact_email text;
alter table psy_cases add column if not exists contact2_email text;

-- ۲) لینکِ گوگل‌میتِ جلسه‌ی آنلاین — بدونِ نیازِ به OAuth/اتصالِ گوگل‌کلندر:
--    دکتر لینکِ ثابتِ خودش را (که از حساب Gmail/Google خودش ساخته) این‌جا
--    می‌چسباند؛ می‌تواند به‌ازای هر جلسه هم override کند.
alter table psy_resource_profiles add column if not exists meet_link text not null default '';
alter table psy_sessions add column if not exists meet_link text;
alter table psy_stages add column if not exists meet_link text;

-- ۳) لیستِ انتظار — وقتی مراجع روزی را می‌خواهد که پر است
create table if not exists psy_waitlist (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id) on delete cascade,
  case_number text not null,
  contact_phone text not null default '',
  contact_email text not null default '',
  session_type text,             -- 'online' | 'offline' | null (فرقی نمی‌کند)
  note text not null default '', -- مثلاً «فقط عصرها» یا «تا آخرِ ماه»
  status text not null default 'pending', -- pending | notified | done | cancelled
  created_at timestamptz not null default now()
);
create index if not exists psy_waitlist_tenant_idx on psy_waitlist (tenant_id, resource_id, status);
alter table psy_waitlist enable row level security;

-- ۴) نظر/امتیازِ واقعیِ مراجع — جایگزینِ بجِ فیکسِ حذف‌شده
create table if not exists psy_reviews (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id) on delete cascade,
  case_number text not null,
  rating int not null check (rating between 1 and 5),
  comment text not null default '',
  status text not null default 'pending', -- pending | approved | hidden
  created_at timestamptz not null default now(),
  unique (tenant_id, case_number, resource_id)  -- هر پرونده فقط یک نظر برای هر دکتر
);
create index if not exists psy_reviews_resource_idx on psy_reviews (resource_id, status);
alter table psy_reviews enable row level security;

-- ۵) یادداشتِ بالینیِ ساختاریافته (SOAP/DAP) — کاملاً خصوصی، هرگز به مراجع نشان
--    داده نمی‌شود؛ جدا از psy_sessions.doctor_note_for_patient (که برایِ مراجع است).
create table if not exists psy_clinical_notes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_number text not null,
  resource_id uuid references resources(id) on delete cascade,
  session_id uuid references psy_sessions(id) on delete set null,
  stage_id uuid references psy_stages(id) on delete set null,
  format text not null default 'soap', -- soap | dap | freeform
  fields jsonb not null default '{}',  -- {subjective,objective,assessment,plan} یا {data,assessment,plan} یا {note}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists psy_clinical_notes_case_idx on psy_clinical_notes (tenant_id, case_number);
alter table psy_clinical_notes enable row level security;

-- ۶) تاریخچه‌ی کمپینِ پیامکی/ایمیلی (بلاست به مراجعان) — فقط لاگ، ارسال هم‌زمان است
create table if not exists psy_campaigns (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id) on delete cascade,
  channel text not null,        -- 'sms' | 'email'
  segment text not null,        -- 'all' | 'inactive_30' | 'inactive_90'
  message text not null,
  recipient_count int not null default 0,
  sent_by text,                 -- 'owner' | 'staff'
  created_at timestamptz not null default now()
);
alter table psy_campaigns enable row level security;
