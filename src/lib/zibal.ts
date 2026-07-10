// ─────────────────────────────────────────────────────────────────────────────
// درگاه پرداخت آنلاین — زیبال (به‌جای زرین‌پال، طبق نظر خودت — پرداختی و
// پشتیبانی بهتر). برای فعال‌شدن واقعی باید ZIBAL_MERCHANT_ID به env اضافه شود.
// برای تست بدون حساب واقعی: ZIBAL_SANDBOX=true (از merchant تستی خود زیبال
// استفاده می‌کند، نیازی به مرچنت واقعی نیست).
//
// ⚠️ کارمزد پلتفرم + تسهیم خودکار (جولای ۲۰۲۶): چون همه‌ی تراکنش‌های آنلاین از
// یک ZIBAL_MERCHANT_ID واحد (سراسری پلتفرم) رد می‌شوند، ۱۰۰٪ پول همین الان
// مستقیم به حساب صاحب پلتفرم می‌رود — نه هر tenant مرچنت خودش. یعنی «کارمزد
// گرفتن» به‌صورت خودکار همین الان دارد اتفاق می‌افتد؛ چیزی که کم دارد یک
// مکانیزم واریز سهم دکتر است. زیبال سرویس «تسهیم» دارد (تقسیم خودکار هر
// تراکنش بین چند شبا/ذی‌نفع، مستندات در help.zibal.ir/pdocs.zibal.ir) ولی چون
// آن صفحات برای fetch خودکار مسدودند، پیاده‌سازی زیر بر پایه‌ی یک کتابخانه‌ی
// غیررسمی (NuGet: ZibalClient) است، نه مستندات رسمی تاییدشده. به همین دلیل
// پشت ZIBAL_MULTIPLEXING_ENABLED است و پیش‌فرض خاموش — حتی اگر شبای دکتر ثبت
// شده باشد، تا این env صریحا true نشود، تراکنش عادی (بدون تسهیم) انجام می‌شود.
// قبل از روشن‌کردنش روی پروداکشن: (۱) با ZIBAL_SANDBOX=true یک تراکنش تستی با
// یک شبای واقعی بزن، (۲) گزارش تسهیم را در پنل زیبال چک کن که سهم درست تقسیم
// شده، (۳) اگر زیبال «ذی‌نفع تعریف‌نشده» برگرداند، طبق مستندات زیبال باید اول
// از پنل کاربری خود زیبال (نه از این کد) هر شبا را به‌عنوان ذی‌نفع تعریف/تایید
// کنی. اگر فرمت درخواست را زیبال رد کرد، با پشتیبانی زیبال (تیکت) هماهنگ کن.
// ─────────────────────────────────────────────────────────────────────────────

const REAL_MERCHANT = process.env.ZIBAL_MERCHANT_ID || ''
const SANDBOX = process.env.ZIBAL_SANDBOX === 'true'
const MERCHANT = REAL_MERCHANT || (SANDBOX ? 'zibal' : '')  // 'zibal' = مرچنت تستی رسمی خود زیبال

// کارمزد پلتفرم روی هر تراکنش آنلاین — عدد درصد، از env (بدون نیاز به تغییر
// کد برای عوض‌کردنش). مقدار پیش‌فرض فقط یک نقطه‌ی شروع موقت است.
export const PLATFORM_COMMISSION_PERCENT = Number(process.env.PLATFORM_COMMISSION_PERCENT) || 0

// آیا تلاش برای تسهیم خودکار (واریز مستقیم سهم دکتر به شبای خودش) فعال است؟
export const MULTIPLEXING_ENABLED = process.env.ZIBAL_MULTIPLEXING_ENABLED === 'true'

const API_BASE = 'https://gateway.zibal.ir/v1'
const STARTPAY_BASE = 'https://gateway.zibal.ir/start'

export type ZibalRequestResult = { ok: true; trackId: number; url: string } | { ok: false; error: string }
// amountRial: مبلغ واقعا پرداخت‌شده طبق خود زیبال (ریال) — callback با آن
// چک می‌کند که رسید verifyشده دقیقا مال همین intent (با همین مبلغ) است.
export type ZibalVerifyResult = { ok: true; refNumber: string | number; amountRial: number | null } | { ok: false; error: string }

// اطلاعات تسهیم برای یک درخواست پرداخت — اختیاری، فقط وقتی دکتر شبا ثبت کرده
export type SplitInfo = { sheba: string; doctorAmountToman: number }

// مبلغ‌ها همه‌جای این پروژه تومان است؛ زیبال ریال می‌گیرد (× 10)
export async function requestZibalPayment(
  amountToman: number, description: string, callbackUrl: string, mobile?: string, split?: SplitInfo
): Promise<ZibalRequestResult> {
  if (!MERCHANT) return { ok: false, error: 'درگاه پرداخت آنلاین هنوز تنظیم نشده (ZIBAL_MERCHANT_ID)' }
  try {
    const body: Record<string, unknown> = {
      merchant: MERCHANT,
      amount: Math.round(amountToman * 10),
      callbackUrl,
      description,
      ...(mobile ? { mobile } : {}),
    }
    // تسهیم فقط اگر صریحا روشن باشد و اطلاعات شبا موجود باشد — وگرنه تراکنش
    // عادی (۱۰۰٪ به مرچنت پلتفرم، رفتار فعلی) بدون تغییر انجام می‌شود.
    if (MULTIPLEXING_ENABLED && split && split.doctorAmountToman > 0) {
      body.percentMode = 0 // 0 = مبلغ ثابت (تومان/ریال)، نه درصد — سهم دکتر را خودمان از قبل محاسبه کرده‌ایم
      body.feeMode = 0 // کارمزد زیبال از خود تراکنش کسر می‌شود (سهم مرچنت اصلی، نه سهم دکتر)
      body.multiplexingInfos = [
        { bankAccount: split.sheba, amount: Math.round(split.doctorAmountToman * 10), wagePayer: false },
      ]
    }
    const res = await fetch(`${API_BASE}/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data?.result === 100 && data?.trackId) {
      return { ok: true, trackId: data.trackId, url: `${STARTPAY_BASE}/${data.trackId}` }
    }
    return { ok: false, error: data?.message || 'اتصال به درگاه پرداخت ناموفق بود' }
  } catch {
    return { ok: false, error: 'خطا در اتصال به درگاه پرداخت' }
  }
}

export async function verifyZibalPayment(trackId: number | string): Promise<ZibalVerifyResult> {
  if (!MERCHANT) return { ok: false, error: 'درگاه پرداخت آنلاین هنوز تنظیم نشده' }
  try {
    const res = await fetch(`${API_BASE}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: MERCHANT, trackId }),
    })
    const data = await res.json()
    // 100 = تایید تازه، 201 = قبلا تایید شده (idempotent — نباید خطا حساب شود)
    if (data?.result === 100 || data?.result === 201) {
      return {
        ok: true, refNumber: data.refNumber ?? trackId,
        amountRial: typeof data.amount === 'number' && Number.isFinite(data.amount) ? data.amount : null,
      }
    }
    return { ok: false, error: data?.message || 'پرداخت تاییدنشده است' }
  } catch {
    return { ok: false, error: 'خطا در تایید پرداخت' }
  }
}
