-- ─────────────────────────────────────────────────────────────────────────────
-- کارمزد پلتفرم روی پرداخت آنلاین + زیرساخت تسویه‌ی خودکار با سرویس «تسهیم»
-- زیبال. additive — امن روی دیتابیس زنده.
--
-- ⚠️ نکته‌ی مهم: خود اتصال به «تسهیم» زیبال (ارسال multiplexingInfos در
-- درخواست پرداخت) پشت env ZIBAL_MULTIPLEXING_ENABLED است و پیش‌فرض خاموش —
-- چون فرمت دقیق API زیبال برای این بخش را نتوانستیم از مستندات رسمی
-- (help.zibal.ir/pdocs.zibal.ir، هردو برای fetch خودکار مسدودند) تایید کنیم؛
-- پیاده‌سازی فعلی بر پایه‌ی یک کتابخانه‌ی غیررسمی (NuGet: ZibalClient) است.
-- قبل از روشن‌کردن این env روی پروداکشن، حتما با ZIBAL_SANDBOX=true یک
-- تراکنش تستی بزن و گزارش تسهیم را تو پنل زیبال چک کن (جزئیات در PROJECT.md).
-- ─────────────────────────────────────────────────────────────────────────────

-- شبای هر درمانگر برای دریافت خودکار سهمش از تراکنش آنلاین
alter table psy_resource_profiles add column if not exists settlement_sheba text not null default '';
alter table psy_resource_profiles add column if not exists settlement_sheba_holder_name text not null default '';

-- بایگانی کارمزد محاسبه‌شده روی هر تراکنش آنلاین (حتی اگر تسهیم خودکار هنوز
-- فعال/موفق نبوده — برای حسابرسی و تسویه‌ی دستی فاز اول)
alter table psy_payment_intents add column if not exists commission_percent numeric;
alter table psy_payment_intents add column if not exists commission_amount bigint;
alter table psy_payment_intents add column if not exists settlement_sheba text;
alter table psy_payment_intents add column if not exists split_applied boolean not null default false;
