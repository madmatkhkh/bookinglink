// ─────────────────────────────────────────────────────────────────────────────
// احرازِ هویت — چهار نقش، چهار سازوکار، همه در یک‌جا (نه کپی در هر route؛
// درسِ حفره‌های isAuthed پراکنده در psych-booking)
//
// 1) مراجع:   کوکیِ امضاشده با HMAC («phone.sig») پس از تاییدِ OTP
// 2) متخصص (صاحبِ مجموعه): توکنِ نشستِ ذخیره‌شده در tenants.owner_session پس از OTP
// 3) کارمند (یک «منبع»/پرسنل): توکنِ نشستِ ذخیره‌شده در resources.owner_session —
//    مستقل از صاحبِ مجموعه؛ برای مجموعه‌هایی با چند نفر پرسنل که هرکدام باید
//    فقط دیتای خودشان را ببینند (نه فقط روانشناسی؛ هر نیچی که چندکارمندی شد).
// 4) سوپرادمین: توکنِ امضاشده‌ی موقت (نه خودِ رمز) پس از واردکردنِ SUPER_SECRET
//
// سخت‌سازی‌های امنیتی (این نسخه):
// - AUTH_SECRET دیگر fallback ندارد — اگر ست نشده باشد، با خطای روشن fail می‌شود
//   (fallbackِ عمومیِ داخلِ سورس یعنی کوکیِ قابلِ‌جعل برای هرکسی که کد را دیده).
// - کدِ OTP پنج‌رقمی شد (100هزار حالت به‌جای 10هزار).
// - rate limit دیتابیس‌محور (جدولِ auth_throttle — چون serverless هستیم و
//   حافظه‌ی داخلی بینِ نمونه‌ها مشترک نیست): هم صدورِ OTP هم تلاش‌های تایید.
// - کوکیِ سوپرادمین دیگر خودِ SUPER_SECRET نیست — یک توکنِ امضاشده‌ی 7روزه است؛
//   با عوض‌کردنِ هرکدام از SUPER_SECRET/AUTH_SECRET همه‌ی نشست‌ها باطل می‌شوند.
// - کد فقط وقتی در پاسخِ HTTP برمی‌گردد که OTP_ECHO_CODE=true باشد (حالتِ
//   موقتِ پیش‌ازپیامک). با اتصالِ پنلِ پیامک این env حذف می‌شود.
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac, timingSafeEqual, randomUUID, randomInt } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sb } from './supabase'
import { sendOtpSms, smsConfigured } from './sms'

function SECRET(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET تنظیم نشده — بدونِ آن هیچ کوکی‌ای امن نیست. آن را در env ست کن.')
  return s
}

export const CLIENT_COOKIE = 'client_auth'
export const PANEL_COOKIE = 'panel_auth'
export const STAFF_COOKIE = 'staff_auth'
export const SUPER_COOKIE = 'super_auth'

function sign(value: string): string {
  return createHmac('sha256', SECRET()).update(value).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

// ── rate limiting (دیتابیس‌محور) ─────────────────────────────────────────────
// شمارشِ رخدادهای اخیرِ یک «کلید» در جدولِ auth_throttle. اگر از سقف رد شده،
// false برمی‌گرداند (و رخدادِ تازه ثبت نمی‌کند)؛ وگرنه رخداد را ثبت می‌کند.
// پاکسازیِ ردیف‌های کهنه‌ی همان کلید هم همین‌جا انجام می‌شود (fire-and-forget).

export async function checkThrottle(key: string, max: number, windowSec: number): Promise<boolean> {
  const db = sb()
  const since = new Date(Date.now() - windowSec * 1000).toISOString()
  const { count, error } = await db.from('auth_throttle')
    .select('id', { count: 'exact', head: true })
    .eq('key', key).gte('created_at', since)
  // اگر خودِ جدول در دسترس نبود (مثلاً migration هنوز اجرا نشده)، ورود را
  // نمی‌بندیم ولی سمتِ سرور لاگ می‌کنیم — امنیت نباید کلِ سیستم را قفل کند.
  if (error) { console.error('auth_throttle error (آیا migration 0008 اجرا شده؟):', error); return true }
  if ((count || 0) >= max) return false
  await db.from('auth_throttle').insert({ key })
  // پاکسازیِ کهنه‌ها (بدونِ await — نتیجه مهم نیست)
  db.from('auth_throttle').delete().eq('key', key).lt('created_at', since).then(() => {}, () => {})
  return true
}

/** IPِ درخواست برای کلیدهای throttle (پشتِ Vercel از x-forwarded-for) */
export function requestIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
}

