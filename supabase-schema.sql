-- ─────────────────────────────────────────────────────────────────────────────
-- اسکیمای پلتفرم نوبت‌دهی چند‌مستاجری چند‌نیچی (Multi-tenant, Multi-niche)
--
-- سه اصل معماری:
--   1. ساختار = کد، محتوا و قابلیت = دیتا. (تفاوت نیچ‌ها هرگز کد جدا نیست)
--   2. هر رزرو می‌تواند به یک «منبع» (پرسنل) وصل باشد؛ برای تک‌نفره‌ها یک منبع پیش‌فرض.
--   3. اسلات ذخیره نمی‌شود، محاسبه می‌شود؛ ضامن همزمانی، unique index دیتابیس است.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش 1 — نیچ‌ها (تمپلیت‌ها): محتوای پیش‌فرض هر نوع کسب‌وکار، همه به‌صورت دیتا
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
-- بخش 2 — مستاجرها
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
  theme_mode text not null default 'preset' check (theme_mode in ('preset', 'logo')),
  logo_url text,
  location_text text not null default '',
  instagram_handle text,
  card_number text not null default '',
  card_holder_name text not null default ''
);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش 3 — منابع (پرسنل): قلب قابلیت چند‌منبعی
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
  -- ورود کارمند: هر منبع می‌تواند شماره‌ی خودش را داشته باشد و مستقل از
  -- صاحب tenant وارد پنل شود (نقش چهارم auth، کنار مراجع/متخصص/سوپرادمین).
  phone text,
  owner_session uuid,
  created_at timestamptz not null default now()
);
create index on resources (tenant_id);
create unique index resources_tenant_phone_key on resources (tenant_id, phone) where phone is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش 4 — سرویس‌ها
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

