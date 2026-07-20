-- پروتکل درمان (پکیج): متخصص علاوه بر آنلاین/حضوری، «نوع» را هم مشخص می‌کند —
-- برای حضوری «کدام محل» و برای آنلاین «کدام کانال». per-پروتکل و برای هر دو
-- دسته (مراجع/همراه) جدا. مقادیر متنی و nullable (additive، امن برای دیتای زنده):
--   office_location = عنوان محل (مثل office_locations[].title)
--   meet_channel    = متد کانال (مثل MeetChannel.method: 'whatsapp'، 'google_meet'، ...)
ALTER TABLE public.psy_packages
  ADD COLUMN IF NOT EXISTS primary_office_location text,
  ADD COLUMN IF NOT EXISTS primary_meet_channel text,
  ADD COLUMN IF NOT EXISTS secondary_office_location text,
  ADD COLUMN IF NOT EXISTS secondary_meet_channel text;