// ── مراجع ────────────────────────────────────────────────────────────────────

/** پس از تاییدِ OTP: کوکیِ امضاشده‌ی شماره را روی پاسخ می‌نشاند */
export function setClientCookie(res: NextResponse, phone: string) {
  res.cookies.set(CLIENT_COOKIE, `${phone}.${sign(phone)}`, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 90,
  })
}

/** شماره‌ی تاییدشده‌ی مراجع از کوکی؛ در صورتِ دستکاری null */
export function getClientPhone(req: NextRequest): string | null {
  const raw = req.cookies.get(CLIENT_COOKIE)?.value
  if (!raw) return null
  const i = raw.lastIndexOf('.')
  if (i <= 0) return null
  const phone = raw.slice(0, i), sig = raw.slice(i + 1)
  return safeEqual(sign(phone), sig) ? phone : null
}

// ── مجوزِ پرداختِ محدود به یک پرونده (فلوِ مصاحبه‌ی اولیه) ─────────────────────
// مراجعِ تازه هنوز OTP نزده (پیامک هم که وصل نیست)، ولی باید بلافاصله بعد از
// ثبتِ فرم، هزینه‌ی مصاحبه‌ی *همان* پرونده‌ای که خودش ساخت را پرداخت کند.
// به‌جای برگشتن به authِ «دانستنِ شماره‌کیس+شماره‌تلفن» (که حفره بود)، خودِ
// /psy/book موقعِ ساختِ پرونده یک کوکیِ امضاشده‌ی محدود می‌نشاند: فقط برای
// «ثبتِ پرداختِ» همان یک پرونده معتبر است (نه خواندنِ هیچ دیتایی) و 2 ساعته
// منقضی می‌شود. جعلش بدونِ AUTH_SECRET ممکن نیست.

export const PAY_COOKIE = 'case_pay'

export function setPayCookie(res: NextResponse, caseNumber: string) {
  res.cookies.set(PAY_COOKIE, `${caseNumber}.${sign(`pay.${caseNumber}`)}`, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 2,
  })
}

/** شماره‌کیسِ دارای مجوزِ پرداخت از کوکی؛ در صورتِ دستکاری null */
export function getPayCase(req: NextRequest): string | null {
  const raw = req.cookies.get(PAY_COOKIE)?.value
  if (!raw) return null
  const i = raw.lastIndexOf('.')
  if (i <= 0) return null
  const caseNumber = raw.slice(0, i), sig = raw.slice(i + 1)
  return safeEqual(sign(`pay.${caseNumber}`), sig) ? caseNumber : null
}

// ── متخصص (پنل) ──────────────────────────────────────────────────────────────

/** ورودِ موفق: توکنِ نشستِ تازه می‌سازد، در دیتابیس می‌نشاند و کوکی می‌دهد */
export async function createPanelSession(res: NextResponse, tenantId: string) {
  const token = randomUUID()
  await sb().from('tenants').update({ owner_session: token }).eq('id', tenantId)
  res.cookies.set(PANEL_COOKIE, `${tenantId}.${token}`, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 30,
  })
}

/** اگر کوکیِ پنل با نشستِ ذخیره‌شده‌ی همین tenant بخواند، شناسه‌اش را برمی‌گرداند */
export async function getPanelTenantId(req: NextRequest, expectedTenantId: string): Promise<string | null> {
  const raw = req.cookies.get(PANEL_COOKIE)?.value
  if (!raw) return null
  const i = raw.indexOf('.')
  if (i <= 0) return null
  const tenantId = raw.slice(0, i), token = raw.slice(i + 1)
  if (tenantId !== expectedTenantId || !token) return null
  const { data } = await sb().from('tenants').select('owner_session').eq('id', tenantId).single()
  return data?.owner_session && safeEqual(data.owner_session, token) ? tenantId : null
}

// ── کارمند (نشستِ مستقلِ هر «منبع») ───────────────────────────────────────────
// همان الگوی createPanelSession/getPanelTenantId، ولی روی resources به‌جای
// tenants — چون در یک مجموعه ممکن است چند نفر هم‌زمان با شماره‌های خودشان
// وارد شوند. کوکی هم tenantId هم resourceId را حمل می‌کند.

