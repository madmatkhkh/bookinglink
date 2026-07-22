import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { sendReminderSms, reminderSmsConfigured, sendFreeTextSms, freeTextSmsConfigured } from '@/lib/sms'
import { getApprovedReminderTemplates, renderTemplate } from '@/lib/smsTemplates'
import { getSmsAllowance, allocateCharge, logSmsSent, SmsAllowance, SmsCharge } from '@/lib/smsQuota'
import { gregorianToJalali, jalaliKey, PERSIAN_MONTHS, jalaliDateTimeToTimestamp } from '@/lib/calendar'

// پیش‌فرض وقتی مجموعه چیزی تنظیم نکرده یا migration 0053 هنوز اجرا نشده
const DEFAULT_LEAD_HOURS = 24

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// یادآوری پیامکی خودکار — چیزی که لندینگ قولش را می‌داد ولی وجود نداشت.
//
// هر روز (vercel.json → crons، ساعت ۱۸ به وقت ایران) اجرا می‌شود:
//   ۱) نوبت‌های «فردا» را در سه جدول پیدا می‌کند:
//        psy_sessions (جلسات confirmed و زمان‌بندی‌شده)
//        psy_stages   (مصاحبه/ارزیابی booked)
//        bookings     (نیچ عمومی، confirmed)
//   ۲) به شماره‌ی مراجع پیامک یادآوری (الگوی SMS_IR_REMINDER_TEMPLATE_ID) می‌فرستد
//   ۳) reminder_sent=true می‌کند (migration 0019) تا اجرای دوباره پیام تکراری نفرستد
//
// امنیت: فقط با Authorization: Bearer <CRON_SECRET> اجرا می‌شود — Vercel Cron
// اگر env با نام CRON_SECRET تعریف شده باشد، همین هدر را خودش می‌فرستد؛ یعنی
// هیچ‌کس دیگری نمی‌تواند با صدازدن دستی این URL اعتبار پیامکی را بسوزاند.
//
// تاریخ‌ها در دیتابیس ممکن است با یا بدون صفر پیشوند ذخیره شده باشند
// ('1405/04/05' یا '1405/4/5') — هر دو شکل کوئری می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

// پنجره‌ی جست‌وجو: امروز تا دو روز بعد. چون فاصله‌ی یادآوری هر مجموعه تا 48
// ساعت قابل تنظیم است، نوبتی که باید همین ساعت پیامک شود می‌تواند تا پس‌فردا
// باشد. عمدا با تاریخ دقیق کوئری می‌زنیم (نه بازه‌ی رشته‌ای) چون تاریخ‌های
// جلالی در دیتابیس ممکن است با یا بدون صفر پیشوند ذخیره شده باشند و مقایسه‌ی
// رشته‌ای روی آن‌ها قابل‌اعتماد نیست. فیلتر دقیق زمانی در JS انجام می‌شود.
// سقف lead برابر 48 ساعت است (قید migration 0053)، پس 3 روز تقویمی کافی است.
const WINDOW_DAYS = 3

function jalaliOfOffset(dayOffset: number): { padded: string; unpadded: string; display: string } {
  const iranNow = new Date(Date.now() + 3.5 * 3600 * 1000)
  const t = new Date(iranNow.getTime() + dayOffset * 24 * 3600 * 1000)
  const j = gregorianToJalali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
  // ⚠️ قرارداد کدبیس: gregorianToJalali ماه 0-indexed برمی‌گرداند
  const month = j.month + 1
  return {
    padded: jalaliKey(j.year, month, j.day),
    unpadded: `${j.year}/${month}/${j.day}`,
    display: `${j.day} ${PERSIAN_MONTHS[month - 1]}`,
  }
}

