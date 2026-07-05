-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0005: رفعِ یک اشتباه — سه ستونِ اصلیِ psy_cases (grade، booking_date،
-- booking_time) در یکی از ویرایش‌های اخیرِ اسکیما جا افتاده بودند و باعثِ خطای
-- «Could not find the 'X' column of 'psy_cases'» می‌شدند (هم موقعِ افزودنِ دستیِ
-- پرونده از پنل، هم موقعِ ثبتِ فرمِ مصاحبه توسطِ مراجع). additive و امن است.
-- ─────────────────────────────────────────────────────────────────────────────

alter table psy_cases add column if not exists grade text;
alter table psy_cases add column if not exists booking_date text;
alter table psy_cases add column if not exists booking_time text;
