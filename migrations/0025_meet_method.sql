-- ─────────────────────────────────────────────────────────────────────────────
-- additive — امن روی دیتابیس زنده.
--
-- روش‌های برگزاری جلسه‌ی آنلاین. تا امروز فقط گوگل‌میت ممکن بود (ستون meet_link).
-- حالا متخصص می‌تواند «چند روش» را هم‌زمان فعال کند: گوگل‌میت، زوم، واتساپ،
-- بله، تماس تلفنی — و مراجع هرکدام را که خواست انتخاب می‌کند.
--
-- ساختار: آرایه‌ای از {method, value} — مثلا
--   [{"method":"whatsapp","value":"09123456789"},{"method":"phone","value":"09123456789"}]
--
-- ستون قدیمی meet_link حذف نمی‌شود (قانون additive) و به‌عنوان میراث خوانده
-- می‌شود: پروفایل‌هایی که هنوز meet_channels ندارند، لینک قدیمی‌شان خودکار
-- به‌صورت یک کانال گوگل‌میت تفسیر می‌شود (mergeMeetChannels در lib/meet.ts).
-- این کوئری همان تفسیر را یک‌بار به‌صورت دیتای واقعی هم می‌نویسد تا از ابتدا
-- سازگار باشد.
-- ─────────────────────────────────────────────────────────────────────────────

alter table psy_resource_profiles
  add column if not exists meet_channels jsonb not null default '[]'::jsonb;

-- مهاجرت میراث: لینک گوگل‌میت موجود → یک کانال google_meet (فقط یک‌بار، idempotent)
update psy_resource_profiles
set meet_channels = jsonb_build_array(jsonb_build_object('method', 'google_meet', 'value', meet_link))
where coalesce(meet_link, '') <> ''
  and (meet_channels is null or meet_channels = '[]'::jsonb);
