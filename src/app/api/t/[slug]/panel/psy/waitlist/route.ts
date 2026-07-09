import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { sendFreeTextSms, freeTextSmsConfigured } from '@/lib/sms'
import { sendCampaignEmail, emailConfigured } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  let q = sb().from('psy_waitlist').select('*').eq('tenant_id', a.tenant.id).eq('status', 'pending').order('created_at', { ascending: true })
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data } = await q
  // اسمِ مراجع برایِ نمایش (join دستی، چون waitlist فقط case_number دارد)
  const caseNumbers = Array.from(new Set((data || []).map(w => w.case_number)))
  const { data: cases } = caseNumbers.length
    ? await sb().from('psy_cases').select('case_number, client_name').eq('tenant_id', a.tenant.id).in('case_number', caseNumbers)
    : { data: [] as { case_number: string; client_name: string }[] }
  const nameByCase = new Map((cases || []).map(c => [c.case_number, c.client_name]))
  const rows = (data || []).map(w => ({ ...w, client_name: nameByCase.get(w.case_number) || '' }))
  return NextResponse.json({ waitlist: rows })
}

// اطلاع‌رسانی به یک نفرِ لیستِ انتظار — پیامک/ایمیلِ آزاد (نه خودکار، دکتر خودش
// تصمیم می‌گیرد کِی و برایِ کدام ساعتِ تازه‌آزادشده این را بزند)
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id, message } = await req.json()
  if (!id || !message?.trim()) return NextResponse.json({ error: 'پیام لازم است' }, { status: 400 })

  let q = sb().from('psy_waitlist').select('*').eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data: entry } = await q.maybeSingle()
  if (!entry) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  let sent = false
  if (entry.contact_phone && freeTextSmsConfigured()) {
    const r = await sendFreeTextSms(entry.contact_phone, message.trim())
    sent = sent || r.ok
  }
  if (entry.contact_email && emailConfigured()) {
    const r = await sendCampaignEmail(entry.contact_email, 'ظرفیتِ تازه برایِ نوبت', message.trim())
    sent = sent || r.ok
  }
  await sb().from('psy_waitlist').update({ status: 'notified' }).eq('id', id)
  return NextResponse.json({ success: true, sent })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id } = await req.json()
  let q = sb().from('psy_waitlist').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { error } = await q
  if (error) return NextResponse.json({ error: 'حذف نشد' }, { status: 500 })
  return NextResponse.json({ success: true })
}
