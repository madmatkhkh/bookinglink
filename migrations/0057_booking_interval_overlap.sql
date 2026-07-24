-- ═══════════════════════════════════════════════════════════════════════════
--  رزرو بازه‌ای برای نیچ‌های سرویس‌محور (سالن زیبایی و بعدی‌ها)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  مسئله‌ای که این migration حل می‌کند:
--
--  جدول bookings تا امروز فقط ساعت *شروع* را می‌شناخت. ایندکس یکتای موجود
--  (bookings_slot_unique) روی (tenant, resource, date, time) دقیق است، یعنی
--  10:00 و 10:30 دو ردیف متفاوت‌اند و هر دو پذیرفته می‌شوند — حتی اگر نوبت
--  10:00 یک رنگ موی 120 دقیقه‌ای باشد که تا 12:00 ادامه دارد.
--
--  این برای روانشناسی مشکلی نبود چون همه‌ی جلسات هم‌طول‌اند و خود دکتر
--  ساعت‌ها را دستی و با فاصله منتشر می‌کند. ولی سالن زیبایی ذاتا بازه‌ای
--  است: ناخن 30 دقیقه، یک سرویس دیگر 60، رنگ مو 120 — و این *مشتری* است که
--  سرویس را انتخاب می‌کند، پس هیچ آدمی نمی‌تواند از قبل فاصله‌ها را بچیند.
--
--  تداخل دو بازه را هیچ ایندکس یکتایی نمی‌تواند بیان کند — این محدودیت
--  ریاضی است. راه‌حل استاندارد پستگرس، exclusion constraint روی gist است.
--
--  ⚠️ این فایل idempotent است ولی additive-only نیست به معنای کامل: یک قید
--     تازه اضافه می‌کند که می‌تواند insertهای متداخل را رد کند. چون هنوز
--     هیچ tenant زنده‌ای روی نیچ سرویس‌محور نداریم، ریسک عملی صفر است.
--     اگر بعدا روی دیتابیسی با نوبت‌های واقعی اجرا شد و قید ساخته نشد،
--     یعنی تداخل از قبل موجود است و باید اول دستی حل شود (کوئری تشخیص
--     در انتهای همین فایل کامنت شده است).

-- btree_gist لازم است تا بتوان uuid/= را کنار range/&& در یک قید gist گذاشت.
create extension if not exists btree_gist;

-- پایان بازه بر حسب همان واحد booking_ts (میلی‌ثانیه‌ی یونیکس).
alter table public.bookings add column if not exists booking_end_ts bigint;

-- پرکردن ردیف‌های موجود از روی مدت سرویس مربوطه.
update public.bookings b
set booking_end_ts = b.booking_ts + (s.duration_minutes * 60000)
from public.services s
where s.id = b.service_id and b.booking_end_ts is null;

-- تور ایمنی: اگر نوبتی به سرویس حذف‌شده اشاره می‌کرد و بالا پر نشد،
-- یک ساعت پیش‌فرض می‌گیرد تا قید بتواند ساخته شود.
update public.bookings
set booking_end_ts = booking_ts + 3600000
where booking_end_ts is null;

alter table public.bookings alter column booking_end_ts set not null;

-- قید اصلی: دو نوبت فعال برای یک منبع در یک مجموعه نمی‌توانند بازه‌ی
-- زمانی متداخل داشته باشند. نوبت‌های کنسل‌شده مستثنا هستند (همان منطق
-- bookings_slot_unique موجود).
--
-- توجه: int8range به‌صورت پیش‌فرض [شروع، پایان) است — یعنی نوبت 10:00 تا
-- 11:00 و نوبت 11:00 تا 12:00 تداخل ندارند. دقیقا رفتار درست.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_no_overlap'
  ) then
    alter table public.bookings
      add constraint bookings_no_overlap
      exclude using gist (
        tenant_id with =,
        resource_id with =,
        int8range(booking_ts, booking_end_ts) with &&
      ) where (status <> 'cancelled');
  end if;
end $$;

-- ایندکس یکتای قبلی (bookings_slot_unique) عمدا حذف نشد: قید تازه از آن
-- قوی‌تر است و آن را در بر می‌گیرد، ولی حذف‌نکردنش با قرارداد additive-only
-- پروژه سازگارتر است و لایه‌ی دفاعی دوم می‌ماند. کد هر دو کد خطا را
-- مدیریت می‌کند: 23505 (یکتا) و 23P01 (exclusion).

-- ── اگر روزی روی دیتابیسی با داده‌ی واقعی اجرا شد و قید ساخته نشد، این
-- ── کوئری تداخل‌های موجود را نشان می‌دهد:
--
-- select a.id, b.id, a.booking_date, a.booking_time, b.booking_time
-- from public.bookings a
-- join public.bookings b
--   on a.tenant_id = b.tenant_id
--  and a.resource_id = b.resource_id
--  and a.id < b.id
--  and a.status <> 'cancelled' and b.status <> 'cancelled'
--  and int8range(a.booking_ts, a.booking_end_ts)
--   && int8range(b.booking_ts, b.booking_end_ts);
