// ─────────────────────────────────────────────────────────────────────────────
// روش‌های برگزاری جلسه‌ی آنلاین — گوگل‌میت، زوم، واتساپ، بله، تماس تلفنی.
//
// متخصص می‌تواند «چند روش» را هم‌زمان فعال کند (مثلا هم واتساپ هم تماس تلفنی)؛
// مراجع در زمان جلسه هرکدام را که خواست انتخاب می‌کند. پس ساختار داده یک لیست
// است، نه یک مقدار واحد.
//
// چرا ماژول جدا (و نه داخل lib/psy.ts): این‌جا هم سمت سرور (اعتبارسنجی) و هم
// سمت مرورگر (پنل متخصص و پنل مراجع) لازم است، ولی lib/psy.ts کلاینت supabase
// با کلید service-role را ایمپورت می‌کند و نباید وارد باندل مرورگر شود.
//
// href نهایی در لحظه‌ی نمایش ساخته می‌شود (meetHref) — نه ذخیره‌شده — تا تغییر
// روش یا شماره، بدون مهاجرت دیتا ممکن باشد.
// ─────────────────────────────────────────────────────────────────────────────

export type MeetMethod = 'google_meet' | 'zoom' | 'whatsapp' | 'bale' | 'phone'

export const MEET_METHODS: MeetMethod[] = ['google_meet', 'zoom', 'whatsapp', 'bale', 'phone']

// یک کانال فعال‌شده: روش + مقدارش (لینک یا شماره)
export type MeetChannel = { method: MeetMethod; value: string }

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
    action: 'گفت‌وگو در واتساپ',
    hint: 'شماره‌ی موبایل واتساپ خود را وارد کنید.',
    placeholder: '09123456789',
    kind: 'phone',
  },
  bale: {
    label: 'بله',
    action: 'گفت‌وگو در بله',
    hint: 'شماره‌ی موبایل حساب بله‌ی خود را وارد کنید (یا نشانی کامل پروفایل بله).',
    placeholder: '09123456789',
    kind: 'phone',
  },
  phone: {
    label: 'تماس تلفنی',
    action: 'تماس تلفنی',
    hint: 'شماره‌ای که در زمان جلسه با آن پاسخگو هستید.',
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

// اعتبارسنجی مقدار یک کانال — پیام خطای فارسی برمی‌گرداند یا null (یعنی معتبر)
export function validateMeetValue(method: MeetMethod, rawValue: string): string | null {
  const value = rawValue.trim()
  if (!value) return `مقدار ${MEET_META[method].label} را وارد کنید`
  const meta = MEET_META[method]
  if (meta.kind === 'url') {
    if (!/^https?:\/\//i.test(value)) return `نشانی ${meta.label} باید با http:// یا https:// شروع شود`
    return null
  }
  if (method === 'bale' && /^https?:\/\//i.test(value)) return null
  if (!normalizeIranPhone(value)) return `شماره‌ی موبایل ${meta.label} معتبر نیست (مثال: 09123456789)`
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

export function meetActionLabel(method: MeetMethod): string {
  return MEET_META[method]?.action || ''
}

// ── نرمال‌سازی لیست کانال‌ها ────────────────────────────────────────────────
// ورودی می‌تواند شکل تازه (آرایه) باشد یا میراث قدیمی (meet_link تنها، که همیشه
// گوگل‌میت بود). هر روش حداکثر یک بار؛ کانال بی‌مقدار حذف می‌شود.
export function mergeMeetChannels(raw: unknown, legacyMeetLink?: string | null): MeetChannel[] {
  const out: MeetChannel[] = []
  const seen = new Set<MeetMethod>()

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const method = (item as any)?.method
      const value = String((item as any)?.value ?? '').trim().slice(0, 300)
      if (!isMeetMethod(method) || !value || seen.has(method)) continue
      seen.add(method)
      out.push({ method, value })
    }
    return out
  }

  // میراث: قبل از پشتیبانی چندکاناله، فقط یک لینک گوگل‌میت ذخیره می‌شد
  const legacy = String(legacyMeetLink || '').trim().slice(0, 300)
  if (legacy) out.push({ method: 'google_meet', value: legacy })
  return out
}

// فقط کانال‌هایی که واقعا قابل استفاده‌اند (href می‌سازند) — همان چیزی که به
// مراجع نشان داده می‌شود
export function usableMeetChannels(channels: MeetChannel[] | null | undefined): { method: MeetMethod; href: string; action: string }[] {
  return (channels || [])
    .map(ch => {
      const href = meetHref(ch.method, ch.value)
      return href ? { method: ch.method, href, action: meetActionLabel(ch.method) } : null
    })
    .filter((x): x is { method: MeetMethod; href: string; action: string } => x !== null)
}
