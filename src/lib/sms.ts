// ─────────────────────────────────────────────────────────────────────────────
// ارسال پیامک OTP از طریق sms.ir (متد «ارسال الگو/Verify»)
//
// این ماژول فقط پیامک را می‌فرستد — کد OTP خودش (تولید، ذخیره، انقضا، تایید)
// همچنان کاملا توسط خود nobatlink مدیریت می‌شود (auth.ts). یعنی از سرویس
// «تایید» sms.ir استفاده نمی‌کنیم، فقط از سرویس ارسال پیامک الگودار.
//
// پیش‌نیاز (سمت پنل sms.ir، قبل از کار کردن این فایل):
//   ۱) وارد پنل sms.ir شو → «برنامه‌نویسان» → کلید وب‌سرویس (API Key) بساز.
//   ۲) همان‌جا → «الگوها»/«Verify» → یک الگوی تاییدیه بساز، مثلا:
//        «کد ورود شما: %CODE%»
//      (پارامتر را دقیقا همین اسم — CODE — بگذار تا با کد زیر یکی باشد.)
//      بعد ساختنش، یک عدد «شناسه‌ی الگو» (templateId) به تو می‌دهد.
//   ۳) این دو مقدار را در env بگذار: SMS_IR_API_KEY و SMS_IR_TEMPLATE_ID
//
// وقتی این دو env ست نباشند، این تابع کاری نمی‌کند (silent no-op) — یعنی
// پروژه همچنان با OTP_ECHO_CODE=true قابل تست‌کردن است، بدون نیاز به پیامک
// واقعی. به‌محض ست‌شدن این دو env، پیامک واقعی جایگزین می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

export type SmsSendResult = { ok: true } | { ok: false; error: string }

/** آیا پیامک واقعی تنظیم شده؟ (برای تصمیم‌گیری routeها که آیا dev_code را echo کنند یا نه) */
export function smsConfigured(): boolean {
  return !!(process.env.SMS_IR_API_KEY && process.env.SMS_IR_TEMPLATE_ID)
}

/** آیا یادآوری پیامکی تنظیم شده؟ (الگوی جدا از OTP — SMS_IR_REMINDER_TEMPLATE_ID) */
export function reminderSmsConfigured(): boolean {
  return !!(process.env.SMS_IR_API_KEY && process.env.SMS_IR_REMINDER_TEMPLATE_ID)
}

/**
 * یادآوری نوبت فردا — از همان متد send/verify با یک الگوی دوم.
 * الگوی پیشنهادی در پنل sms.ir (پارامترها دقیقا با همین نام‌ها):
 *   «یادآوری: نوبت شما در %NAME% فردا %DATE% ساعت %TIME% است.»
 * (send/verify برخلاف ارسال خط خدماتی، نیازی به خط اختصاصی ندارد و برای
 *  پیام‌های تراکنشی این‌چنینی مجاز است.)
 */
export async function sendReminderSms(phone: string, name: string, date: string, time: string): Promise<SmsSendResult> {
  const apiKey = process.env.SMS_IR_API_KEY
  const templateId = process.env.SMS_IR_REMINDER_TEMPLATE_ID
  if (!apiKey || !templateId) return { ok: false, error: 'یادآوری پیامکی تنظیم نشده' }
  try {
    const res = await fetch('https://api.sms.ir/v1/send/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain', 'x-api-key': apiKey },
      body: JSON.stringify({
        mobile: phone,
        templateId: Number(templateId),
        parameters: [
          { name: 'NAME', value: name },
          { name: 'DATE', value: date },
          { name: 'TIME', value: time },
        ],
      }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.status === 1) return { ok: true }
    console.error('sms.ir reminder failed:', res.status, data)
    return { ok: false, error: data?.message || 'ارسال پیامک ناموفق بود' }
  } catch (err) {
    console.error('sms.ir network error:', err)
    return { ok: false, error: 'اتصال به سرویس پیامک برقرار نشد' }
  }
}

