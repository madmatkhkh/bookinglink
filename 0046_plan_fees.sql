-- ───────────────────────────────────────────────────────────────────────────
-- 0046 — فاز P2 قیمت‌گذاری (MODULES.md بخش 9.4 و 9.6): کارمزد سقف‌دار per-پلن
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent. تا این migration اجرا نشده، کد جدید عینا مدل قدیمی
-- (کمیسیون سراسری/override) را اجرا می‌کند و ستون‌های تفکیک را نمی‌نویسد —
-- استقرار از هر دو جهت امن است.
--
--   1) ستون‌های تفکیک کارمزد (پایه + مالیات بر ارزش افزوده) روی intent و ledger.
--      commission_amount همچنان «کل کسر» می‌ماند (پایه+VAT) — معنای ستون قدیمی
--      و همه‌ی گزارش‌های مالی موجود دست نمی‌خورد.
--   2) ردیف 'plan_fees' در platform_settings: درصد/کف/سقف per-پلن + نرخ VAT.
--      ساختار آینه‌ی خود زیبال (1%، کف 2000، سقف 20000 + 10% مالیات).
--      'free' قدیمی در کد alias پلن پایه است. تغییر عددها بدون دیپلوی: همین
--      ردیف را در SQL Editor ویرایش کن.
--
-- توجه: override per-متخصص (psy_resource_profiles.commission_percent_override)
-- همچنان برنده است و مدل قدیمی خالص می‌ماند (بدون کف/سقف/تفکیک) — معامله‌های
-- خاص موجود، از جمله معافیت (0)، عینا حفظ می‌شوند.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) تفکیک پایه/مالیات کارمزد
alter table public.psy_payment_intents
  add column if not exists fee_base_amount bigint,
  add column if not exists fee_vat_amount  bigint;
alter table public.ledger_entries
  add column if not exists fee_base_amount bigint,
  add column if not exists fee_vat_amount  bigint;

-- 2) پارامترهای کارمزد per-پلن (تومان؛ درصدها بدون احتساب VAT اعلام می‌شوند)
insert into public.platform_settings (key, value) values ('plan_fees', '{
  "vat_percent": 10,
  "plans": {
    "base": {"pct": 3,   "floor": 3000, "cap": 120000},
    "pro":  {"pct": 2.5, "floor": 3000, "cap": 100000},
    "team": {"pct": 2,   "floor": 3000, "cap": 80000}
  }
}'::jsonb)
on conflict (key) do nothing;
