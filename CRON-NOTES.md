# زمان‌بندها (cron)

`vercel.json` جیسون سخت‌گیرانه است و کامنت نمی‌پذیرد — اسکیمای وسل هر کلید
ناشناخته (حتی `_comment`) را رد می‌کند و دیپلوی شکست می‌خورد. پس توضیح این‌جاست.

## وضعیت فعلی

دو زمان‌بند داریم و هرکدام جای متفاوتی اجرا می‌شود:

| زمان‌بند | کجا اجرا می‌شود | چرا |
|---|---|---|
| `/api/cron/reminders` | crontab سرور رله (ساعتی) | Hobby فقط cron روزانه می‌دهد |
| `/api/cron/subscriptions` | `vercel.json` (روزانه) | روزانه کافی است، پس Hobby مشکلی ندارد |

## ۱. `/api/cron/reminders` — منتقل شد به سرور رله

وسل روی پلن Hobby فقط cron **روزانه** می‌دهد (`0 * * * *` هنگام deploy رد
می‌شود)، ولی فاصله‌ی یادآوری هر مجموعه از تب «قابلیت‌ها» تا ۲ ساعت قابل تنظیم
است. پس زمان‌بند به سرور رله‌ی زیبال (همان IP ثابت) منتقل شد:

```cron
7 * * * * /usr/local/bin/nobatlink-reminders.sh
```

نصبش با `install-nobatlink-cron.sh` انجام شده. لاگ:
`/var/log/nobatlink-cron.log`

بررسی سلامت:

```bash
sudo grep -v '"sent":0' /var/log/nobatlink-cron.log   # فقط ارسال‌های واقعی
sudo tail -20 /var/log/nobatlink-cron.log             # اجراهای اخیر
```

⚠️ اگر روزی خواستی به وسل برگردانی، یادت باشد فاصله‌های کمتر از ۱۲ ساعت روی
cron روزانه اصلا کار نمی‌کنند.

## ۲. `/api/cron/subscriptions` — فعال

**ساخته شد.** قبلا این ورودی هر شب ۴۰۴ می‌گرفت چون کدش نوشته نشده بود؛ حالا
route وجود دارد و ورودی به `vercel.json` برگشته (`0 1 * * *` = ۰۴:۳۰ ایران،
روزانه پس با Hobby سازگار است).

دو کار مستقل انجام می‌دهد:

- **حق اشتراک ماهانه** → `ledger_entries` با `purpose='subscription_fee'`.
  پشت سوییچ `platform_settings.plan_prices.enabled` است.
- **صدور فاکتور ماه قبل** → جدول `invoices`. **مستقل از آن سوییچ** اجرا
  می‌شود، چون کارمزد تراکنش‌ها حتی با اشتراک خاموش هم باید فاکتور شود.

شکل entry اشتراک عمدا این‌طور است تا کد تسویه اصلا تغییر نکند:
`amount=0`، `commission_amount=+کل`، `doctor_amount=−کل`، `method='online'`،
`direction='inflow'`، `resource_id=منبع اول`. هر چهار مورد آخر اجباری‌اند —
کوئری `/super/settlements` ردیف بدون `resource_id`، با `direction='outflow'`
یا با `method` غیر از `online` را کنار می‌گذارد، یعنی اشتراک هرگز وصول
نمی‌شود. تکرار اجرا بی‌اثر است: `source_id` یک UUID قطعی از (tenant + ماه) است
و ایندکس یکتای `ledger_source_uniq` پشتیبانش.

بررسی دستی:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  https://nobatlink.com/api/cron/subscriptions | jq
```

خروجی `billing_enabled`, `subscription.charged`, `invoices.issued` را نشان
می‌دهد. با `enabled=false` عدد `charged` همیشه صفر است — این درست است، نه خطا.

نکته‌ها:

- ترایال ۱۴ روزه **cron نمی‌خواهد** — ردیف‌های `tenant_features` با
  `expires_at` ساخته می‌شوند و `lib/modules.ts` هنگام خواندن منقضی‌ها را نادیده
  می‌گیرد. انقضا خودش مکانیزم است.
- اشتراک **سالانه** هیچ زیرساختی ندارد: در `plans.ts` قیمت سالانه هست ولی
  دیتابیس ستون `billing_cycle` یا تاریخ تمدید ندارد. برای سالانه یک مهاجرت
  جدید لازم است.
- `platform_settings.plan_prices.enabled` عمدا `false` است. روشن‌کردن بیلینگ
  باید تصمیم آگاهانه باشد، نه اثر جانبی دیپلوی. تا آن موقع cron هر شب اجرا
  می‌شود، فاکتور صادر می‌کند، ولی هیچ‌کس شارژ نمی‌شود.
