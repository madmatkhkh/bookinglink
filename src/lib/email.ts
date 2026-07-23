// ─────────────────────────────────────────────────────────────────────────────
// ارسال ایمیل — برای مراجع/متخصصی که خارج از ایران است و پیامک ایرانی به او
// نمی‌رسد. از Resend استفاده می‌کند (HTTP API ساده، بدون SMTP، مناسب سرورلس).
//
// پیش‌نیاز: یک حساب رایگان در resend.com بساز، دامنه‌ات را verify کن (یا موقتا
// از دامنه‌ی پیش‌فرض Resend برای تست استفاده کن)، یک API Key بساز و در env
// بگذار: RESEND_API_KEY و EMAIL_FROM (مثلا 'نوبت‌لینک <no-reply@mail.nobatlink.com>').
//
// وقتی این envها ست نباشند، این تابع کاری نمی‌کند (silent no-op) — دقیقا
// همان الگوی sms.ts؛ ورود ایمیلی تا وصل‌شدن این سرویس فقط با
// OTP_ECHO_CODE=true قابل تست است.
// ─────────────────────────────────────────────────────────────────────────────

export type EmailSendResult = { ok: true } | { ok: false; error: string }

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

async function send(to: string, subject: string, html: string): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return { ok: false, error: 'ایمیل تنظیم نشده' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => null)
    console.error('resend send failed:', res.status, data)
    return { ok: false, error: data?.message || 'ارسال ایمیل ناموفق بود' }
  } catch (err) {
    console.error('resend network error:', err)
    return { ok: false, error: 'اتصال به سرویس ایمیل برقرار نشد' }
  }
}

/** کد ورود یک‌بارمصرف از طریق ایمیل — جایگزین پیامک برای مراجع خارج از ایران */
export async function sendOtpEmail(email: string, code: string): Promise<EmailSendResult> {
  return send(email, 'کد ورود شما', `
    <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; text-align: right;">
      <p>کد ورود شما:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
      <p style="color:#666; font-size: 13px;">این کد تا 5 دقیقه معتبر است. اگر این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید.</p>
    </div>`)
}

/** یادآوری نوبت فردا از طریق ایمیل — همتای sendReminderSms، با لینک گوگل‌میت
 * اختیاری برای جلسات آنلاین. */
export async function sendReminderEmail(
  email: string, name: string, date: string, time: string, meetLink?: string
): Promise<EmailSendResult> {
  return send(email, `یادآوری نوبت فردا — ${name}`, `
    <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; text-align: right;">
      <p>یادآوری: نوبت شما در <b>${name}</b> فردا <b>${date}</b> ساعت <b>${time}</b> است.</p>
      ${meetLink ? `<p>لینک جلسه‌ی آنلاین: <a href="${meetLink}">${meetLink}</a></p>` : ''}
    </div>`)
}

/** پیام آزاد کمپین (بلاست) — برای اعلامیه‌ها/بازاریابی ساده به لیست مراجعان */
export async function sendCampaignEmail(email: string, subject: string, message: string): Promise<EmailSendResult> {
  return send(email, subject, `<div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; text-align: right; white-space: pre-wrap;">${message}</div>`)
}
