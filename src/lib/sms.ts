// ─────────────────────────────────────────────────────────────────────────────
// ارسالِ پیامکِ OTP از طریقِ sms.ir (متدِ «ارسالِ الگو/Verify»)
//
// این ماژول فقط پیامک را می‌فرستد — کدِ OTP خودش (تولید، ذخیره، انقضا، تایید)
// همچنان کاملاً توسطِ خودِ nobatlink مدیریت می‌شود (auth.ts). یعنی از سرویسِ
// «تاییدِ» sms.ir استفاده نمی‌کنیم، فقط از سرویسِ ارسالِ پیامکِ الگودار.
//
// پیش‌نیاز (سمتِ پنلِ sms.ir، قبل از کار کردنِ این فایل):
//   ۱) وارد پنلِ sms.ir شو → «برنامه‌نویسان» → کلیدِ وب‌سرویس (API Key) بساز.
//   ۲) همان‌جا → «الگوها»/«Verify» → یک الگویِ تاییدیه بساز، مثلاً:
//        «کدِ ورود شما: %CODE%»
//      (پارامتر را دقیقاً همین اسم — CODE — بگذار تا با کدِ زیر یکی باشد.)
//      بعدِ ساختنش، یک عددِ «شناسه‌ی الگو» (templateId) به تو می‌دهد.
//   ۳) این دو مقدار را در env بگذار: SMS_IR_API_KEY و SMS_IR_TEMPLATE_ID
//
// وقتی این دو env ست نباشند، این تابع کاری نمی‌کند (silent no-op) — یعنی
// پروژه همچنان با OTP_ECHO_CODE=true قابلِ تست‌کردن است، بدونِ نیاز به پیامکِ
// واقعی. به‌محضِ ست‌شدنِ این دو env، پیامکِ واقعی جایگزین می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

export type SmsSendResult = { ok: true } | { ok: false; error: string }

/** آیا پیامکِ واقعی تنظیم شده؟ (برایِ تصمیم‌گیریِ routeها که آیا dev_code را echo کنند یا نه) */
export function smsConfigured(): boolean {
  return !!(process.env.SMS_IR_API_KEY && process.env.SMS_IR_TEMPLATE_ID)
}

/** ارسالِ کدِ OTP به شماره‌ی موبایل از طریقِ الگویِ تاییدیه‌ی sms.ir */
export async function sendOtpSms(phone: string, code: string): Promise<SmsSendResult> {
  const apiKey = process.env.SMS_IR_API_KEY
  const templateId = process.env.SMS_IR_TEMPLATE_ID
  if (!apiKey || !templateId) return { ok: false, error: 'پیامک تنظیم نشده' }

  try {
    const res = await fetch('https://api.sms.ir/v1/send/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/plain',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        mobile: phone,
        templateId: Number(templateId),
        parameters: [{ name: 'CODE', value: code }],
      }),
    })
    const data = await res.json().catch(() => null)
    // فرمتِ استانداردِ پاسخِ sms.ir: { status: 1, message: "موفق", data: {...} }
    if (res.ok && data?.status === 1) return { ok: true }
    console.error('sms.ir send/verify failed:', res.status, data)
    return { ok: false, error: data?.message || 'ارسالِ پیامک ناموفق بود' }
  } catch (err) {
    console.error('sms.ir network error:', err)
    return { ok: false, error: 'اتصال به سرویسِ پیامک برقرار نشد' }
  }
}
