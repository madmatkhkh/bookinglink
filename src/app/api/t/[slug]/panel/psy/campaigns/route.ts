import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { sendFreeTextSms, freeTextSmsConfigured } from '@/lib/sms'
import { sendCampaignEmail, emailConfigured } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// تاریخچه‌ی کمپین‌های ارسال‌شده
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  let q = sb().from('psy_campaigns').select('*').eq('tenant_id', a.tenant.id).order('created_at', { ascending: false }).limit(30)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data } = await q
  return NextResponse.json({ campaigns: data || [] })
}

// segment: 'all' همه‌ی مراجعانِ با شماره/ایمیل، 'inactive_30'|'inactive_90' کسانی
// که آخرین جلسه‌شان (یا کلاً بدونِ جلسه) از این‌مدت گذشته — برایِ «بازگرداندنِ مراجع».
async function resolveRecipients(tenantId: string, resourceId: string | null, segment: string) {
  const db = sb()
  let caseQ = db.from('psy_cases').select('case_number, contact_phone, contact_email').eq('tenant_id', tenantId)
  if (resourceId) caseQ = caseQ.eq('resource_id', resourceId)
  const { data: cases } = await caseQ
  if (!cases?.length) return []
  if (segment === 'all') return cases

  const days = segment === 'inactive_90' ? 90 : 30
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const caseNumbers = cases.map(c => c.case_number)
  const [{ data: sessions }, { data: stages }] = await Promise.all([
    db.from('psy_sessions').select('case_number, session_date').eq('tenant_id', tenantId).in('case_number', caseNumbers).neq('session_date', ''),
    db.from('psy_stages').select('case_number, session_date').eq('tenant_id', tenantId).in('case_number', caseNumbers).neq('session_date', ''),
  ])
  // آخرین تاریخِ فعالیتِ هر پرونده (رشته‌ی جلالی؛ مقایسه‌ی رشته‌ای برایِ فرمتِ
  // پدینگ‌دارِ یکنواخت کافی است، ولی چون فرمت ممکن است پدینگ‌دار نباشد، از
  // timestamp واقعی استفاده می‌کنیم — نه مقایسه‌ی رشته‌ای)
  const { jalaliDateTimeToTimestamp } = await import('@/lib/calendar')
  const lastActivity = new Map<string, number>()
  for (const row of [...(sessions || []), ...(stages || [])]) {
    const ts = jalaliDateTimeToTimestamp(row.session_date, '00:00') || 0
    lastActivity.set(row.case_number, Math.max(lastActivity.get(row.case_number) || 0, ts))
  }
  return cases.filter(c => {
    const last = lastActivity.get(c.case_number)
    if (!last) return true // هیچ‌وقت جلسه‌ای نداشته = «غیرفعال» حساب می‌شود
    return last < cutoff.getTime()
  })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { channel, segment, message } = await req.json()
  if (!['sms', 'email'].includes(channel)) return NextResponse.json({ error: 'کانالِ نامعتبر' }, { status: 400 })
  if (!message?.trim()) return NextResponse.json({ error: 'متنِ پیام لازم است' }, { status: 400 })
  if (channel === 'sms' && !freeTextSmsConfigured())
    return NextResponse.json({ error: 'پیامکِ آزاد تنظیم نشده (SMS_IR_LINE_NUMBER را در env بگذار)' }, { status: 400 })
  if (channel === 'email' && !emailConfigured())
    return NextResponse.json({ error: 'ایمیل تنظیم نشده (RESEND_API_KEY را در env بگذار)' }, { status: 400 })

  const resourceId = a.isOwner ? null : a.resourceId
  const recipients = await resolveRecipients(a.tenant.id, resourceId, segment || 'all')

  let count = 0
  for (const r of recipients) {
    if (channel === 'sms' && r.contact_phone) {
      const res = await sendFreeTextSms(r.contact_phone, message.trim())
      if (res.ok) count++
    } else if (channel === 'email' && r.contact_email) {
      const res = await sendCampaignEmail(r.contact_email, `پیامی از طرفِ ${a.tenant.slug}`, message.trim())
      if (res.ok) count++
    }
  }

  await sb().from('psy_campaigns').insert({
    tenant_id: a.tenant.id, resource_id: resourceId, channel, segment: segment || 'all',
    message: message.trim(), recipient_count: count, sent_by: a.isOwner ? 'owner' : 'staff',
  })
  return NextResponse.json({ success: true, sent: count, attempted: recipients.length })
}
