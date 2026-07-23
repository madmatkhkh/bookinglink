// ─────────────────────────────────────────────────────────────────────────────
// قالب پیامک سفارشی هر tenant (migration 0052).
//
// چرا اصلا وجود دارد: متن یادآوری تا امروز یک الگوی ثابت sms.ir بود و همه‌ی
// مطب‌ها یک جمله می‌فرستادند. متن سفارشی از send/verify ممکن نیست، پس از
// send/bulk روی خط اختصاصی می‌رود — و آن خط، خط پلتفرم است.
//
// ⚠️ نتیجه‌ی امنیتی که کل این ماژول حولش چیده شده: متن هر tenant از خط *ما*
// بیرون می‌رود. یک متن تبلیغاتی = بلک‌لیست‌شدن خط = خوابیدن OTP همه‌ی
// tenantهای دیگر. برای همین هیچ متنی بدون status='approved' ارسال نمی‌شود.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'
import { toLatinNum } from './calendar'

export type SmsTemplateKind = 'reminder'
export type SmsTemplateStatus = 'pending_review' | 'approved' | 'rejected'

export type SmsTemplate = {
  id: string
  kind: SmsTemplateKind
  body: string
  status: SmsTemplateStatus
  review_note: string | null
  reviewed_at: string | null
  updated_at: string
}

// جاگذارهای مجاز در متن یادآوری. عمدا دقیقا همان چیزهایی‌اند که cron در دست
// دارد (نام مجموعه، تاریخ، ساعت) — نه یک لیست آرزویی. اگر جاگذاری این‌جا نباشد
// و کاربر بنویسدش، در پیامک واقعی به‌صورت خام «{x}» چاپ می‌شد؛ برای همین
// اعتبارسنجی جاگذار ناشناخته را رد می‌کند، نه اینکه بی‌صدا نادیده بگیرد.
export const REMINDER_PLACEHOLDERS = ['name', 'date', 'time'] as const
export const REMINDER_PLACEHOLDER_HELP: Record<string, string> = {
  name: 'نام مجموعه',
  date: 'تاریخ نوبت',
  time: 'ساعت نوبت',
}

// حد بالا دست‌ودل‌بازانه نیست: هر ۷۰ نویسه‌ی فارسی یک پیامک حساب می‌شود، پس
// 300 نویسه یعنی تا حدود ۵ پیامک از سهمیه‌ی خود tenant. بالاتر از این، هم
// هزینه‌اش را نمی‌فهمد هم اپراتور به محتوای بلند حساس‌تر است.
export const SMS_BODY_MIN = 10
export const SMS_BODY_MAX = 300

export const DEFAULT_REMINDER_BODY = 'یادآوری: نوبت شما در {name} فردا {date} ساعت {time} است.'

export type TemplateValidation = { ok: true; body: string } | { ok: false; error: string }

/**
 * اعتبارسنجی و نرمال‌سازی متن قالب.
 * ارقام فارسی به لاتین تبدیل می‌شوند (قانون محصول: ورودی سهل‌گیر، خروجی لاتین).
 */
export function validateReminderBody(raw: unknown): TemplateValidation {
  const body = toLatinNum(String(raw ?? '').trim())
  if (body.length < SMS_BODY_MIN) return { ok: false, error: `متن پیامک خیلی کوتاه است (حداقل ${SMS_BODY_MIN} نویسه)` }
  if (body.length > SMS_BODY_MAX) return { ok: false, error: `متن پیامک بلندتر از حد مجاز است (حداکثر ${SMS_BODY_MAX} نویسه)` }

  // exec در حلقه به‌جای [...matchAll] — target فعلی tsconfig پروژه اجازه‌ی
  // پیمایش iterator را نمی‌دهد و عوض‌کردن tsconfig برای یک regex بی‌مورد است.
  const used: string[] = []
  const re = /\{([a-zA-Z_]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) used.push(m[1])

  const unknown = used.filter(p => !(REMINDER_PLACEHOLDERS as readonly string[]).includes(p))
  if (unknown.length)
    return { ok: false, error: `جاگذار ناشناخته: ${unknown.map(u => `{${u}}`).join('، ')}` }

  // بدون تاریخ و ساعت، «یادآوری نوبت» عملا بی‌فایده است و مراجع نمی‌داند کِی
  // باید بیاید — این را به‌جای بازبین دستی، همین‌جا می‌گیریم.
  // {name} اجباری است چون اپراتور خط خدماتی می‌گوید پیام نباید بی‌نام‌ونشان
  // باشد — گیرنده باید بفهمد از طرف کیست. بدون آن، یک متن ناشناس از خط
  // خدماتی می‌رفت و سفته‌ی صاحب خط (پلتفرم) را به خطر می‌انداخت.
  // {date} و {time} هم اجباری‌اند چون یادآوری بدون زمان بی‌فایده است.
  const REQUIRED = { name: 'نام مجموعه', date: 'تاریخ', time: 'ساعت' } as const
  for (const req of Object.keys(REQUIRED) as (keyof typeof REQUIRED)[])
    if (!used.includes(req))
      return { ok: false, error: `متن باید شامل جاگذار {${req}} باشد (${REQUIRED[req]})` }

  return { ok: true, body }
}

/** جایگذاری مقادیر واقعی در متن قالب. فقط جاگذارهای شناخته‌شده جایگزین می‌شوند. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{([a-zA-Z_]+)\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole)
}

/**
 * نقشه‌ی tenant_id → متن تاییدشده، برای cron یادآوری (یک کوئری برای همه).
 *
 * fail-open همان الگوی همیشگی کدبیس است، ولی این‌جا معنی‌اش «باز» نیست:
 * اگر جدول هنوز نیست (migration 0052 اجرا نشده)، نقشه‌ی خالی برمی‌گردد و cron
 * به الگوی ثابت قبلی برمی‌گردد — یعنی رفتار دقیقا مثل قبل از این فیچر.
 */
export async function getApprovedReminderTemplates(): Promise<Map<string, string>> {
  try {
    const { data, error } = await sb().from('sms_templates')
      .select('tenant_id, body').eq('kind', 'reminder').eq('status', 'approved')
    if (error) {
      if (!/does not exist/i.test(error.message || '')) console.error('getApprovedReminderTemplates error:', error.message)
      return new Map()
    }
    return new Map((data || []).map(r => [r.tenant_id as string, r.body as string]))
  } catch (e) {
    console.error('getApprovedReminderTemplates exception:', e)
    return new Map()
  }
}

/**
 * تضمین اینکه پیام آزاد بی‌نام‌ونشان از خط خدماتی بیرون نرود.
 *
 * اپراتور خط خدماتی صریحا گفته متن باید مشخص کند از طرف کیست. کمپین و
 * اطلاع‌رسانی لیست انتظار متن آزاد کاربرند و ممکن است اسم مجموعه در آن‌ها
 * نباشد؛ این تابع فقط وقتی اسم را اضافه می‌کند که واقعا نباشد، تا متنی که
 * کاربر خودش درست نوشته دستکاری نشود.
 */
export function ensureSenderIdentity(body: string, clinicName: string): string {
  const text = String(body || '').trim()
  const name = String(clinicName || '').trim()
  if (!name || text.includes(name)) return text
  return `${name}:\n${text}`
}