/** ورودِ موفقِ کارمند: توکنِ نشستِ تازه روی همان resource می‌نشیند */
export async function createStaffSession(res: NextResponse, tenantId: string, resourceId: string) {
  const token = randomUUID()
  await sb().from('resources').update({ owner_session: token }).eq('id', resourceId)
  res.cookies.set(STAFF_COOKIE, `${tenantId}.${resourceId}.${token}`, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 24 * 30,
  })
}

/** اگر کوکیِ کارمند معتبر و مالِ همین tenant باشد، شناسه‌ی resource را برمی‌گرداند */
export async function getStaffResourceId(req: NextRequest, expectedTenantId: string): Promise<string | null> {
  const raw = req.cookies.get(STAFF_COOKIE)?.value
  if (!raw) return null
  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const [tenantId, resourceId, token] = parts
  if (tenantId !== expectedTenantId || !resourceId || !token) return null
  const { data } = await sb().from('resources').select('owner_session, is_active')
    .eq('id', resourceId).eq('tenant_id', tenantId).maybeSingle()
  if (!data || !data.is_active) return null
  return data.owner_session && safeEqual(data.owner_session, token) ? resourceId : null
}

/** خروج: نشستِ فعال (owner یا کارمند، هرکدام معتبر بود) را در دیتابیس باطل و کوکی را پاک می‌کند */
export async function clearPanelSession(req: NextRequest, res: NextResponse, tenantId: string) {
  const ownerId = await getPanelTenantId(req, tenantId)
  if (ownerId) await sb().from('tenants').update({ owner_session: null }).eq('id', tenantId)
  const resourceId = await getStaffResourceId(req, tenantId)
  if (resourceId) await sb().from('resources').update({ owner_session: null }).eq('id', resourceId)
  res.cookies.set(PANEL_COOKIE, '', { path: '/', maxAge: 0 })
  res.cookies.set(STAFF_COOKIE, '', { path: '/', maxAge: 0 })
}

// ── سوپرادمین ────────────────────────────────────────────────────────────────
// کوکی دیگر خودِ SUPER_SECRET نیست — یک توکنِ «super.<زمانِ‌صدور>.<امضا>» است.
// امضا هم AUTH_SECRET هم SUPER_SECRET را در بر می‌گیرد؛ عوض‌کردنِ هرکدام
// همه‌ی نشست‌های فعال را باطل می‌کند. عمرِ توکن 7 روز است.

const SUPER_TTL_MS = 7 * 24 * 60 * 60 * 1000

function superSig(issuedAt: string): string {
  return sign(`super.${issuedAt}.${process.env.SUPER_SECRET || ''}`)
}

/** پس از واردکردنِ درستِ SUPER_SECRET: توکنِ نشستِ امضاشده روی پاسخ می‌نشیند */
export function createSuperSession(res: NextResponse) {
  const issuedAt = String(Date.now())
  res.cookies.set(SUPER_COOKIE, `${issuedAt}.${superSig(issuedAt)}`, {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: SUPER_TTL_MS / 1000,
  })
}

export function isSuperAuthed(req: NextRequest): boolean {
  if (!process.env.SUPER_SECRET) return false
  const raw = req.cookies.get(SUPER_COOKIE)?.value
  if (!raw) return false
  const i = raw.indexOf('.')
  if (i <= 0) return false
  const issuedAt = raw.slice(0, i), sig = raw.slice(i + 1)
  const ts = Number(issuedAt)
  if (!Number.isFinite(ts) || Date.now() - ts > SUPER_TTL_MS) return false
  return safeEqual(superSig(issuedAt), sig)
}

// ── توکنِ یک‌بارمصرفِ impersonate (ضدِ CSRF) ─────────────────────────────────
// روتِ impersonate عمداً GET است (تحویلِ کوکی + ریدایرکت در یک پاسخ)، ولی کوکیِ
// sameSite=lax روی ناوبریِ GET سطحِ‌بالا ارسال می‌شود — یعنی یک سایتِ مخرب
// می‌توانست سوپرادمینِ لاگین‌شده را با یک لینک وادار به impersonate کند. راه‌حل
// بدونِ شکستنِ الگویِ GET: لینک فقط با یک توکنِ امضاشده‌ی کوتاه‌عمر (۱۰ دقیقه)
// معتبر است که فقط از پاسخِ APIِ احرازشده‌ی /api/super/tenants/[id] صادر می‌شود —
// چیزی که سایتِ مهاجم به آن دسترسی ندارد.

const IMPERSONATE_TTL_MS = 10 * 60 * 1000

