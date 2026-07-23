// ─────────────────────────────────────────────────────────────────────────────
// ارسال پیامک OTP از طریق sms.ir (متد «ارسال الگو/Verify»)
//
// این ماژول فقط پیامک را می‌فرستد — کد OTP خودش (تولید، ذخیره، انقضا، تایید)
// همچنان کاملا توسط خود nobatlink مدیریت می‌شود (auth.ts). یعنی از سرویس
// «تایید» sms.ir استفاده نمی‌کنیم، فقط از سرویس ارسال پیامک الگودار.
//
// پیش‌نیاز (سمت پنل sms.ir، قبل از کار کردن این فایل):
//   1) وارد پنل sms.ir شو → «برنامه‌نویسان» → کلید وب‌سرویس (API Key) بساز.
//   2) همان‌جا → «الگوها»/«Verify» → یک الگوی تاییدیه بساز، مثلا:
//        «کد ورود شما: %CODE%»
//      (پارامتر را دقیقا همین اسم — CODE — بگذار تا با کد زیر یکی باشد.)
//      بعد ساختنش، یک عدد «شناسه‌ی الگو» (templateId) به تو می‌دهد.
//   3) این دو مقدار را در env بگذار: SMS_IR_API_KEY و SMS_IR_TEMPLATE_ID
//
// وقتی این دو env ست نباشند، این تابع کاری نمی‌کند (silent no-op) — یعنی
// پروژه همچنان با OTP_ECHO_CODE=true قابل تست‌کردن است، بدون نیاز به پیامک
// واقعی. به‌محض ست‌شدن این دو env، پیامک واقعی جایگزین می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// آدرس پایه‌ی API — همان الگوی ZIBAL_API_BASE در lib/zibal.ts.
//
// چرا لازم است: ورسل از خارج ایران به api.sms.ir وصل می‌شود و این اتصال
// می‌تواند در سطح شبکه بخوابد (خطای «اتصال به سرویس پیامک برقرار نشد» —
// نه 401/403، یعنی درخواست اصلا به مقصد نمی‌رسد). سرور رله‌ی زیبال (همان
// IP ثابت) از قبل مسیرهای /sms/v1/* را پاس می‌دهد؛ با ست‌کردن این env
// پیامک هم از همان IP خارج می‌شود، بدون هیچ تغییر کد دیگری.
//
//   SMS_IR_API_BASE=https://<دامنه‌ی رله>/sms/v1
//
// ست‌نشده = رفتار قبلی، مستقیم به api.sms.ir.
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE = (process.env.SMS_IR_API_BASE || 'https://api.sms.ir/v1').replace(/\/+$/, '')

export type SmsSendResult = { ok: true } | { ok: false; error: string }

// ─────────────────────────────────────────────────────────────────────────────
// نقطه‌ی واحد تماس با sms.ir — چهار تابع ارسال از همین رد می‌شوند.
//
// چرا لازم بود: قبلا هر تابع خودش fetch می‌زد با `res.json()` خام. سه مشکل داشت:
//   1) هیچ timeout ای نبود — اگر مقصد جواب نمی‌داد، تابع تا سقف خود ورسل معلق
//      می‌ماند و کاربر فقط یک لودینگ بی‌پایان می‌دید.
//   2) هدر `Accept: text/plain` فرستاده می‌شد ولی جواب با `res.json()` خوانده
//      می‌شد؛ اگر sms.ir متن ساده برمی‌گرداند، پارس شکست می‌خورد و `data` تهی
//      می‌شد — یعنی حتی ارسال **موفق** هم «ناموفق» گزارش می‌شد، و پیام خطا هم
//      همان جمله‌ی کلی بی‌فایده بود چون `data.message` وجود نداشت.
//   3) بدنه‌ی واقعی پاسخ هیچ‌وقت لاگ نمی‌شد، پس علت واقعی قابل تشخیص نبود.
//
// حالا: بدنه اول به‌صورت متن خوانده می‌شود، بعد تلاش برای JSON. هر شکستی با
// وضعیت HTTP و بدنه‌ی خام لاگ می‌شود تا در لاگ ورسل دقیقا معلوم شود چه شد.
// ─────────────────────────────────────────────────────────────────────────────

const SMS_TIMEOUT_MS = 12000

// وقتی SMS_IR_API_BASE ست است یعنی از رله می‌رویم، و رله بدون هدر x-relay-key
// همه‌چیز را 401 می‌کند (وگرنه یک پروکسی باز به sms.ir می‌شد). همان کلید رله‌ی
// زیبال است، چون همان سرور است. عمدا فقط وقتی فرستاده می‌شود که واقعا از رله
// عبور می‌کنیم — نه در تماس مستقیم با api.sms.ir، تا کلید به بیرون نشت نکند.
const USING_RELAY = !!process.env.SMS_IR_API_BASE
const RELAY_KEY = process.env.ZIBAL_RELAY_KEY || ''

function smsHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-api-key': apiKey,
    ...(USING_RELAY && RELAY_KEY ? { 'x-relay-key': RELAY_KEY } : {}),
  }
}

