-- 0034 — شماره پیگیری بانکی روی بازپرداخت‌ها
-- additive و امن. متخصص هنگام ثبت بازپرداخت باید شماره پیگیری واریز را بدهد تا
-- در پنل مراجع نمایش داده شود (شفافیت دوطرفه).

alter table public.psy_refunds add column if not exists bank_ref_number text;
