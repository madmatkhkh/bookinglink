-- ─────────────────────────────────────────────────────────────────────────────
-- additive — امن روی دیتابیس زنده.
--
-- ۳ تمپلیت روی لندینگ/ثبت‌نام نشان داده می‌شوند، ولی فقط «روانشناسی (تک‌درمانگر)»
-- الان قابل‌انتخاب است — «سالن زیبایی» و «روانشناسی (کلینیک)» با نشان «به‌زودی»
-- دیده می‌شوند ولی غیرقابل‌کلیک، چون تست نهایی‌شان هنوز تمام نشده.
--
-- ⚠️ نکته‌ی مهم معماری: نیچ «psychology_clinic» یک placeholder صرفا نمایشی
-- است، نه یک تمپلیت واقعا جدا — وقتی روزی فعالش کردید، تنانت‌های این نیچ باید
-- همان PsychologyAdmin.tsx را با فلگ multi_therapist از قبل روشن استفاده کنند
-- (نه یک panel/کد جدا)؛ یعنی موقع فعال‌سازی واقعی، هم روتر
-- `src/app/[slug]/panel/page.tsx` هم هر `niche_key === 'psychology'` دیگری که
-- تصمیم می‌گیرد کدام Admin/جدول استفاده شود، باید 'psychology_clinic' را هم
-- به‌عنوان مترادف psychology بشناسند (یا ساده‌تر: در signup واقعی، tenant را
-- با niche_key='psychology' بساز و فقط multi_therapist=true را در
-- tenant_features ست کن — این را ترجیح می‌دهیم چون نیازی به تغییر ده‌ها فایل
-- نیست). تا آن موقع این ردیف فقط برای نمایش «به‌زودی» است و هیچ tenant واقعی
-- نباید با این کلید ساخته شود.
-- ─────────────────────────────────────────────────────────────────────────────

update niches set is_active = false where key = 'beauty_salon';
update niches set sort_order = 3 where key = 'beauty_salon';

insert into niches (key, display_name, tagline, icon, client_label, resource_label, booking_label, default_theme, record_fields, default_features, sample_services, setup_price, is_active, sort_order)
values (
  'psychology_clinic',
  'روانشناسی (کلینیک چند‌درمانگر)',
  'برای مجموعه‌هایی با چند درمانگر — مدیریت تیم، تقویم مشترک و تسویه‌ی جدا برای هرکدام',
  'brain',
  'مراجع', 'درمانگر', 'جلسه',
  '124 58 237',
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  0, false, 2
)
on conflict (key) do nothing;
