-- 0043 — نشانه‌ی اینکه یک جلسه/مرحله را چه کسی کنسل کرده، تا برچسب درست
-- («کنسل توسط مراجع») نشان داده شود و کنسل پرداخت‌نشده دیگر «منتظر پرداخت» نماند.
alter table public.psy_stages   add column if not exists cancelled_by text;
alter table public.psy_sessions add column if not exists cancelled_by text;
