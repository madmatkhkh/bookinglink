-- 0041 — کنسلی جلسات تکی (مرحله‌ای) توسط مراجع، هم‌تراز با جلسات پروتکل.
-- مرحله‌ها تا امروز ستون بازپرداخت نداشتند؛ این ستون‌ها همان الگوی psy_sessions را
-- می‌آورند تا کنسلی مراجع + تسویه‌ی بازپرداخت توسط دکتر برای مرحله هم کار کند.
alter table public.psy_stages add column if not exists refund_percent integer;
alter table public.psy_stages add column if not exists refund_status text;
alter table public.psy_stages add column if not exists refund_card text;
alter table public.psy_stages add column if not exists refund_ref text;
