-- ─────────────────────────────────────────────────────────────────────────────
-- سخت‌سازیِ پیش از لانچ — additive، امن روی دیتابیسِ زنده (هیچ drop/تغییری ندارد).
--
-- ⚠️ از این migration به بعد، قراردادِ «بازسازیِ مخرب» (drop همه‌ی جدول‌ها) رسماً
-- منسوخ است — با آمدنِ اولین مشتریِ واقعی، همه‌ی تغییراتِ اسکیما فقط additive اند.
--
-- ۱) ضامنِ همزمانیِ اسلات‌های روانشناسی در سطحِ دیتابیس:
--    تا امروز فقط جدولِ bookings (نیچِ عمومی) unique index داشت؛ psy_stages و
--    psy_sessions فقط check-then-update در اپ داشتند که در برابرِ دو درخواستِ
--    هم‌زمان (دو مراجع روی یک ساعت) بی‌دفاع بود. این ایندکس‌ها partial اند تا
--    ردیف‌های بدونِ زمان (session_date خالی/null — جلساتِ هنوز زمان‌بندی‌نشده)
--    مشمول نشوند.
--    نکته: تداخلِ «بینِ» stage و session (دو جدولِ جدا) همچنان با چکِ اپ گرفته
--    می‌شود؛ این ایندکس‌ها ضامنِ نهاییِ هم‌زمانیِ «درونِ» هر جدول اند.
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists psy_sessions_slot_uniq
  on psy_sessions (tenant_id, resource_id, session_date, session_time)
  where session_date is not null and session_date <> ''
    and session_time is not null and session_time <> '';

create unique index if not exists psy_stages_slot_uniq
  on psy_stages (tenant_id, resource_id, session_date, session_time)
  where session_date is not null and session_date <> ''
    and session_time is not null and session_time <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- ۲) یادآوریِ پیامکیِ خودکار — ردیابیِ «برای این نوبت یادآوری ارسال شده»:
--    cron روزانه (/api/cron/reminders) نوبت‌های فردا را پیدا می‌کند، پیامک
--    می‌فرستد و این ستون را true می‌کند تا اجرای دوباره‌ی cron (retry/دستی)
--    پیامکِ تکراری نفرستد.
-- ─────────────────────────────────────────────────────────────────────────────

alter table psy_sessions add column if not exists reminder_sent boolean not null default false;
alter table psy_stages   add column if not exists reminder_sent boolean not null default false;
alter table bookings     add column if not exists reminder_sent boolean not null default false;

create index if not exists psy_sessions_reminder_idx on psy_sessions (session_date) where reminder_sent = false;
create index if not exists psy_stages_reminder_idx   on psy_stages (session_date) where reminder_sent = false;
create index if not exists bookings_reminder_idx     on bookings (booking_date) where reminder_sent = false;
