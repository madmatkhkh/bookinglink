-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0002: چندکارمندی/چندمنبعی برای نیچِ روانشناسی + ورودِ کارمند
--
-- برخلافِ رویه‌ی معمولِ پروژه (drop-all + rerun)، این فایل عمداً additive است:
-- روی یک دیتابیسِ زنده با پرونده‌های واقعی هم امن اجرا می‌شود، چون:
--   • هیچ جدولی drop نمی‌شود.
--   • resource_id ابتدا nullable اضافه می‌شود، بعد backfill، بعد not null.
--   • برای هر tenant، همه‌ی رکوردهای قدیمی به همان «منبعِ پیش‌فرض»ی که در زمانِ
--     اولین لاگینِ دکتر ساخته شده بود گره می‌خورند — یعنی رفتارِ tenantهای
--     تک‌دکترِ فعلی هیچ تغییری نمی‌کند.
--
-- اجرا: کل این فایل را یک‌جا در SQL Editor سوپابیس اجرا کنید.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── ۱) resources: امکانِ ورودِ کارمند ────────────────────────────────────────
alter table resources add column if not exists phone text;
alter table resources add column if not exists owner_session uuid;
create unique index if not exists resources_tenant_phone_key
  on resources (tenant_id, phone) where phone is not null;

-- ── ۲) resource_id روی جدول‌های تخصصیِ روانشناسی ─────────────────────────────
alter table psy_cases add column if not exists resource_id uuid references resources(id);
alter table psy_sessions add column if not exists resource_id uuid references resources(id);
alter table psy_packages add column if not exists resource_id uuid references resources(id);
alter table psy_schedules add column if not exists resource_id uuid references resources(id);

-- backfill: هر رکوردِ قدیمی به اولین/پیش‌فرض‌ترین منبعِ همان tenant وصل می‌شود
update psy_cases c set resource_id = (
  select id from resources r where r.tenant_id = c.tenant_id order by r.sort_order, r.created_at limit 1
) where c.resource_id is null;

update psy_sessions s set resource_id = (
  select id from resources r where r.tenant_id = s.tenant_id order by r.sort_order, r.created_at limit 1
) where s.resource_id is null;

update psy_packages p set resource_id = (
  select id from resources r where r.tenant_id = p.tenant_id order by r.sort_order, r.created_at limit 1
) where p.resource_id is null;

update psy_schedules sc set resource_id = (
  select id from resources r where r.tenant_id = sc.tenant_id order by r.sort_order, r.created_at limit 1
) where sc.resource_id is null;

-- psy_schedules قبلاً unique(tenant_id, date) بود (یک برنامه‌ی مشترک برای کلِ
-- tenant)؛ حالا هر دکتر برنامه‌ی مستقلِ خودش را دارد.
alter table psy_schedules drop constraint if exists psy_schedules_tenant_id_date_key;
alter table psy_schedules alter column resource_id set not null;
create unique index if not exists psy_schedules_tenant_resource_date_key
  on psy_schedules (tenant_id, resource_id, date);

create index if not exists psy_cases_resource_idx on psy_cases (tenant_id, resource_id);
create index if not exists psy_sessions_resource_idx on psy_sessions (tenant_id, resource_id);
create index if not exists psy_packages_resource_idx on psy_packages (tenant_id, resource_id);
create index if not exists psy_schedules_resource_idx on psy_schedules (tenant_id, resource_id);

-- ── ۳) پروفایلِ per-resource (بج/نوعِ جلسه/کارت) ─────────────────────────────
create table if not exists psy_resource_profiles (
  resource_id uuid primary key references resources(id) on delete cascade,
  badges jsonb not null default '[]',
  session_modes text not null default 'both',
  cards jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
alter table psy_resource_profiles enable row level security;

-- backfill: پروفایلِ منبعِ پیش‌فرضِ هر tenant را از psy_clinic_settingsِ قدیمی پر کن
-- (فقط اگر ستون‌های قدیمی هنوز روی psy_clinic_settings وجود دارند)
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'psy_clinic_settings' and column_name = 'badges') then
    insert into psy_resource_profiles (resource_id, badges, session_modes, cards)
    select r.id, coalesce(cs.badges, '[]'::jsonb), coalesce(cs.session_modes, 'both'), coalesce(cs.cards, '[]'::jsonb)
    from resources r
    join psy_clinic_settings cs on cs.tenant_id = r.tenant_id
    where r.id = (select id from resources r2 where r2.tenant_id = r.tenant_id order by r2.sort_order, r2.created_at limit 1)
      and not exists (select 1 from psy_resource_profiles pp where pp.resource_id = r.id);

    -- نام/عنوان/آواتارِ دکترِ قدیمی روی خودِ resources منتقل شود (این ستون‌ها از قبل آنجا هستند)
    update resources r set
      name = coalesce(nullif(cs.doctor_name, ''), r.name),
      title = coalesce(nullif(cs.doctor_title, ''), r.title),
      avatar_url = coalesce(nullif(cs.avatar_url, ''), r.avatar_url)
    from psy_clinic_settings cs
    where cs.tenant_id = r.tenant_id
      and r.id = (select id from resources r2 where r2.tenant_id = r.tenant_id order by r2.sort_order, r2.created_at limit 1);

    -- ستون‌های قدیمی از psy_clinic_settings حذف می‌شوند (حالا فقط office_locations می‌ماند)
    alter table psy_clinic_settings drop column if exists doctor_name;
    alter table psy_clinic_settings drop column if exists doctor_title;
    alter table psy_clinic_settings drop column if exists avatar_url;
    alter table psy_clinic_settings drop column if exists badges;
    alter table psy_clinic_settings drop column if exists session_modes;
    alter table psy_clinic_settings drop column if exists cards;
  end if;
end $$;

-- برای هر resourceِ باقی‌مانده که هنوز پروفایل ندارد (مثلاً tenantِ تازه‌ساز)، ردیفِ پیش‌فرض بساز
insert into psy_resource_profiles (resource_id)
select r.id from resources r
left join psy_resource_profiles pp on pp.resource_id = r.id
where pp.resource_id is null;
