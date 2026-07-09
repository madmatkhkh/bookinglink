-- ─────────────────────────────────────────────────────────────────────────────
-- عمومی‌سازیِ نیچِ روانشناسی — قابلِ استفاده برای هر تخصص (نه فقط روانشناسیِ کودک)
--
-- طبقِ تصمیمِ صریحِ صاحبِ پروژه: داده‌هایِ فعلی همه تستی‌اند، پس این یک rename
-- واقعی است (نه additive-فقط) — بدونِ نگرانیِ از‌دست‌رفتنِ داده‌ی واقعی.
--
-- مدلِ قبلی فرض می‌کرد هر پرونده = «کودک» + «پدر» + «مادر». مدلِ تازه:
--   • client_name  = مراجع (هرکسی، هر سنی)
--   • contact_phone/contact_name = تماسِ اصلی (برایِ ورود/OTP) — می‌تواند خودِ
--     مراجع باشد (بزرگسال) یا یک نفرِ دیگر (والدینِ کودک، همراهِ سالمند، و...)
--   • contact2_name/contact2_phone = تماسِ دومِ اختیاری (مثلاً والدینِ دیگر،
--     همسر، یا هر همراهِ دیگری) — کاملاً اختیاری، اگر لازم نبود خالی می‌ماند
--   • psy_resource_profiles.companion_label = برچسبِ همین تماسِ دوم، به‌انتخابِ
--     خودِ هر متخصص («والدین»/«همسر»/«همراه»/خالی=اصلاً استفاده نمی‌کند)
--
-- جلسات/پروتکل هم از «کودک/والدین» به «اصلی/دومی» (primary/secondary) تغییر کرد
-- — همان برچسبِ companion_label رویِ «دومی» نمایش داده می‌شود.
-- ─────────────────────────────────────────────────────────────────────────────

-- psy_cases: هویتِ پرونده عمومی شد
alter table psy_cases rename column child_name to client_name;
alter table psy_cases rename column child_name_en to client_name_en;
alter table psy_cases rename column father_name to contact_name;
alter table psy_cases rename column father_phone to contact_phone;
alter table psy_cases rename column mother_name to contact2_name;
alter table psy_cases rename column mother_phone to contact2_phone;
-- ستونِ phone خام کپیِ بی‌مصرفِ contact_phone بود؛ parent_name هم مشتق‌شده و هیچ‌جا نمایش داده نمی‌شد
alter table psy_cases drop column if exists phone;
alter table psy_cases drop column if exists parent_name;

-- psy_packages: «کودک/والدین» → «اصلی/دومی»
alter table psy_packages rename column child_sessions to primary_sessions;
alter table psy_packages rename column child_session_type to primary_session_type;
alter table psy_packages rename column parent_sessions to secondary_sessions;
alter table psy_packages rename column parent_session_type to secondary_session_type;

-- psy_resource_profiles: برچسبِ قابل‌تنظیمِ «تماسِ دوم» — خالی یعنی این متخصص
-- اصلاً از این مفهوم استفاده نمی‌کند (مثلاً درمانِ فردیِ بزرگسال)
alter table psy_resource_profiles add column if not exists companion_label text not null default '';