-- کدام منبع‌ها این سرویس را می‌دهند؟ نبود ردیف = همه‌ی منبع‌ها می‌دهند.
create table service_resources (
  service_id uuid not null references services(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  primary key (service_id, resource_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش 5 — برنامه‌ی کاری: به‌ازای هر منبع
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
-- بخش 6 — رزروها: به یک منبع گره می‌خورند
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

-- ضامن همزمانی حالا شامل منبع: یک منبع در یک تاریخ/ساعت فقط یک رزرو زنده.
create unique index bookings_slot_unique
  on bookings (tenant_id, resource_id, booking_date, booking_time)
  where status not in ('cancelled');

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش 7 — پرونده‌ی مراجع/مشتری: اسکلت مشترک، فیلدهای نیچ‌محور
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
-- بخش 8 — زیرساخت‌های مشترک
-- ═══════════════════════════════════════════════════════════════════════════
create table otps (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on otps (phone);

-- rate limit دیتابیس‌محور (serverless حافظه‌ی مشترک ندارد) — auth.ts قبل از
-- صدور/تایید OTP و ورود سوپرادمین، رخدادهای اخیر هر «کلید» را می‌شمارد.
create table auth_throttle (
  id uuid primary key default uuid_generate_v4(),
  key text not null,
  created_at timestamptz not null default now()
);
create index auth_throttle_key_time on auth_throttle (key, created_at);

create table tenant_features (
  tenant_id uuid not null references tenants(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}',
  primary key (tenant_id, feature_key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS روی همه‌ی جدول‌ها؛ دسترسی فقط از سمت سرور با service_role.
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
alter table auth_throttle enable row level security;
alter table tenant_features enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- داده‌ی اولیه‌ی نیچ‌ها — سه تمپلیت؛ فقط «روانشناسی» فعلا فعال است (بقیه
-- «به‌زودی» روی لندینگ/ثبت‌نام دیده می‌شوند، تا تست نهایی‌شان تمام شود)
-- ═══════════════════════════════════════════════════════════════════════════
insert into niches (key, display_name, tagline, icon, client_label, resource_label, booking_label, default_theme, record_fields, default_features, sample_services, setup_price, is_active, sort_order) values
(
  'psychology',
  'روانشناسی و روان‌پزشکی',
  'صفحه‌ی نوبت‌دهی اختصاصی برای رواندرمانگرها، مشاورها و روان‌پزشک‌ها',
  'brain',
  'مراجع', 'درمانگر', 'جلسه',
  '124 58 237',
  '[
    {"key":"diagnosis","label":"تشخیص / علت مراجعه","type":"text"},
    {"key":"medication","label":"داروهای فعلی","type":"textarea"},
    {"key":"session_count","label":"تعداد جلسات گذشته","type":"number"},
    {"key":"notes","label":"یادداشت درمانگر","type":"textarea"}
  ]'::jsonb,
  '[]'::jsonb,
  '[
    {"name":"جلسه‌ی مشاوره‌ی فردی","duration_minutes":60,"price":0,"mode":"both"},
    {"name":"مصاحبه‌ی اولیه","duration_minutes":45,"price":0,"mode":"both"}
  ]'::jsonb,
  0, true, 1
),
(
  -- ⚠️ placeholder صرفا نمایشی («به‌زودی» روی لندینگ) — هنوز هیچ tenant واقعی
  -- نباید با این کلید ساخته شود. جزئیات کامل تصمیم معماری در
  -- migrations/0023_clinic_and_salon_coming_soon.sql مستند شده.
  'psychology_clinic',
  'روانشناسی (کلینیک چند‌درمانگر)',
  'برای مجموعه‌هایی با چند درمانگر — مدیریت تیم، تقویم مشترک و تسویه‌ی جدا برای هرکدام',
  'brain',
  'مراجع', 'درمانگر', 'جلسه',
  '124 58 237',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  0, false, 2
),
(
  'beauty_salon',
  'سالن زیبایی',
  'رزرو آنلاین برای سالن‌های زیبایی، آرایشگاه‌ها و مراکز مراقبت پوست',
  'sparkles',
  'مشتری', 'آرایشگر', 'رزرو',
  '212 83 126',
  '[
    {"key":"skin_hair_type","label":"نوع پوست / مو","type":"text"},
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
  0, false, 3
);

-- ═══════════════════════════════════════════════════════════════════════════
-- بخش 9 — جدول‌های تخصصی نیچ روانشناسی (از psych-booking، حالا multi-tenant)
--
-- این‌ها فقط برای tenantهای نیچ روانشناسی استفاده می‌شوند. نیچ‌های دیگر
-- (سالن و…) این جدول‌ها را نادیده می‌گیرند و از جدول‌های عمومی بالا استفاده
-- می‌کنند. اصل «ساختار=کد، محتوا=دیتا» حفظ می‌شود: این‌ها ساختار خاص فلوی
-- سه‌مرحله‌ای روانشناسی کودک‌اند که یک نیچ به آن نیاز دارد.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── مراحل پیش‌ازدرمان پرونده (مصاحبه/ارزیابی) — کاملا آزاد و تکرارپذیر ────
-- به‌جای فلوی هاردکدشده‌ی «مصاحبه یک‌بار → ارزیابی یک‌بار»، هر پرونده هر تعداد
-- مرحله از هر نوع می‌تواند داشته باشد، به هر ترتیب که دکتر بعد از برگزاری هر
-- مرحله تصمیم می‌گیرد (تکرار، ردکردن، رفتن مستقیم به پروتکل درمان). پیش از
-- psy_cases تعریف می‌شود چون آن جدول به این‌جا یک FK دارد (current_stage_id).
create table psy_stages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_number text not null,
  stage_type text not null,      -- 'interview' | 'assessment'
  status text not null default 'awaiting_payment', -- awaiting_payment | payment_submitted | awaiting_booking | booked
  price bigint not null default 0,
  paid boolean default false,
  payment_submitted boolean default false,
  payment_ref text,
  session_date text default '',
  session_time text default '',
  held boolean default false,    -- آیا واقعا برگزار شد (پس از رزرو)
  notes text,                    -- یادداشت دکتر برای همین مرحله
  cancel_notice text,            -- پیام لغو نوبت توسط مطب (اگر مطب نوبت را لغو کرد)
  delay_minutes int,             -- تاخیر اعلام‌شده به مراجع (دقیقه) — برای نوبت رزروشده
  resource_id uuid references resources(id),
  discount_code text,
  original_price bigint,
  created_at timestamptz not null default now()
);
create index on psy_stages (tenant_id, case_number);
create index on psy_stages (tenant_id, resource_id);
create index on psy_stages (tenant_id, status);
alter table psy_stages enable row level security;

-- ── پرونده و رزرو تخصصی روانشناسی ─────────────────────────────────────────
-- معادل bookings در psych-booking، ولی با tenant_id. کلید منطقی: case_number
-- (یکتا در هر tenant). فلوی پیش‌ازدرمان دیگر هاردکد نیست — روی current_stage_id
-- + جدول psy_stages بالا مدیریت می‌شود.
create table psy_cases (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_number text not null,
  -- هویت پرونده — عمومی برای هر تخصص (نه فقط کودک/خانواده). فرم مصاحبه این‌ها را پر می‌کند.
  client_name text not null default '',       -- مراجع، هرکسی با هر سنی
  client_name_en text,
  birth_date text,
  grade text,                                  -- اختیاری، فقط اگر مراجع دانش‌آموز باشد
  -- تماس اصلی (برای ورود/OTP) — می‌تواند خود مراجع باشد (بزرگسال) یا یک نفر
  -- دیگر (والدین کودک، همراه سالمند). contact_phone همیشه لازم است.
  contact_name text, contact_phone text,
  -- تماس دوم اختیاری — برچسبش را هر متخصص در تنظیمات خودش تعیین می‌کند
  -- (psy_resource_profiles.companion_label)؛ اگر لازم نبود خالی می‌ماند.
  contact2_name text, contact2_phone text,
  reason text,
  session_type text,           -- 'online' | 'offline'
  office_location text,
  -- کل فیلدهای تفصیلی پرونده در یک jsonb (تا افزودن/حذف فیلد نیازی به migration نداشته باشد)
  -- فرم مصاحبه و تب پرونده می‌توانند این را برای هر تخصصی متفاوت پر کنند.
  details jsonb not null default '{}',
  reject_reason text,
  -- مرحله‌ی «در حال انجام» فعلی این پرونده (مصاحبه/ارزیابی که هنوز پرداخت/رزرو/برگزاری‌اش
  -- تمام نشده). وقتی null است یعنی هیچ مرحله‌ای در جریان نیست و دکتر باید مرحله‌ی بعد را
  -- مشخص کند (یا پرونده وارد فاز پروتکل درمان شده). تاریخچه‌ی کامل مراحل در psy_stages است.
  current_stage_id uuid references psy_stages(id) on delete set null,
  -- یادداشت کلی دکتر
  doctor_notes text,
  status text not null default 'pending',
  -- کدام «منبع» (دکتر) صاحب این پرونده است — پایه‌ی چندکارمندی
  resource_id uuid references resources(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, case_number)
);
create index on psy_cases (tenant_id);
create index on psy_cases (tenant_id, phone);
create index on psy_cases (tenant_id, resource_id);

-- ── پکیج‌های درمان ──────────────────────────────────────────────────────────
create table psy_packages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_number text not null,
  title text not null default '',
  month text, year text,  -- دوره‌ی تعلق‌گرفتن پکیج (مثلا ماه 4 سال 1405)
  -- دو مسیر جلسه: «اصلی» همیشه هست (خود مراجع)، «دومی» اختیاری است (مثلا
  -- والدین کودک، همسر، یا هر همراه دیگری — برچسبش را هر متخصص خودش تعیین
  -- می‌کند در psy_resource_profiles.companion_label). اگر لازم نبود صفر می‌ماند.
  primary_sessions int not null default 0,
  primary_session_type text default 'offline',   -- 'online' | 'offline'
  secondary_sessions int not null default 0,
  secondary_session_type text default 'offline',
  price bigint not null default 0,
  paid boolean default false,
  payment_submitted boolean default false,
  payment_ref text,
  status text not null default 'pending',
  notes text,
  resource_id uuid references resources(id),
  discount_code text,
  original_price bigint,
  created_at timestamptz not null default now()
);
create index on psy_packages (tenant_id, case_number);
create index on psy_packages (tenant_id, resource_id);

-- ستون‌های نوع اسلات روی برنامه‌ی روزانه (آنلاین/حضوری و مطب هر ساعت)
-- در psy_schedules پایین به‌صورت jsonb نگه داشته می‌شوند.

-- ── جلسه‌های پروتکل درمان (مرحله‌ی 3) ──────────────────────────────────────
create table psy_sessions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  case_number text not null,
  package_id uuid references psy_packages(id) on delete set null,
  -- عنوان جلسه‌ی تکی (ارزیابی/مصاحبه/دلخواه) — فقط برای جلسه‌های بدون پروتکل؛
  -- جلسه‌های پروتکل عنوان جدا ندارند (خود پروتکل مشخص‌شان می‌کند)
  title text,
  session_number int not null default 1,
  session_date text not null default '',
  session_time text not null default '',
  session_type text,           -- 'online' | 'offline'
  attendee text,               -- 'primary' | 'secondary' — چه کسی حاضر می‌شود (مراجع یا همراهش)
  price bigint default 0,
  paid boolean default false,
  payment_submitted boolean default false,
  payment_ref text,
  status text not null default 'confirmed',
  doctor_note_for_patient text, -- یادداشتی که دکتر برای مراجع می‌گذارد (قابل‌رویت او)
  delay_minutes int,             -- تاخیر اعلام‌شده به مراجع (دقیقه)
  -- کنسلی و بازپرداخت
  refund_status text,          -- null | 'pending' | 'done'
  refund_percent int default 0,-- درصدی که به مراجع برمی‌گردد
  refund_amount bigint default 0,
  refund_card text,            -- شماره‌کارتی که مراجع برای بازپرداخت داده
  notes text,
  resource_id uuid references resources(id),
  discount_code text,
  original_price bigint,
  created_at timestamptz not null default now()
);
create index on psy_sessions (tenant_id, case_number);
create index on psy_sessions (tenant_id, session_date);
create index on psy_sessions (tenant_id, resource_id);

-- ── تنظیمات کلینیک (سطح tenant/برند — مشترک همه‌ی دکترهای همان مجموعه) ────
-- دیگر نام دکتر/بج/کارت را نگه نمی‌دارد (این‌ها حالا per-resource‌اند، در
-- psy_resource_profiles و خود جدول resources). فقط چیزی که واقعا مال کل
-- مجموعه است اینجا می‌ماند: آدرس‌های مطب/کلینیک که بین دکترها مشترک است.
create table psy_clinic_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  office_locations jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- ── پروفایل هر دکتر (per-resource) ─────────────────────────────────────────
-- نام/عنوان/آواتار همان ستون‌های name/title/avatar_url روی resources هستند
-- (تکراری‌شان نکردیم). این‌جا فقط چیزهایی که مختص فلو روانشناسی هر دکتر است:
-- بج‌های اعتماد، نوع جلسه‌ی قابل‌ارائه، کارت دریافت وجه/بازپرداخت خودش.
create table psy_resource_profiles (
  resource_id uuid primary key references resources(id) on delete cascade,
  badges jsonb not null default '[]',
  session_modes text not null default 'both',  -- 'both' | 'online' | 'offline'
  cards jsonb not null default '[]',
  -- سیاست کنسلی خود این دکتر: قبل از threshold_hours چند درصد برگردد، بعدش چند درصد
  cancellation_policy jsonb not null default '{"enabled":true,"threshold_hours":12,"early_refund_percent":50,"late_refund_percent":0}',
  -- کدام روش‌های پرداخت برای این دکتر فعال است (حداقل یکی باید روشن بماند)
  payment_methods jsonb not null default '{"card_to_card":true,"online":false}',
  -- شبای تسویه برای دریافت خودکار سهم از تراکنش آنلاین (سرویس تسهیم زیبال)
  settlement_sheba text not null default '',
  settlement_sheba_holder_name text not null default '',
  -- قیمت‌گذاری خود این دکتر — فقط دو قیمت: آنلاین/حضوری
  pricing jsonb not null default '{"online":850000,"offline":1200000}',
  -- ساعت‌های سریع پیشنهادی در تب «روزهای کاری» — قابل ویرایش (افزودن/حذف) توسط خود دکتر
  quick_times jsonb not null default '["8:00","9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00"]',
  -- برچسب «تماس دوم/همراه» — به‌انتخاب خود متخصص («والدین»، «همسر»، «همراه»...)؛
  -- خالی یعنی این متخصص اصلا این مفهوم را استفاده نمی‌کند (مثلا درمان فردی بزرگسال)
  companion_label text not null default '',
  updated_at timestamptz not null default now()
);

-- ── ردگیری پرداخت آنلاین (زیبال) — یک جدول عمومی برای هر نوع پرداخت
-- (مصاحبه/ارزیابی/پروتکل/جلسه) تا منطق درگاه فقط یک‌جا نوشته شود ──────────
create table psy_payment_intents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id),
  case_number text not null,
  phone text not null,
  purpose text not null,       -- 'interview' | 'assessment' | 'package' | 'session' | 'extra_session'
  ref_id uuid,                 -- شناسه‌ی session/package (وقتی مصداق دارد)
  amount int not null,         -- تومان
  authority text,              -- trackId برگشتی از زیبال (اسم ستون از قبل مانده، مقدارش trackId است)
  status text not null default 'pending',  -- pending | paid | failed
  -- کارمزد پلتفرم روی این تراکنش (بایگانی/حسابرسی، مستقل از موفقیت تسهیم خودکار)
  commission_percent numeric,
  commission_amount bigint,
  settlement_sheba text,
  split_applied boolean not null default false,
  discount_code_id uuid,
  discount_code text,
  discount_amount bigint,
  original_amount bigint,
  created_at timestamptz not null default now()
);
create index on psy_payment_intents (tenant_id, authority);

