-- ─────────────────────────────────────────────────────────────────────────────
-- additive — امن روی دیتابیس زنده.
--
-- دلیل رد پرداخت — ستون اختصاصی، جدا از cancel_notice/notes/doctor_note_for_patient:
--   قبلا «دلیل رد پرداخت» یا اصلا به مراجع نمی‌رسید (روی stage با
--   cancel_notice قاطی شده بود که مصرف دیگری هم دارد: پیام لغو نوبت توسط
--   مطب)، یا با فیلدهای دیگری هم‌پوشانی داشت که کاربرد مستقل خودشان را
--   داشتند (مثل notes روی پکیج که توضیح پروتکل درمانی است — رد پرداخت آن
--   را کامل بازنویسی/پاک می‌کرد). این ستون مستقل هم مشکل «دلیل نمایش داده
--   نمی‌شود» را حل می‌کند هم مشکل «دلیل رد، بعد از تایید نهایی هم روی صفحه
--   می‌ماند» را — چون از این پس confirm صریحا همین ستون را null می‌کند.
-- ─────────────────────────────────────────────────────────────────────────────

alter table psy_stages   add column if not exists payment_reject_reason text;
alter table psy_sessions add column if not exists payment_reject_reason text;
alter table psy_packages add column if not exists payment_reject_reason text;
