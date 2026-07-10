export const PERSIAN_MONTHS = [
  'فروردین','اردیبهشت','خرداد','تیر',
  'مرداد','شهریور','مهر','آبان',
  'آذر','دی','بهمن','اسفند'
]

export const PERSIAN_WEEKDAYS = ['ش','ی','د','س','چ','پ','ج']

// طبق تصمیم صریح صاحب پروژه: هیچ‌جای نوبت‌لینک رقم فارسی نمایش داده نمی‌شود —
// نه فقط در دیتابیس، در UI هم. این تابع (با همین نام، تا همه‌ی صداکننده‌هایش در
// کل پروژه بدون نیاز به تغییر تک‌تک‌شان درست شوند) دیگر تبدیل به رقم فارسی
// نمی‌کند؛ فقط رشته‌ی همان عدد لاتین را برمی‌گرداند.
export function toFarsiNum(n: number | string): string {
  return String(n)
}

export function getCurrentJalali(): { year: number; month: number; day: number } {
  const now = new Date()
  const gYear = now.getFullYear()
  const gMonth = now.getMonth() + 1
  const gDay = now.getDate()
  return gregorianToJalali(gYear, gMonth, gDay)
}

export function gregorianToJalali(gy: number, gm: number, gd: number) {
  const g_d_no = [31,28+((gy%4==0&&gy%100!=0)||(gy%400==0)?1:0),31,30,31,30,31,31,30,31,30,31]
  let jy = gy <= 1600 ? 0 : 979
  gy -= gy <= 1600 ? 621 : 1600
  let gy2 = gm > 2 ? gy + 1 : gy
  let g_day_no = 365*gy + Math.floor((gy2+3)/4) - Math.floor((gy2+99)/100) + Math.floor((gy2+399)/400)
  for(let i=0;i<gm-1;i++) g_day_no += g_d_no[i]
  g_day_no += gd - 1
  let j_day_no = g_day_no - 79
  let j_np = Math.floor(j_day_no/12053)
  j_day_no %= 12053
  jy += 33*j_np + 4*Math.floor(j_day_no/1461)
  j_day_no %= 1461
  if(j_day_no >= 366){jy += Math.floor((j_day_no-1)/365);j_day_no=(j_day_no-1)%365}
  let jm=0,jd=0
  const j_days_in_month=[31,31,31,31,31,31,30,30,30,30,30,29]
  for(let i=0;i<11&&j_day_no>=j_days_in_month[i];i++){j_day_no-=j_days_in_month[i];jm++}
  jd=j_day_no+1
  return {year:jy,month:jm,day:jd}
}

export function getDaysInJalaliMonth(year: number, month: number): number {
  if(month < 6) return 31
  if(month < 11) return 30
  return year % 4 === 3 ? 30 : 29
}

// ── اعداد فارسی → لاتین ──────────────────────────────────────────
export function toLatinNum(s: string | number): string {
  return String(s).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
}

// ── تبدیل دقیق شمسی به میلادی (الگوریتم jalaali) ─────────────────
function div(a: number, b: number) { return Math.trunc(a / b) }

function jalCal(jy: number) {
  const breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178]
  const bl = breaks.length
  const gy = jy + 621
  let leapJ = -14, jp = breaks[0], jm = 0, jump = 0, n: number, i: number
  for (i = 1; i < bl; i += 1) {
    jm = breaks[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ = leapJ + div(jump, 33) * 8 + div(jump % 33, 4)
    jp = jm
  }
  n = jy - jp
  leapJ = leapJ + div(n, 33) * 8 + div((n % 33) + 3, 4)
  if (jump % 33 === 4 && jump - n === 4) leapJ += 1
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG
  return { gy, march }
}

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(j % 1461, 4) * 5 + 308
  const gd = div(i % 153, 5) + 1
  const gm = (div(i, 153) % 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

export function jalaliToGregorian(jy: number, jm: number, jd: number) {
  const r = jalCal(jy)
  const jdn = g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1
  return d2g(jdn)
}

// ── زمان یک جلسه‌ی شمسی (به وقت ایران UTC+3:30) به‌صورت timestamp ──
export function jalaliDateTimeToTimestamp(dateStr: string, timeStr: string): number | null {
  if (!dateStr || !timeStr) return null
  const [jy, jm, jd] = toLatinNum(dateStr).split('/').map(Number)
  const [h, min] = toLatinNum(timeStr).split(':').map(Number)
  if ([jy, jm, jd].some(Number.isNaN)) return null
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd)
  // ایران UTC+3:30 (بدون ساعت تابستانی از 2022)
  return Date.UTC(gy, gm - 1, gd, h || 0, min || 0) - 3.5 * 3600 * 1000
}

// ── نام کوتاه روزهای هفته (الیاس برای خوانایی در تقویم‌ها) ─────────
export const PERSIAN_WEEKDAYS_SHORT = PERSIAN_WEEKDAYS
export const PERSIAN_WEEKDAYS_FULL = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه']

// ── روز هفته‌ی ایرانی برای تاریخ جلالی: 0=شنبه ... 6=جمعه ─────────
export function jalaliWeekday(jy: number, jm: number, jd: number): number {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd)
  const jsDay = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay() // 0=یکشنبه
  return (jsDay + 1) % 7
}

// ── کلید استاندارد تاریخ: 'YYYY/MM/DD' با ارقام لاتین و صفر پیشوند ──
// (صفر پیشوند = ترتیب الفبایی همان ترتیب زمانی است)
export function jalaliKey(y: number, m: number, d: number): string {
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`
}

// ── 'HH:MM' (فارسی یا لاتین) → دقیقه از نیمه‌شب؛ برای مقایسه و مرتب‌سازی ──
export function timeKey(t: string): number {
  const [h, m] = toLatinNum(t || '').split(':').map(x => parseInt(x, 10))
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
}

// ── دقیقه از نیمه‌شب → 'HH:MM' کانونیک (ارقام لاتین، دو رقمی) ──────
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