-- ── برنامه‌ی کاری روانشناسی (روزمحور، سبک psych-booking، حالا per-resource) ─
-- هر دکتر برنامه‌ی روزمحور مستقل خودش را دارد.
create table psy_schedules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  date text not null,           -- '1405/04/15'
  available_times jsonb not null default '[]',
  slot_types jsonb not null default '{}',  -- { "10:00": "online" | "offline" }
  slot_locs jsonb not null default '{}',   -- { "10:00": "<office_location_id>" }
  is_off boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, resource_id, date)
);
create index on psy_schedules (tenant_id);
create index on psy_schedules (tenant_id, resource_id);

-- ── فرم رزرو، قابل‌تنظیم توسط هر دکتر (per-resource) ──────────────────────
-- نام/شماره‌تماس (child_name/father_phone) همیشه ثابت و اجباری‌اند (برای OTP)
-- و بیرون این اسکیما مدیریت می‌شوند. هرچه اینجاست، دکتر خودش تعیین می‌کند:
-- بخش‌ها، سوال‌ها، نوع هرکدام (متن/توضیح/تک‌گزینه/چندگزینه)، اجباری یا اختیاری.
create table psy_intake_forms (
  resource_id uuid primary key references resources(id) on delete cascade,
  schema jsonb not null default '{"sections":[]}',
  updated_at timestamptz not null default now()
);
alter table psy_intake_forms enable row level security;