export function signImpersonateToken(tenantId: string): string {
  const exp = String(Date.now() + IMPERSONATE_TTL_MS)
  return `${exp}.${sign(`impersonate.${tenantId}.${exp}`)}`
}

export function verifyImpersonateToken(tenantId: string, token: string | null): boolean {
  if (!token) return false
  const i = token.indexOf('.')
  if (i <= 0) return false
  const exp = token.slice(0, i), sig = token.slice(i + 1)
  const ts = Number(exp)
  if (!Number.isFinite(ts) || Date.now() > ts) return false
  return safeEqual(sign(`impersonate.${tenantId}.${exp}`), sig)
}

// ── OTP مشترک ────────────────────────────────────────────────────────────────

export type IssueOtpResult = { ok: true; code: string } | { ok: false; throttled: true } | { ok: false; smsError: string }
export type VerifyOtpResult = 'ok' | 'bad' | 'throttled'

/** آیا کد باید در پاسخِ HTTP برگردد؟ فقط در حالتِ موقتِ پیش‌ازپیامک — و فقط اگر
 * پیامکِ واقعی هنوز تنظیم نشده باشد (وگرنه حتی با OTP_ECHO_CODE=true فراموش‌شده
 * در env، کدِ محرمانه در پاسخِ HTTP لو نمی‌رود). */
export function otpEchoEnabled(): boolean {
  if (smsConfigured()) return false
  return process.env.OTP_ECHO_CODE === 'true'
}

/**
 * کدِ تازه (5 رقمی) می‌سازد و ذخیره می‌کند.
 * rate limit: حداکثر 3 صدور برای هر شماره و 10 صدور برای هر IP در هر 10 دقیقه —
 * هم ضدِ brute force هم (بعد از اتصالِ پیامک) ضدِ سوزاندنِ اعتبارِ پیامکی (SMS bombing).
 */
export async function issueOtp(phone: string, ip?: string): Promise<IssueOtpResult> {
  if (!(await checkThrottle(`otp:issue:${phone}`, 3, 600))) return { ok: false, throttled: true }
  if (ip && !(await checkThrottle(`otp:issue:ip:${ip}`, 10, 600))) return { ok: false, throttled: true }
  const code = String(randomInt(10000, 100000)) // 5 رقم، از CSPRNG نه Math.random
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  await sb().from('otps').insert({ phone, code, expires_at })
  // اگر پیامکِ واقعی تنظیم شده (SMS_IR_API_KEY/SMS_IR_TEMPLATE_ID)، همین‌جا ارسال کن.
  // اگر ارسال شکست خورد، کد را از دیتابیس پاک می‌کنیم — چون کدی که به دستِ کاربر
  // نمی‌رسد نباید معتبر بماند (هم گیج‌کننده هم یک OTPِ یتیم در دیتابیس).
  if (smsConfigured()) {
    const sent = await sendOtpSms(phone, code)
    if (!sent.ok) {
      await sb().from('otps').delete().eq('phone', phone).eq('code', code)
      return { ok: false, smsError: sent.error }
    }
  }
  return { ok: true, code }
}

/**
 * کد را بررسی و در صورتِ صحت مصرف (حذف) می‌کند.
 * rate limit: حداکثر 5 تلاشِ تایید برای هر شماره در هر 10 دقیقه — با کدِ 5رقمی
 * یعنی brute force عملاً ناممکن.
 */
export async function verifyOtp(phone: string, code: string): Promise<VerifyOtpResult> {
  if (!(await checkThrottle(`otp:verify:${phone}`, 5, 600))) return 'throttled'
  const { data } = await sb().from('otps').select('id, expires_at')
    .eq('phone', phone).eq('code', toEnDigits(code))
    .order('created_at', { ascending: false }).limit(1)
  const row = data?.[0]
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return 'bad'
  await sb().from('otps').delete().eq('phone', phone)
  return 'ok'
}

export const OTP_THROTTLED_MSG = 'تعدادِ تلاش‌ها زیاد شده — چند دقیقه صبر کن و دوباره امتحان کن'

function toEnDigits(s: string): string {
  return String(s).replace(/[۰-۹]/g, ch => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
}

/** نرمال‌سازیِ شماره‌ی موبایل: ارقامِ فارسی، فاصله، +98 → 09xxxxxxxxx */
export function normalizePhone(raw: string): string {
  let p = toEnDigits(String(raw || '')).replace(/[^0-9]/g, '')
  if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2)
  if (p.length === 10 && p.startsWith('9')) p = '0' + p
  return p
}