/** ارسال کد OTP به شماره‌ی موبایل از طریق الگوی تاییدیه‌ی sms.ir */
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
    // فرمت استاندارد پاسخ sms.ir: { status: 1, message: "موفق", data: {...} }
    if (res.ok && data?.status === 1) return { ok: true }
    console.error('sms.ir send/verify failed:', res.status, data)
    return { ok: false, error: data?.message || 'ارسال پیامک ناموفق بود' }
  } catch (err) {
    console.error('sms.ir network error:', err)
    return { ok: false, error: 'اتصال به سرویس پیامک برقرار نشد' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ارسال پیامک آزاد متنی (نه قالب‌دار) — برای «اطلاع‌رسانی لیست انتظار» و
// «کمپین بازاریابی». برخلاف send/verify (که فقط قالب‌های ازپیش‌تاییدشده را
// می‌فرستد)، این نوع پیامک نیازمند یک «خط اختصاصی» در پنل sms.ir است — طبق
// مقررات ارتباطات، پیامک آزاد/تبلیغاتی بدون خط ثبت‌شده مجاز نیست.
//
// ⚠️ این پیاده‌سازی بر پایه‌ی الگوی عمومی API ارسال گروهی sms.ir نوشته شده
// (endpoint: /v1/send/bulk)، نه یک تست زنده با اکانت واقعی — چون مستندات
// sms.ir برای fetch خودکار مسدودند. قبل از استفاده‌ی واقعی: یک بار با یک
// شماره‌ی تستی بزن و پاسخ را چک کن؛ اگر فرمت درخواست را sms.ir رد کرد، با
// پشتیبانی sms.ir (تیکت) دقیق همین endpoint/بدنه را تایید بگیر.
//
// پیش‌نیاز: SMS_IR_LINE_NUMBER (شماره‌خط اختصاصی‌ات از پنل sms.ir). بدون این
// env، این تابع کاری نمی‌کند (silent no-op) — یعنی لیست انتظار و کمپین همچنان
// در پنل قابل‌مشاهده‌اند، فقط پیامک واقعی نمی‌رود.
// ─────────────────────────────────────────────────────────────────────────────

export function freeTextSmsConfigured(): boolean {
  return !!(process.env.SMS_IR_API_KEY && process.env.SMS_IR_LINE_NUMBER)
}

export async function sendFreeTextSms(phone: string, message: string): Promise<SmsSendResult> {
  const apiKey = process.env.SMS_IR_API_KEY
  const lineNumber = process.env.SMS_IR_LINE_NUMBER
  if (!apiKey || !lineNumber) return { ok: false, error: 'پیامک آزاد تنظیم نشده (نیازمند SMS_IR_LINE_NUMBER)' }
  try {
    const res = await fetch('https://api.sms.ir/v1/send/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain', 'x-api-key': apiKey },
      body: JSON.stringify({ lineNumber: Number(lineNumber), messageText: message, mobiles: [phone] }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.status === 1) return { ok: true }
    console.error('sms.ir bulk send failed:', res.status, data)
    return { ok: false, error: data?.message || 'ارسال پیامک ناموفق بود' }
  } catch (err) {
    console.error('sms.ir network error:', err)
    return { ok: false, error: 'اتصال به سرویس پیامک برقرار نشد' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// پیام‌های تراکنشی نوبت (تایید نوبت به مراجع، نوبت جدید به متخصص).
//
// چرا از همان مسیر send/verify می‌روند و نه از خط اختصاصی:
// خط اختصاصی این حساب «تبلیغاتی» است، و طبق مستندات sms.ir پیامک تبلیغاتی به
// شماره‌های لیست سیاه نمی‌رسد — یعنی مراجعی که شماره‌اش بلک‌لیست است بی‌صدا
// تایید نوبتش را نمی‌گرفت و ما هم خبردار نمی‌شدیم (API «موفق» برمی‌گرداند).
// در مقابل send/verify روی خط خدماتی خودِ sms.ir می‌رود و به همه می‌رسد.
// بعد از خدماتی‌شدن خط، می‌شود این‌ها را هم به متن آزاد منتقل کرد.
// ─────────────────────────────────────────────────────────────────────────────

type TemplateParam = { name: string; value: string }

/** ارسال یک الگوی verify. مشترک بین پیام‌های تراکنشی جدید. */
async function sendTemplateSms(templateId: string, phone: string, parameters: TemplateParam[]): Promise<SmsSendResult> {
  const apiKey = process.env.SMS_IR_API_KEY
  if (!apiKey || !templateId) return { ok: false, error: 'پیامک تنظیم نشده' }
  try {
    const res = await fetch('https://api.sms.ir/v1/send/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain', 'x-api-key': apiKey },
      body: JSON.stringify({ mobile: phone, templateId: Number(templateId), parameters }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.status === 1) return { ok: true }
    console.error('sms.ir template send failed:', templateId, res.status, data)
    return { ok: false, error: data?.message || 'ارسال پیامک ناموفق بود' }
  } catch (err) {
    console.error('sms.ir network error:', err)
    return { ok: false, error: 'اتصال به سرویس پیامک برقرار نشد' }
  }
}

/**
 * تایید نوبت برای مراجع — بعد از پرداخت موفق.
 * الگوی پیشنهادی در پنل sms.ir:
 *   «نوبت شما در %NAME% قطعی شد: %DATE% ساعت %TIME%»
 */
export function bookingConfirmSmsConfigured(): boolean {
  return !!(process.env.SMS_IR_API_KEY && process.env.SMS_IR_CONFIRM_TEMPLATE_ID)
}

export async function sendBookingConfirmSms(phone: string, name: string, date: string, time: string): Promise<SmsSendResult> {
  return sendTemplateSms(process.env.SMS_IR_CONFIRM_TEMPLATE_ID || '', phone, [
    { name: 'NAME', value: name },
    { name: 'DATE', value: date },
    { name: 'TIME', value: time },
  ])
}

/**
 * اطلاع نوبت تازه به خود متخصص.
 * الگوی پیشنهادی:
 *   «نوبت جدید: %CLIENT% برای %DATE% ساعت %TIME%»
 */
export function newBookingSmsConfigured(): boolean {
  return !!(process.env.SMS_IR_API_KEY && process.env.SMS_IR_NEW_BOOKING_TEMPLATE_ID)
}

export async function sendNewBookingSms(phone: string, client: string, date: string, time: string): Promise<SmsSendResult> {
  return sendTemplateSms(process.env.SMS_IR_NEW_BOOKING_TEMPLATE_ID || '', phone, [
    { name: 'CLIENT', value: client },
    { name: 'DATE', value: date },
    { name: 'TIME', value: time },
  ])
}
