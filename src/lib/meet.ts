// ─────────────────────────────────────────────────────────────────────────────
// روش برگزاری جلسه‌ی آنلاین — گوگل‌میت، زوم، واتساپ، بله، تماس تلفنی.
//
// چرا ماژول جدا (و نه داخل lib/psy.ts): این‌جا هم سمت سرور (اعتبارسنجی) و هم
// سمت مرورگر (پنل متخصص و پنل مراجع) لازم است، ولی lib/psy.ts کلاینت
// supabase با کلید service-role را ایمپورت می‌کند و نباید وارد باندل مرورگر شود.
// این فایل هیچ وابستگی‌ای ندارد — امن برای هر دو طرف.
//
// مقدار خام همیشه در همان ستون meet_link ذخیره می‌شود (URL یا شماره)، و
// meet_method می‌گوید چطور تفسیرش کنیم. href نهایی در لحظه‌ی نمایش ساخته
// می‌شود (meetHref) — نه ذخیره‌شده، تا تغییر روش بدون مهاجرت دیتا ممکن باشد.
// ─────────────────────────────────────────────────────────────────────────────

export type MeetMethod = 'google_meet' | 'zoom' | 'whatsapp' | 'bale' | 'phone'

export const MEET_METHODS: MeetMethod[] = ['google_meet', 'zoom', 'whatsapp', 'bale', 'phone']

export const DEFAULT_MEET_METHOD: MeetMethod = 'google_meet'

export function isMeetMethod(v: unknown): v is MeetMethod {
  return typeof v === 'string' && (MEET_METHODS as string[]).includes(v)
}

type MeetMeta = {
  label: string        // نام روش در پنل متخصص
  action: string       // متن دکمه‌ای که مراجع می‌بیند
  hint: string         // راهنمای زیر فیلد در پنل
  placeholder: string
  kind: 'url' | 'phone'  // نوع ورودی — تعیین‌کننده‌ی اعتبارسنجی
}

export const MEET_META: Record<MeetMethod, MeetMeta> = {
  google_meet: {
    label: 'گوگل‌میت',
    action: 'ورود به جلسه‌ی گوگل‌میت',
    hint: 'لینک ثابت گوگل‌میت خود را وارد کنید (از حساب Gmail خود در meet.google.com/new بسازید).',
    placeholder: 'https://meet.google.com/xxx-yyyy-zzz',
    kind: 'url',
  },
  zoom: {
    label: 'زوم',
    action: 'ورود به جلسه‌ی زوم',
    hint: 'لینک اتاق شخصی زوم خود را وارد کنید (Personal Meeting Room در پنل zoom.us).',
    placeholder: 'https://zoom.us/j/1234567890',
    kind: 'url',
  },
  whatsapp: {
    label: 'واتساپ',
    action: 'شروع تماس در واتساپ',
    hint: 'شماره‌ی موبایل واتساپ خود را وارد کنید؛ مراجع با یک کلیک وارد گفت‌وگو با شما می‌شود.',
    placeholder: '09123456789',
    kind: 'phone',
  },
  bale: {
    label: 'بله',
    action: 'شروع گفت‌وگو در بله',
    hint: 'شماره‌ی موبایل حساب بله‌ی خود را وارد کنید (یا نشانی کامل پروفایل بله).',
    placeholder: '09123456789',
    kind: 'phone',
  },
  phone: {
    label: 'تماس تلفنی',
    action: 'تماس تلفنی',
    hint: 'شماره‌ای که در زمان جلسه با آن پاسخگو هستید؛ برای مراجع قابل شماره‌گیری خواهد بود.',
    placeholder: '09123456789',
    kind: 'phone',
  },
}

// ارقام فارسی/عربی → لاتین (ورودی کاربر ممکن است فارسی تایپ شده باشد)
function toLatinDigits(s: string): string {
  return s
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
}

// نرمال‌سازی شماره‌ی ایرانی به فرمت بین‌المللی بدون + (برای wa.me)
// 09123456789 → 989123456789 ؛ +989123456789 → 989123456789
function normalizeIranPhone(raw: string): string | null {
  const d = toLatinDigits(raw).replace(/[\s\-()+.]/g, '')
  if (/^09\d{9}$/.test(d)) return '98' + d.slice(1)
  if (/^989\d{9}$/.test(d)) return d
  if (/^9\d{9}$/.test(d)) return '98' + d
  return null
}

// اعتبارسنجی مقدار بر اساس روش — پیام خطای فارسی برمی‌گرداند یا null (یعنی معتبر)
export function validateMeetValue(method: MeetMethod, rawValue: string): string | null {
  const value = rawValue.trim()
  if (!value) return null // خالی مجاز است (یعنی هنوز تنظیم نشده)
  const meta = MEET_META[method]
  if (meta.kind === 'url') {
    if (!/^https?:\/\//i.test(value)) return 'نشانی جلسه باید با http:// یا https:// شروع شود'
    return null
  }
  // phone — بله اجازه‌ی نشانی کامل هم دارد
  if (method === 'bale' && /^https?:\/\//i.test(value)) return null
  if (!normalizeIranPhone(value)) return 'شماره‌ی موبایل معتبر وارد کنید (مثال: 09123456789)'
  return null
}

// ساخت href نهایی که مراجع روی آن کلیک می‌کند؛ null یعنی مقدار قابل استفاده نیست
export function meetHref(method: MeetMethod, rawValue: string | null | undefined): string | null {
  const value = (rawValue || '').trim()
  if (!value) return null
  switch (method) {
    case 'google_meet':
    case 'zoom':
      return /^https?:\/\//i.test(value) ? value : null
    case 'whatsapp': {
      const p = normalizeIranPhone(value)
      return p ? `https://wa.me/${p}` : null
    }
    case 'bale': {
      if (/^https?:\/\//i.test(value)) return value
      const p = normalizeIranPhone(value)
      return p ? `https://ble.ir/${p}` : null
    }
    case 'phone': {
      const p = normalizeIranPhone(value)
      return p ? `tel:+${p}` : null
    }
    default:
      return null
  }
}

// متن دکمه‌ای که به مراجع نمایش داده می‌شود
export function meetActionLabel(method: MeetMethod): string {
  return MEET_META[method]?.action || MEET_META[DEFAULT_MEET_METHOD].action
}
