-- تفکیک مالیات بر ارزش‌افزوده‌ی خود متخصص (نه کارمزد پلتفرم) روی هر تراکنش —
-- برای شفافیت در گزارشات مالی متخصص، پنل سوپرادمین، و حسابرسی.
--
-- تفاوت با fee_base_amount/fee_vat_amount (migration 0046): آن دو تفکیک
-- *کارمزد پلتفرم* هستند؛ این دو تفکیک *قیمت جلسه‌ی خود متخصص* است (اگر
-- vat_enabled را در تنظیمات قیمت‌گذاری‌اش روشن کرده باشد). amount کل تراکنش
-- بدون تغییر می‌ماند؛ session_base_amount + session_vat_amount = amount
-- (به‌علاوه‌ی هر دقیقه‌ی اضافه/تخفیف که جدا حساب می‌شود).
--
-- additive و idempotent (طبق قرارداد پروژه) — روی هر دو جدول amount اصلی.
alter table public.ledger_entries add column if not exists session_base_amount bigint;
alter table public.ledger_entries add column if not exists session_vat_amount bigint;
alter table public.psy_payment_intents add column if not exists session_base_amount bigint;
alter table public.psy_payment_intents add column if not exists session_vat_amount bigint;