/** همه‌ی رشته‌های تاریخ پنجره (هر دو شکل پدینگ‌دار و بدون) + نقشه‌ی نمایش */
function reminderWindow(): { dates: string[]; displayOf: (d: string) => string } {
  const dates: string[] = []
  const display = new Map<string, string>()
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const j = jalaliOfOffset(i)
    for (const form of [j.padded, j.unpadded]) {
      if (!display.has(form)) { dates.push(form); display.set(form, j.display) }
    }
  }
  return { dates, displayOf: (d: string) => display.get(d) || d }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // دو مسیر ارسال داریم و هرکدام env خودش را دارد؛ اگر هیچ‌کدام تنظیم نباشد
  // اصلا کاری نیست. (الگوی ثابت = SMS_IR_REMINDER_TEMPLATE_ID، متن سفارشی =
  // SMS_IR_LINE_NUMBER.)
  if (!reminderSmsConfigured() && !freeTextSmsConfigured())
    return NextResponse.json({ skipped: true, reason: 'هیچ مسیر ارسال یادآوری تنظیم نشده' })

  const { dates, displayOf } = reminderWindow()
  const db = sb()
  const now = Date.now()

  // نام نمایشی و فاصله‌ی یادآوری هر tenant (یک کوئری برای همه).
  // reminder_lead_hours قبل از migration 0053 وجود ندارد → کوئری خطا می‌دهد و
  // به کوئری بدون آن برمی‌گردیم؛ همه روی پیش‌فرض 24 ساعت می‌مانند.
  let profiles: any[] | null = null
  const withLead = await db.from('tenant_profiles').select('tenant_id, display_name, reminder_lead_hours')
  if (withLead.error) {
    const fallback = await db.from('tenant_profiles').select('tenant_id, display_name')
    profiles = fallback.data
  } else profiles = withLead.data

  const tenantName = new Map((profiles || []).map(p => [p.tenant_id, p.display_name || 'نوبت‌لینک']))
  const nameOf = (tid: string) => tenantName.get(tid) || 'نوبت‌لینک'
  const leadHours = new Map((profiles || []).map(p => [p.tenant_id, Number(p.reminder_lead_hours) || DEFAULT_LEAD_HOURS]))

  // آیا همین حالا وقت یادآوری این نوبت است؟
  //   • قبل از پنجره  → نه، اجرای بعدی cron
  //   • بعد از خود نوبت → نه، دیگر یادآوری نیست
  // پیام در نخستین اجرای cron که داخل پنجره بیفتد می‌رود — یعنی حداکثر lead
  // ساعت قبل، نه دقیقا lead ساعت قبل. اگر یک اجرا از دست برود، اجرای بعدی
  // همچنان می‌گیردش (شرط «<= lead» است نه یک باند باریک).
  const isDue = (tid: string, dateStr: string, timeStr: string): boolean => {
    const ts = jalaliDateTimeToTimestamp(dateStr, timeStr)
    if (!ts) return false
    const lead = leadHours.get(tid) ?? DEFAULT_LEAD_HOURS
    return now >= ts - lead * 3600 * 1000 && now < ts
  }

  let sent = 0, failed = 0, skippedQuota = 0

  // فاز P3: یادآور «اختیاری» است — به‌ازای هر tenant یک بار allowance خوانده و
  // در حلقه به‌صورت محلی کم می‌شود؛ tenantی که سهمیه+اعتبارش تمام شده skip.
  // ارسال موفق در sms_log ثبت می‌شود (batch در پایان، per-tenant).
  const alCache = new Map<string, SmsAllowance>()
  const chargesByTenant = new Map<string, SmsCharge[]>()
  const canSend = async (tid: string): Promise<SmsAllowance | null> => {
    let al = alCache.get(tid)
    if (!al) { al = await getSmsAllowance(tid); alCache.set(tid, al) }
    if (!al.unlimited && al.remaining <= 0) { skippedQuota++; return null }
    return al
  }
  const noteSent = (tid: string, al: SmsAllowance) => {
    const list = chargesByTenant.get(tid) || []
    list.push(allocateCharge(al))
    chargesByTenant.set(tid, list)
  }

  // متن سفارشی تاییدشده‌ی هر tenant (migration 0052) — یک کوئری برای همه.
  // خالی‌بودن نقشه یعنی هیچ‌کس متن تاییدشده ندارد و همه روی الگوی ثابت می‌مانند.
  const customBodies = await getApprovedReminderTemplates()
  const canSendCustom = freeTextSmsConfigured()

  // انتخاب مسیر ارسال برای یک یادآوری:
  //   متن تاییدشده + خط اختصاصی تنظیم‌شده → send/bulk با متن خود tenant
  //   وگرنه                              → همان الگوی ثابت قبلی (رفتار قدیمی)
  // اگر tenantی متن تاییدشده دارد ولی خط تنظیم نیست، سکوت نمی‌کنیم و به الگوی
  // ثابت برمی‌گردیم — یادآوری نرفتن بدتر از یادآوری با متن پیش‌فرض است.
  const deliverReminder = async (tid: string, phone: string, dateStr: string, time: string) => {
    const display = displayOf(dateStr)
    const body = customBodies.get(tid)
    if (body && canSendCustom)
      return sendFreeTextSms(phone, renderTemplate(body, { name: nameOf(tid), date: display, time }))
    if (!reminderSmsConfigured()) return { ok: false as const, error: 'الگوی ثابت تنظیم نشده' }
    return sendReminderSms(phone, nameOf(tid), display, time)
  }

  // ۱) جلسات درمان روانشناسی
  const { data: sessions } = await db.from('psy_sessions')
    .select('id, tenant_id, case_number, session_date, session_time')
    .in('session_date', dates).eq('status', 'confirmed').eq('paid', true).eq('reminder_sent', false)
    .limit(500)
  for (const s of sessions || []) {
    if (!isDue(s.tenant_id, s.session_date, s.session_time)) continue
    const { data: c } = await db.from('psy_cases').select('contact_phone')
      .eq('tenant_id', s.tenant_id).eq('case_number', s.case_number).maybeSingle()
    if (!c?.contact_phone) continue
    const al = await canSend(s.tenant_id)
    if (!al) continue
    const r = await deliverReminder(s.tenant_id, c.contact_phone, s.session_date, s.session_time)
    if (r.ok) { sent++; noteSent(s.tenant_id, al); await db.from('psy_sessions').update({ reminder_sent: true }).eq('id', s.id) }
    else failed++
  }

  // ۲) مراحل مصاحبه/ارزیابی زمان‌بندی‌شده
  const { data: stages } = await db.from('psy_stages')
    .select('id, tenant_id, case_number, session_date, session_time')
    .in('session_date', dates).eq('status', 'booked').eq('reminder_sent', false)
    .limit(500)
  for (const s of stages || []) {
    if (!isDue(s.tenant_id, s.session_date, s.session_time)) continue
    const { data: c } = await db.from('psy_cases').select('contact_phone')
      .eq('tenant_id', s.tenant_id).eq('case_number', s.case_number).maybeSingle()
    if (!c?.contact_phone) continue
    const al = await canSend(s.tenant_id)
    if (!al) continue
    const r = await deliverReminder(s.tenant_id, c.contact_phone, s.session_date, s.session_time)
    if (r.ok) { sent++; noteSent(s.tenant_id, al); await db.from('psy_stages').update({ reminder_sent: true }).eq('id', s.id) }
    else failed++
  }

  // ۳) رزروهای نیچ عمومی
  const { data: bookings } = await db.from('bookings')
    .select('id, tenant_id, client_phone, booking_date, booking_time')
    .in('booking_date', dates).eq('status', 'confirmed').eq('reminder_sent', false)
    .limit(500)
  for (const b of bookings || []) {
    if (!b.client_phone) continue
    if (!isDue(b.tenant_id, b.booking_date, b.booking_time)) continue
    const al = await canSend(b.tenant_id)
    if (!al) continue
    const r = await deliverReminder(b.tenant_id, b.client_phone, b.booking_date, b.booking_time)
    if (r.ok) { sent++; noteSent(b.tenant_id, al); await db.from('bookings').update({ reminder_sent: true }).eq('id', b.id) }
    else failed++
  }

  const logJobs: Promise<void>[] = []
  chargesByTenant.forEach((charges, tid) => { logJobs.push(logSmsSent(tid, 'reminder', charges)) })
  await Promise.all(logJobs)

  return NextResponse.json({ success: true, window: dates, sent, failed, skipped_quota: skippedQuota })
}
