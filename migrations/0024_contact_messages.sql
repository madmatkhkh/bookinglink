-- ─────────────────────────────────────────────────────────────────────────────
-- additive — امن روی دیتابیس زنده.
--
-- پیام‌های فرم «تماس با ما» لندینگ — بازدیدکننده (بدون نیاز به حساب) سوالش را
-- همراه ایمیلش می‌فرستد؛ سوپرادمین در /super/tickets می‌بیند و از طریق ایمیل
-- خودش پاسخ می‌دهد. ip برای rate-limit و ردگیری سواستفاده نگه داشته می‌شود.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  message text not null,
  ip text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table contact_messages enable row level security;
