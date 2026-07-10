-- ─────────────────────────────────────────────────────────────────────────────
-- اسکیمای پلتفرم نوبت‌دهی چند‌مستاجری (Multi-tenant)
-- اصل طلایی: هر چیزی که بین دو مشتری فرق می‌کند = دیتا. هر چیز ثابت = کد.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ── مستاجرها (هر ردیف = یک متخصص/کسب‌وکار) ──────────────────────────────────
create table tenants (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  status text not null default 'active' check (status in ('active', 'suspended', 'pending')),
  plan text not null default 'free' check (plan in ('free', 'pro')),
  owner_phone text not null,
  owner_session uuid, -- توکن نشست پنل متخصص؛ با هر ورود موفق نو می‌شود
  created_at timestamptz not null default now()
);

-- ── برندینگ و محتوای صفحه‌ی عمومی ────────────────────────────────────────────
create table tenant_profiles (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  display_name text not null default '',
  title text not null default '',
  bio text not null default '',
  avatar_url text,
  theme_color text not null default '13 148 136', -- «R G B» برای CSS var
  location_text text not null default '',
  instagram_handle text,
  card_number text not null default '',
  card_holder_name text not null default ''
);

-- ── سرویس‌های قابل رزرو ─────────────────────────────────────────────────────
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

-- ── الگوی ساعات کاری هفتگی ─────────────────────────────────────────────────
-- weekday: ۰=شنبه ... ۶=جمعه (هفته‌ی کاری ایران)
create table weekly_schedules (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time text not null, -- 'HH:MM' همیشه با ارقام لاتین
  end_time text not null,
  mode text not null default 'both' check (mode in ('online', 'in_person', 'both'))
);
create index on weekly_schedules (tenant_id);

-- ── استثناها روی الگوی هفتگی (تعطیلی یا بازه‌ی متفاوت در یک تاریخ مشخص) ────
create table schedule_overrides (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  date text not null, -- تاریخ جلالی 'YYYY/MM/DD' با ارقام لاتین
  type text not null check (type in ('closed', 'custom')),
  start_time text, -- فقط برای type='custom'
  end_time text,
  mode text default 'both' check (mode in ('online', 'in_person', 'both'))
);
create index on schedule_overrides (tenant_id, date);

-- ── رزروها ───────────────────────────────────────────────────────────────────
create table bookings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  service_id uuid not null references services(id),
  booking_date text not null, -- جلالی 'YYYY/MM/DD' با ارقام لاتین
  booking_time text not null, -- 'HH:MM' با ارقام لاتین
  booking_ts bigint not null,  -- epoch ms برای مرتب‌سازی و کوئری بازه‌ای
  client_name text not null,
  client_phone text not null,
  status text not null default 'pending_payment' check (status in
    ('pending_payment', 'payment_submitted', 'confirmed', 'cancelled', 'completed', 'no_show')),
  payment_ref text,
  price_snapshot bigint not null default 0, -- قیمت لحظه‌ی رزرو؛ تغییر بعدی قیمت سرویس اثری ندارد
  client_note text not null default '',
  created_at timestamptz not null default now()
);
create index on bookings (tenant_id, booking_date);
create index on bookings (tenant_id, client_phone);
create index on bookings (tenant_id, status);

-- ضامن دیتابیسی عدم رزرو همزمان یک اسلات: دو رزرو زنده روی یک tenant/تاریخ/ساعت ممکن نیست
create unique index bookings_slot_unique on bookings (tenant_id, booking_date, booking_time)
  where status not in ('cancelled');

-- ── کدهای یکبارمصرف (ورود مراجع و متخصص) ───────────────────────────────────
create table otps (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on otps (phone);

-- ── ماژول‌های قابل فعال‌سازی برای هر tenant (فعلا خالی؛ زیرساخت آینده) ────
create table tenant_features (
  tenant_id uuid not null references tenants(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  config jsonb not null default '{}',
  primary key (tenant_id, feature_key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- امنیت: RLS روی همه‌ی جدول‌ها فعال است و هیچ policy عمومی‌ای تعریف نمی‌شود.
-- یعنی کلید anon به هیچ داده‌ای دسترسی ندارد؛ تمام دسترسی‌ها فقط از سمت
-- سرور و با service_role انجام می‌شود (که RLS را دور می‌زند). این دفاع لایه‌ی
-- دیتابیس در برابر نشت احتمالی کلید anon است.
-- ─────────────────────────────────────────────────────────────────────────────
alter table tenants enable row level security;
alter table tenant_profiles enable row level security;
alter table services enable row level security;
alter table weekly_schedules enable row level security;
alter table schedule_overrides enable row level security;
alter table bookings enable row level security;
alter table otps enable row level security;
alter table tenant_features enable row level security;
