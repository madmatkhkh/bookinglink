import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { sendReminderSms, reminderSmsConfigured, sendFreeTextSms, freeTextSmsConfigured } from '@/lib/sms'
import { getApprovedReminderTemplates, renderTemplate } from '@/lib/smsTemplates'
import { getSmsAllowance, allocateCharge, logSmsSent, SmsAllowance, SmsCharge } from '@/lib/smsQuota'
import { gregorianToJalali, jalaliKey, PERSIAN_MONTHS } from '@/lib/calendar'

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

function tomorrowJalali(): { padded: string; unpadded: string; display: string } {
  // «فردا» به وقت ایران (UTC+3:30)
  const iranNow = new Date(Date.now() + 3.5 * 3600 * 1000)
  const t = new Date(iranNow.getTime() + 24 * 3600 * 1000)
  const j = gregorianToJalali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
  // ⚠️ قرارداد کدبیس: gregorianToJalali ماه 0-indexed برمی‌گرداند (همه‌ی
  // صداکننده‌ها +1 می‌کنند) — این‌جا هم همان.
  const month = j.month + 1
  return {
    padded: jalaliKey(j.year, month, j.day),
    unpadded: `${j.year}/${month}/${j.day}`,
    display: `${j.day} ${PERSIAN_MONTHS[month - 1]}`,
  }
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

  const { padded, unpadded, display } = tomorrowJalali()
  const dates = padded === unpadded ? [padded] : [padded, unpadded]
  const db = sb()

  // نام نمایشی هر tenant برای متن پیامک (یک بار برای همه)
  const { data: profiles } = await db.from('tenant_profiles').select('tenant_id, display_name')
  const tenantName = new Map((profiles || []).map(p => [p.tenant_id, p.display_name || 'نوبت‌لینک']))
  const nameOf = (tid: string) => tenantName.get(tid) || 'نوبت‌لینک'

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
  const deliverReminder = async (tid: string, phone: string, time: string) => {
    const body = customBodies.get(tid)
    if (body && canSendCustom)
      return sendFreeTextSms(phone, renderTemplate(body, { name: nameOf(tid), date: display, time }))
    if (!reminderSmsConfigured()) return { ok: false as const, error: 'الگوی ثابت تنظیم نشده' }
    return sendReminderSms(phone, nameOf(tid), display, time)
  }

  // ۱) جلسات درمان روانشناسی
  const { data: sessions } = await db.from('psy_sessions')
    .select('id, tenant_id, case_number, session_time')
    .in('session_date', dates).eq('status', 'confirmed').eq('paid', true).eq('reminder_sent', false)
    .limit(500)
  for (const s of sessions || []) {
    const { data: c } = await db.from('psy_cases').select('contact_phone')
      .eq('tenant_id', s.tenant_id).eq('case_number', s.case_number).maybeSingle()
    if (!c?.contact_phone) continue
    const al = await canSend(s.tenant_id)
    if (!al) continue
    const r = await deliverReminder(s.tenant_id, c.contact_phone, s.session_time)
    if (r.ok) { sent++; noteSent(s.tenant_id, al); await db.from('psy_sessions').update({ reminder_sent: true }).eq('id', s.id) }
    else failed++
  }

  // ۲) مراحل مصاحبه/ارزیابی زمان‌بندی‌شده
  const { data: stages } = await db.from('psy_stages')
    .select('id, tenant_id, case_number, session_time')
    .in('session_date', dates).eq('status', 'booked').eq('reminder_sent', false)
    .limit(500)
  for (const s of stages || []) {
    const { data: c } = await db.from('psy_cases').select('contact_phone')
      .eq('tenant_id', s.tenant_id).eq('case_number', s.case_number).maybeSingle()
    if (!c?.contact_phone) continue
    const al = await canSend(s.tenant_id)
    if (!al) continue
    const r = await deliverReminder(s.tenant_id, c.contact_phone, s.session_time)
    if (r.ok) { sent++; noteSent(s.tenant_id, al); await db.from('psy_stages').update({ reminder_sent: true }).eq('id', s.id) }
    else failed++
  }

  // ۳) رزروهای نیچ عمومی
  const { data: bookings } = await db.from('bookings')
    .select('id, tenant_id, client_phone, booking_time')
    .in('booking_date', dates).eq('status', 'confirmed').eq('reminder_sent', false)
    .limit(500)
  for (const b of bookings || []) {
    if (!b.client_phone) continue
    const al = await canSend(b.tenant_id)
    if (!al) continue
    const r = await deliverReminder(b.tenant_id, b.client_phone, b.booking_time)
    if (r.ok) { sent++; noteSent(b.tenant_id, al); await db.from('bookings').update({ reminder_sent: true }).eq('id', b.id) }
    else failed++
  }

  const logJobs: Promise<void>[] = []
  chargesByTenant.forEach((charges, tid) => { logJobs.push(logSmsSent(tid, 'reminder', charges)) })
  await Promise.all(logJobs)

  return NextResponse.json({ success: true, date: padded, sent, failed, skipped_quota: skippedQuota })
}
