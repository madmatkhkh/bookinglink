// ─────────────────────────────────────────────────────────────────────────────
// اطلاع‌رسانی نوبت — «نوبت شما قطعی شد» به مراجع و «نوبت جدید» به متخصص.
//
// تا امروز مراجع پول می‌داد، پرداخت موفق می‌شد و هیچ رسیدی نمی‌گرفت جز یک صفحه‌ی
// وب؛ متخصص هم فقط با باز کردن پنل خبردار می‌شد. این ماژول همان حفره را می‌بندد.
//
// ⚠️ قانون اصلی این فایل: هرگز throw نمی‌کند و هرگز مسیر پرداخت را نمی‌شکند.
// این تابع بعد از ثبت شدن پول و نوبت صدا زده می‌شود؛ اگر sms.ir قطع باشد یا
// شماره‌ای نباشد، فقط لاگ می‌شود. پیامک نرسیدن بد است، ولی صفحه‌ی خطا دادن به
// کسی که همین الان پول داده، خیلی بدتر است.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'
import {
  sendBookingConfirmSms, bookingConfirmSmsConfigured,
  sendNewBookingSms, newBookingSmsConfigured,
} from './sms'
import { getSmsAllowance, allocateCharge, logSmsSent, SmsCharge } from './smsQuota'

export type BookingNotifyInput = {
  tenantId: string
  plan?: string
  resourceId?: string | null
  caseNumber?: string | null
  date: string
  time: string
}

export async function notifyBookingConfirmed(input: BookingNotifyInput): Promise<void> {
  try {
    const { tenantId, resourceId, caseNumber, date, time } = input
    // بدون تاریخ/ساعت قطعی، پیام «نوبت شما قطعی شد» معنا ندارد (مثلا پرداخت
    // انجام شده ولی مراجع هنوز باید وقت انتخاب کند) — ساکت رد شو.
    if (!date || !time) return
    if (!bookingConfirmSmsConfigured() && !newBookingSmsConfigured()) return

    const db = sb()
    const [{ data: profile }, { data: tenant }, { data: kase }, { data: resource }] = await Promise.all([
      db.from('tenant_profiles').select('display_name').eq('tenant_id', tenantId).maybeSingle(),
      db.from('tenants').select('owner_phone').eq('id', tenantId).maybeSingle(),
      caseNumber
        ? db.from('psy_cases').select('client_name, contact_phone').eq('tenant_id', tenantId).eq('case_number', caseNumber).maybeSingle()
        : Promise.resolve({ data: null }),
      resourceId
        ? db.from('resources').select('phone').eq('id', resourceId).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const tenantName = profile?.display_name || 'نوبت‌لینک'
    const clientPhone = (kase as any)?.contact_phone || ''
    const clientName = (kase as any)?.client_name || 'مراجع'
    // درمانگرِ همان نوبت مقدم است؛ اگر شماره‌ای ندارد، صاحب مجموعه.
    const specialistPhone = (resource as any)?.phone || (tenant as any)?.owner_phone || ''

    // سهمیه: این پیام‌ها مثل یادآور «اختیاری» حساب می‌شوند و با اتمام
    // سهمیه+اعتبار ارسال نمی‌شوند. OTP همچنان تنها پیام هرگز-بلاک-نشدنی است.
    const al = await getSmsAllowance(tenantId, input.plan)
    const charges: SmsCharge[] = []

    if (clientPhone && bookingConfirmSmsConfigured() && (al.unlimited || al.remaining > 0)) {
      const r = await sendBookingConfirmSms(clientPhone, tenantName, date, time)
      if (r.ok) charges.push(allocateCharge(al))
      else console.error('notifyBookingConfirmed: client sms failed:', r.error)
    }

    if (specialistPhone && newBookingSmsConfigured() && (al.unlimited || al.remaining > 0)) {
      const r = await sendNewBookingSms(specialistPhone, clientName, date, time)
      if (r.ok) charges.push(allocateCharge(al))
      else console.error('notifyBookingConfirmed: specialist sms failed:', r.error)
    }

    if (charges.length) await logSmsSent(tenantId, 'booking', charges)
  } catch (e) {
    console.error('notifyBookingConfirmed exception:', e)
  }
}
