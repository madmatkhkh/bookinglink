-- 0042 — فلگ نوبت‌های لغوشده در برنامه‌ی نوبت‌های متخصص.
-- وقتی نوبتی لغو می‌شود، زمان خود جلسه پاک می‌شود (تا مراجع بتواند دوباره وقت
-- بگیرد)؛ برای همین برای نشان‌دادن فلگ روی همان خانه‌ی زمانی، یک رکورد سبک جدا
-- نگه می‌داریم: چه کسی لغو کرده (مطب/مراجع) و چه زمانی. آزاد/بلاک‌بودن اسلات با
-- slot_locks مدیریت می‌شود (لغو توسط مطب → قفل می‌ماند و بلاک؛ لغو توسط مراجع →
-- قفل آزاد می‌شود).
create table if not exists public.psy_cancelled_slots (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  resource_id   uuid,
  case_number   text not null,
  session_date  text not null,
  session_time  text not null,
  cancelled_by  text not null,   -- 'doctor' | 'client'
  created_at    timestamptz not null default now()
);
create index if not exists psy_cancelled_slots_lookup
  on public.psy_cancelled_slots (tenant_id, resource_id, session_date);