-- تیکت پشتیبانی — سطح پلتفرم (نه فقط psychology)
create table support_tickets (
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
create index support_tickets_tenant_idx on support_tickets(tenant_id);
create index support_tickets_status_idx on support_tickets(status);

-- کدهای تخفیف — per-resource
create table psy_discount_codes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  code text not null,
  discount_type text not null default 'percent',  -- 'percent' | 'fixed'
  discount_value numeric not null,
  is_active boolean not null default true,
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index psy_discount_codes_uniq on psy_discount_codes(resource_id, code);

-- دفتر حساب (ledger) — هر تراکنش نهایی‌شده یک ردیف تغییرناپذیر؛ منبع حقیقت حسابداری
create table ledger_entries (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id),
  case_number text,
  purpose text not null,          -- 'interview' | 'assessment' | 'package' | 'session' | 'refund'
  method text not null,           -- 'online' | 'card_to_card'
  direction text not null default 'inflow',  -- 'inflow' | 'outflow'
  amount bigint not null,
  commission_amount bigint not null default 0,
  doctor_amount bigint not null default 0,
  source_table text,
  source_id uuid,
  payment_intent_id uuid,
  split_applied boolean not null default false,
  recorded_by text,
  note text,
  created_at timestamptz not null default now()
);
create index ledger_tenant_idx on ledger_entries(tenant_id);
create index ledger_resource_idx on ledger_entries(resource_id);
create index ledger_created_idx on ledger_entries(created_at);
create unique index ledger_source_uniq on ledger_entries(source_table, source_id, purpose)
  where source_table is not null and source_id is not null;

-- دفتر تسویه — واریز سهم دکتر توسط پلتفرم
create table settlements (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  resource_id uuid references resources(id),
  amount bigint not null,
  method text not null default 'manual',
  covers_from timestamptz,
  covers_to timestamptz,
  reference text,
  note text,
  recorded_by text default 'super',
  created_at timestamptz not null default now()
);
create index settlements_tenant_idx on settlements(tenant_id);
create index settlements_resource_idx on settlements(resource_id);

alter table psy_cases enable row level security;
alter table psy_sessions enable row level security;
alter table psy_packages enable row level security;
alter table psy_clinic_settings enable row level security;
alter table psy_resource_profiles enable row level security;
alter table psy_payment_intents enable row level security;
alter table psy_schedules enable row level security;
