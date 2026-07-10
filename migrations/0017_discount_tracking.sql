-- ─────────────────────────────────────────────────────────────────────────────
-- ردیابی کد تخفیف اعمال‌شده — برای حسابرسی (کدامین تراکنش با چه کدی تخفیف خورد)
-- additive — امن روی دیتابیس زنده.
-- ─────────────────────────────────────────────────────────────────────────────

alter table psy_stages add column if not exists discount_code text;
alter table psy_stages add column if not exists original_price bigint;

alter table psy_sessions add column if not exists discount_code text;
alter table psy_sessions add column if not exists original_price bigint;

alter table psy_packages add column if not exists discount_code text;
alter table psy_packages add column if not exists original_price bigint;

alter table psy_payment_intents add column if not exists discount_code_id uuid;
alter table psy_payment_intents add column if not exists discount_code text;
alter table psy_payment_intents add column if not exists discount_amount bigint;
alter table psy_payment_intents add column if not exists original_amount bigint;
