// ─────────────────────────────────────────────────────────────────────────────
// احرازِ هویت — چهار نقش، چهار سازوکار، همه در یک‌جا (نه کپی در هر route؛
// درسِ حفره‌های isAuthed پراکنده در psych-booking)
//
// ۱) مراجع:   کوکیِ امضاشده با HMAC («phone.sig») پس از تاییدِ OTP
// ۲) متخصص (صاحبِ مجموعه): توکنِ نشستِ ذخیره‌شده در tenants.owner_session پس از OTP
// ۳) کارمند (یک «منبع»/پرسنل): توکنِ نشستِ ذخیره‌شده در resources.owner_session —
//    مستقل از صاحبِ مجموعه؛ برای مجموعه‌هایی با چند نفر پرسنل که هرکدام باید
//    فقط دیتای خودشان را ببینند (نه فقط روانشناسی؛ هر نیچی که چندکارمندی شد).
// ۴) سوپرادمین: کوکیِ رمزِ ثابت (SUPER_SECRET)
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac, timingSafeEqual, randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { sb } from './supabase'

const SECRET = () => process.env.AUTH_SECRET || 'dev-secret-change-me'

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

export function isSuperAuthed(req: NextRequest): boolean {
  const v = req.cookies.get(SUPER_COOKIE)?.value
  return !!v && !!process.env.SUPER_SECRET && safeEqual(v, process.env.SUPER_SECRET)
}

// ── OTP مشترک ────────────────────────────────────────────────────────────────

/** کدِ تازه می‌سازد و ذخیره می‌کند. تا اتصالِ ماژولِ پیامک، کد در پاسخ برمی‌گردد. */
export async function issueOtp(phone: string): Promise<string> {
  const code = Math.floor(1000 + Math.random() * 9000).toString()
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  await sb().from('otps').insert({ phone, code, expires_at })
  return code
}

/** کد را بررسی و در صورتِ صحت مصرف (حذف) می‌کند */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const { data } = await sb().from('otps').select('id, expires_at')
    .eq('phone', phone).eq('code', toEnDigits(code))
    .order('created_at', { ascending: false }).limit(1)
  const row = data?.[0]
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return false
  await sb().from('otps').delete().eq('phone', phone)
  return true
}

function toEnDigits(s: string): string {
  return String(s).replace(/[۰-۹]/g, ch => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
}

/** نرمال‌سازیِ شماره‌ی موبایل: ارقامِ فارسی، فاصله، +۹۸ → 09xxxxxxxxx */
export function normalizePhone(raw: string): string {
  let p = toEnDigits(String(raw || '')).replace(/[^0-9]/g, '')
  if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2)
  if (p.length === 10 && p.startsWith('9')) p = '0' + p
  return p
}
