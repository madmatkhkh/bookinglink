-- ─────────────────────────────────────────────────────────────────────────────
-- اسکیمای پلتفرمِ نوبت‌دهیِ چند‌مستاجریِ چند‌نیچی (Multi-tenant, Multi-niche)
--
-- سه اصلِ معماری:
--   ۱. ساختار = کد، محتوا و قابلیت = دیتا. (تفاوتِ نیچ‌ها هرگز کدِ جدا نیست)
--   ۲. هر رزرو می‌تواند به یک «منبع» (پرسنل) وصل باشد؛ برای تک‌نفره‌ها یک منبعِ پیش‌فرض.
--   ۳. اسلات ذخیره نمی‌شود، محاسبه می‌شود؛ ضامنِ همزمانی، unique index دیتابیس است.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۱ — نیچ‌ها (تمپلیت‌ها): محتوای پیش‌فرضِ هر نوع کسب‌وکار، همه به‌صورتِ دیتا
-- ═══════════════════════════════════════════════════════════════════════════
create table niches (
  key text primary key,
  display_name text not null,
  tagline text not null default '',
  icon text not null default '',
  client_label text not null default 'مراجع',
  resource_label text not null default 'ارائه‌دهنده',
  booking_label text not null default 'نوبت',
  default_theme text not null default '13 148 136',
  record_fields jsonb not null default '[]',
  default_features jsonb not null default '[]',
  sample_services jsonb not null default '[]',
  setup_price bigint not null default 0,
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۲ — مستاجرها
-- ═══════════════════════════════════════════════════════════════════════════
create table tenants (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  custom_domain text unique,
  domain_verified boolean not null default false,
  niche_key text not null references niches(key) default 'psychology',
  status text not null default 'active' check (status in ('active', 'suspended', 'pending')),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  owner_phone text not null,
  owner_session uuid,
  created_at timestamptz not null default now()
);
create index on tenants (custom_domain);
create index on tenants (niche_key);

create table tenant_profiles (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  display_name text not null default '',
  title text not null default '',
  bio text not null default '',
  avatar_url text,
  theme_color text not null default '13 148 136',
  location_text text not null default '',
  instagram_handle text,
  card_number text not null default '',
  card_holder_name text not null default ''
);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۳ — منابع (پرسنل): قلبِ قابلیتِ چند‌منبعی
-- ═══════════════════════════════════════════════════════════════════════════
create table resources (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  title text not null default '',
  avatar_url text,
  is_active boolean not null default true,
  is_selectable boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on resources (tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۴ — سرویس‌ها
-- ═══════════════════════════════════════════════════════════════════════════
create table services (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  duration_minutes int not null default 60 check (duration_minutes between 10 and 480),
  price bigint not null default 0,
  mode text not null default 'online' check (mode in ('online', 'in_person', 'both')),
  description text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on services (tenant_id);

-- کدام منبع‌ها این سرویس را می‌دهند؟ نبودِ ردیف = همه‌ی منبع‌ها می‌دهند.
create table service_resources (
  service_id uuid not null references services(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  primary key (service_id, resource_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۵ — برنامه‌ی کاری: به‌ازای هر منبع
-- ═══════════════════════════════════════════════════════════════════════════
create table weekly_schedules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time text not null,
  end_time text not null,
  mode text not null default 'both' check (mode in ('online', 'in_person', 'both'))
);
create index on weekly_schedules (tenant_id, resource_id);

create table schedule_overrides (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  date text not null,
  type text not null check (type in ('closed', 'custom')),
  start_time text,
  end_time text,
  mode text default 'both' check (mode in ('online', 'in_person', 'both'))
);
create index on schedule_overrides (tenant_id, resource_id, date);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۶ — رزروها: به یک منبع گره می‌خورند
-- ═══════════════════════════════════════════════════════════════════════════
create table bookings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid not null references resources(id),
  service_id uuid not null references services(id),
  booking_date text not null,
  booking_time text not null,
  booking_ts bigint not null,
  client_name text not null,
  client_phone text not null,
  status text not null default 'pending_payment' check (status in
    ('pending_payment', 'payment_submitted', 'confirmed', 'cancelled', 'completed', 'no_show')),
  payment_ref text,
  price_snapshot bigint not null default 0,
  client_note text not null default '',
  created_at timestamptz not null default now()
);
create index on bookings (tenant_id, booking_date);
create index on bookings (tenant_id, client_phone);
create index on bookings (tenant_id, status);
create index on bookings (tenant_id, resource_id, booking_date);

-- ضامنِ همزمانی حالا شاملِ منبع: یک منبع در یک تاریخ/ساعت فقط یک رزروِ زنده.
create unique index bookings_slot_unique
  on bookings (tenant_id, resource_id, booking_date, booking_time)
  where status not in ('cancelled');

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۷ — پرونده‌ی مراجع/مشتری: اسکلتِ مشترک، فیلدهای نیچ‌محور
-- ═══════════════════════════════════════════════════════════════════════════
create table client_records (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  client_phone text not null,
  client_name text not null default '',
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_phone)
);
create index on client_records (tenant_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۸ — زیرساخت‌های مشترک
-- ═══════════════════════════════════════════════════════════════════════════
create table otps (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on otps (phone);

create table tenant_features (
  tenant_id uuid not null references tenants(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}',
  primary key (tenant_id, feature_key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS روی همه‌ی جدول‌ها؛ دسترسی فقط از سمتِ سرور با service_role.
-- ─────────────────────────────────────────────────────────────────────────────
alter table niches enable row level security;
alter table tenants enable row level security;
alter table tenant_profiles enable row level security;
alter table resources enable row level security;
alter table services enable row level security;
alter table service_resources enable row level security;
alter table weekly_schedules enable row level security;
alter table schedule_overrides enable row level security;
alter table bookings enable row level security;
alter table client_records enable row level security;
alter table otps enable row level security;
alter table tenant_features enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- داده‌ی اولیه‌ی نیچ‌ها — دو تمپلیتِ آغازین
-- ═══════════════════════════════════════════════════════════════════════════
insert into niches (key, display_name, tagline, icon, client_label, resource_label, booking_label, default_theme, record_fields, default_features, sample_services, setup_price, sort_order) values
(
  'psychology',
  'روانشناسی و روان‌پزشکی',
  'صفحه‌ی نوبت‌دهیِ اختصاصی برای رواندرمانگرها، مشاورها و روان‌پزشک‌ها',
  'brain',
  'مراجع', 'درمانگر', 'جلسه',
  '124 58 237',
  '[
    {"key":"diagnosis","label":"تشخیص / علتِ مراجعه","type":"text"},
    {"key":"medication","label":"داروهای فعلی","type":"textarea"},
    {"key":"session_count","label":"تعداد جلساتِ گذشته","type":"number"},
    {"key":"notes","label":"یادداشتِ درمانگر","type":"textarea"}
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"name":"جلسه‌ی مشاوره‌ی فردی","duration_minutes":60,"price":0,"mode":"both"},
    {"name":"مصاحبه‌ی اولیه","duration_minutes":45,"price":0,"mode":"both"}
  ]'::jsonb,
  0, 1
),
(
  'beauty_salon',
  'سالنِ زیبایی',
  'رزروِ آنلاین برای سالن‌های زیبایی، آرایشگاه‌ها و مراکزِ مراقبتِ پوست',
  'sparkles',
  'مشتری', 'آرایشگر', 'رزرو',
  '212 83 126',
  '[
    {"key":"skin_hair_type","label":"نوعِ پوست / مو","type":"text"},
    {"key":"allergies","label":"حساسیت‌ها","type":"textarea"},
    {"key":"past_services","label":"سرویس‌های قبلی","type":"textarea"},
    {"key":"notes","label":"یادداشت","type":"textarea"}
  ]'::jsonb,
  '["multi_resource"]'::jsonb,
  '[
    {"name":"کوتاهی و اصلاح","duration_minutes":45,"price":0,"mode":"in_person"},
    {"name":"رنگ و مش","duration_minutes":120,"price":0,"mode":"in_person"},
    {"name":"میکاپ","duration_minutes":90,"price":0,"mode":"in_person"}
  ]'::jsonb,
  0, 2
);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش ۹ — جدول‌های تخصصیِ نیچِ روانشناسی (از psych-booking، حالا multi-tenant)
--
-- این‌ها فقط برای tenantهای نیچِ روانشناسی استفاده می‌شوند. نیچ‌های دیگر
-- (سالن و…) این جدول‌ها را نادیده می‌گیرند و از جدول‌های عمومیِ بالا استفاده
-- می‌کنند. اصلِ «ساختار=کد، محتوا=دیتا» حفظ می‌شود: این‌ها ساختارِ خاصِ فلوی
-- سه‌مرحله‌ای روانشناسیِ کودک‌اند که یک نیچ به آن نیاز دارد.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── پرونده و رزروِ تخصصیِ روانشناسی ─────────────────────────────────────────
-- معادلِ bookings در psych-booking، ولی با tenant_id. کلیدِ منطقی: case_number
-- (یکتا در هر tenant). فلوی سه‌مرحله‌ای روی flow_status.
create table psy_cases (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_number text not null,
  -- هویتِ کودک و خانواده (پرونده‌ی کامل؛ فرمِ مصاحبه این‌ها را پر می‌کند)
  child_name text not null default '',
  child_name_en text,
  birth_date text,
  parent_name text,
  phone text,
  father_name text, father_phone text,
  mother_name text, mother_phone text,
  reason text,
  session_type text,           -- 'online' | 'offline'
  office_location text,
  -- کلِ فیلدهای تفصیلیِ پرونده در یک jsonb (تا افزودن/حذفِ فیلد نیازی به migration نداشته باشد)
  -- فرمِ مصاحبه و تبِ پرونده می‌توانند این را برای نیچ‌های مختلف (کودک/بزرگسال) متفاوت پر کنند.
  details jsonb not null default '{}',
  -- فلوی سه‌مرحله‌ای
  flow_status text not null default 'interview_awaiting_payment',
  reject_reason text,
  -- مرحله‌ی ۱: مصاحبه
  interview_date text, interview_time text,
  interview_paid boolean default false,
  interview_payment_ref text,
  interview_payment_submitted boolean default false,
  interview_price bigint default 0,
  interview_held boolean default false,
  interview_notes text,
  -- مرحله‌ی ۲: ارزیابی
  assessment_date text, assessment_time text,
  assessment_paid boolean default false,
  assessment_payment_ref text,
  assessment_payment_submitted boolean default false,
  assessment_price bigint default 0,
  assessment_held boolean default false,
  assessment_notes text,
  -- یادداشتِ کلیِ دکتر
  doctor_notes text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (tenant_id, case_number)
);
create index on psy_cases (tenant_id);
create index on psy_cases (tenant_id, flow_status);
create index on psy_cases (tenant_id, phone);

-- ── جلسه‌های پروتکلِ درمان (مرحله‌ی ۳) ──────────────────────────────────────
create table psy_sessions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_number text not null,
  session_number int not null default 1,
  session_date text not null default '',
  session_time text not null default '',
  session_type text,           -- 'online' | 'offline'
  attendee text,               -- چه کسی حاضر می‌شود
  price bigint default 0,
  paid boolean default false,
  payment_submitted boolean default false,
  payment_ref text,
  status text not null default 'confirmed',
  -- کنسلی و بازپرداخت
  refund_status text,          -- null | 'pending' | 'done'
  refund_percent int default 0,-- درصدی که به مراجع برمی‌گردد
  refund_amount bigint default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index on psy_sessions (tenant_id, case_number);
create index on psy_sessions (tenant_id, session_date);

-- ── پکیج‌های درمان ──────────────────────────────────────────────────────────
create table psy_packages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_number text not null,
  title text not null default '',
  -- جلسه‌های کودک و والدین جدا شمرده و قیمت‌گذاری می‌شوند
  child_sessions int not null default 0,
  child_session_type text default 'offline',   -- 'online' | 'offline'
  parent_sessions int not null default 0,
  parent_session_type text default 'offline',
  price bigint not null default 0,
  paid boolean default false,
  payment_submitted boolean default false,
  payment_ref text,
  notes text,
  created_at timestamptz not null default now()
);
create index on psy_packages (tenant_id, case_number);

-- ستون‌های نوعِ اسلات روی برنامه‌ی روزانه (آنلاین/حضوری و مطبِ هر ساعت)
-- در psy_schedules پایین به‌صورت jsonb نگه داشته می‌شوند.

-- ── تنظیماتِ کلینیک (معادلِ clinic_settings، حالا per-tenant) ───────────────
-- تک‌ردیف به‌ازای هر tenant روانشناسی. session_modes/آدرس‌ها/کارت‌ها.
create table psy_clinic_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  doctor_name text not null default '',
  doctor_title text not null default '',
  avatar_url text not null default '',
  badges jsonb not null default '[]',
  session_modes text not null default 'both',  -- 'both' | 'online' | 'offline'
  office_locations jsonb not null default '[]',
  cards jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ── برنامه‌ی کاریِ روانشناسی (روزمحور، سبکِ psych-booking) ──────────────────
-- psych-booking برنامه را روزبه‌روز نگه می‌دارد (نه الگوی هفتگی). همان مدل حفظ شد.
create table psy_schedules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  date text not null,           -- '1405/04/15'
  available_times jsonb not null default '[]',
  slot_types jsonb not null default '{}',  -- { "10:00": "online" | "offline" }
  slot_locs jsonb not null default '{}',   -- { "10:00": "<office_location_id>" }
  is_off boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, date)
);
create index on psy_schedules (tenant_id);

alter table psy_cases enable row level security;
alter table psy_sessions enable row level security;
alter table psy_packages enable row level security;
alter table psy_clinic_settings enable row level security;
alter table psy_schedules enable row level security;
