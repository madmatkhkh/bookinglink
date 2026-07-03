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
