-- ─────────────────────────────────────────────────────────────────────────────
-- قیمت‌گذاری خود دکتر (per-resource) — جایگزین تدریجی ثابت سراسری PSY_PRICING.
-- additive — امن روی دیتابیس زنده. ستون‌های price روی psy_stages/psy_sessions/
-- psy_packages از قبل وجود داشتند؛ این migration فقط منبع قیمت را per-resource
-- می‌کند تا آن ستون‌ها همیشه با قیمت واقعی همان لحظه‌ی دکتر پر شوند.
-- ─────────────────────────────────────────────────────────────────────────────

alter table psy_resource_profiles add column if not exists pricing jsonb not null default
  '{"interview":800000,"assessment":1500000,"sessionOnline":850000,"sessionOffline":1200000}';