type SmsPostResult =
  | { ok: true }
  | { ok: false; error: string }

async function smsPost(path: string, apiKey: string, body: unknown, label: string): Promise<SmsPostResult> {
  const url = `${API_BASE}${path}`
  const started = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: smsHeaders(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
    })
    // متن اول، بعد JSON — تا پاسخ غیر-JSON هم قابل لاگ‌کردن باشد
    const raw = await res.text().catch(() => '')
    let data: any = null
    try { data = raw ? JSON.parse(raw) : null } catch { /* پاسخ JSON نبود */ }

    if (res.ok && data?.status === 1) return { ok: true }

    console.error(`[SMS][${label}] ناموفق — HTTP ${res.status} در ${Date.now() - started}ms | url=${url} | مسیر: ${USING_RELAY ? 'رله' : 'مستقیم'} | بدنه: ${raw.slice(0, 400)}`)

    // پیام خود sms.ir بهترین راهنماست (مثلا «اعتبار کافی نیست»)
    if (data?.message) return { ok: false, error: String(data.message) }
    if (res.status === 401 || res.status === 403) {
      // 401 از رله معنای کاملا متفاوتی با 401 از خود sms.ir دارد
      if (USING_RELAY && !RELAY_KEY)
        return { ok: false, error: 'رله کلید نمی‌گیرد — ZIBAL_RELAY_KEY ست نشده' }
      return { ok: false, error: USING_RELAY
        ? 'رله یا sms.ir درخواست را رد کرد (401/403) — کلید رله و کلید sms.ir را بررسی کنید'
        : 'کلید سرویس پیامک پذیرفته نشد (401/403) — کلید یا محدودیت آی‌پی پنل sms.ir را بررسی کنید' }
    }
    if (!raw)
      return { ok: false, error: `سرویس پیامک پاسخ خالی داد (HTTP ${res.status})` }
    return { ok: false, error: `ارسال پیامک ناموفق بود (HTTP ${res.status})` }
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    console.error(`[SMS][${label}] ${timedOut ? '[TIMEOUT]' : 'خطای شبکه'} بعد از ${Date.now() - started}ms | url=${url} |`, err?.name, err?.message)
    return {
      ok: false,
      error: timedOut
        ? 'سرویس پیامک در مهلت مقرر پاسخ نداد'
        : 'اتصال به سرویس پیامک برقرار نشد',
    }
  }
}

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
  return smsPost('/send/verify', apiKey, {
    mobile: phone,
    templateId: Number(templateId),
    parameters: [
      { name: 'NAME', value: name },
      { name: 'DATE', value: date },
      { name: 'TIME', value: time },
    ],
  }, 'reminder')
}

/** ارسال کد OTP به شماره‌ی موبایل از طریق الگوی تاییدیه‌ی sms.ir */
export async function sendOtpSms(phone: string, code: string): Promise<SmsSendResult> {
  const apiKey = process.env.SMS_IR_API_KEY
  const templateId = process.env.SMS_IR_TEMPLATE_ID
  if (!apiKey || !templateId) return { ok: false, error: 'پیامک تنظیم نشده' }

  return smsPost('/send/verify', apiKey, {
    mobile: phone,
    templateId: Number(templateId),
    parameters: [{ name: 'CODE', value: code }],
  }, 'otp')
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
  return smsPost('/send/bulk', apiKey, { lineNumber: Number(lineNumber), messageText: message, mobiles: [phone] }, 'bulk')
}

// ─────────────────────────────────────────────────────────────────────────────
// پیام‌های تراکنشی نوبت (تایید نوبت به مراجع، نوبت جدید به متخصص).
//
// چرا از همان مسیر send/verify می‌روند و نه از خط اختصاصی:
// خط اختصاصی این حساب «تبلیغاتی» است، و طبق مستندات sms.ir پیامک تبلیغاتی به
// شماره‌های لیست سیاه نمی‌رسد — یعنی مراجعی که شماره‌اش بلک‌لیست است بی‌صدا
// تایید نوبتش را نمی‌گرفت و ما هم خبردار نمی‌شدیم (API «موفق» برمی‌گرداند).
// در مقابل send/verify روی خط خدماتی خود sms.ir می‌رود و به همه می‌رسد.
// بعد از خدماتی‌شدن خط، می‌شود این‌ها را هم به متن آزاد منتقل کرد.
// ─────────────────────────────────────────────────────────────────────────────

type TemplateParam = { name: string; value: string }

/** ارسال یک الگوی verify. مشترک بین پیام‌های تراکنشی جدید. */
async function sendTemplateSms(templateId: string, phone: string, parameters: TemplateParam[]): Promise<SmsSendResult> {
  const apiKey = process.env.SMS_IR_API_KEY
  if (!apiKey || !templateId) return { ok: false, error: 'پیامک تنظیم نشده' }
  return smsPost('/send/verify', apiKey, { mobile: phone, templateId: Number(templateId), parameters }, 'booking')
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
