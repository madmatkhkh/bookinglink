import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getClientPhone, matchesClientIdentity } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const case_number = req.nextUrl.searchParams.get('case_number')
  // auth با کوکی امضاشده‌ی OTP — نه شماره‌ای که کلاینت خودش در query می‌فرستد؛
  // وگرنه هرکس شماره‌کیس + شماره‌تلفن یک مراجع را «بداند» کل پرونده را می‌خواند.
  const phone = getClientPhone(req)
  if (!phone) return NextResponse.json({ error: 'ابتدا با کد یک‌بارمصرف وارد شوید' }, { status: 401 })
  if (!case_number) return NextResponse.json({ error: 'ناقص' }, { status: 400 })

  const { data: booking } = await sb().from('psy_cases').select('*')
    .eq('tenant_id', t.id).eq('case_number', case_number).single()
  if (!booking || !matchesClientIdentity(booking, phone))
    return NextResponse.json({ error: 'دسترسی ندارید' }, { status: 403 })

  const [{ data: packages }, { data: sessions }, { data: stages }, { data: extraCharges }, { data: refunds }, { data: apptRequests }, { data: ledger }, { data: messages }] = await Promise.all([
    sb().from('psy_packages').select('*').eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: false }),
    sb().from('psy_sessions').select('*').eq('tenant_id', t.id).eq('case_number', case_number).order('session_date', { ascending: true }),
    sb().from('psy_stages').select('*').eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: true }),
    sb().from('psy_extra_charges').select('*').eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: false }),
    // بازپرداخت‌های دستی — فقط فیلدهایی که مراجع باید ببیند (مبلغ، شماره پیگیری، تاریخ)
    sb().from('psy_refunds').select('id, amount, note, bank_ref_number, created_at').eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: false }),
    sb().from('psy_appointment_requests').select('id, note, status, reject_reason, created_at').eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: false }),
    // دفتر حساب — فقط فیلدهای ایمن برای مراجع (نه کمیسیون/سهم متخصص/تسهیم). منبع
    // واحد «تمام پرداخت‌ها و بازپرداخت‌ها» در تب پرداخت‌های پنل مراجع.
    sb().from('ledger_entries').select('id, purpose, method, direction, amount, bank_ref_number, note, created_at').eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: false }),
    // پیام‌های متخصص برای مراجع (دارو/تجویز/توصیه/عمومی)
    sb().from('psy_patient_messages').select('id, kind, body, created_at').eq('tenant_id', t.id).eq('case_number', case_number).order('created_at', { ascending: false }),
  ])
  return NextResponse.json({ booking, packages: packages || [], sessions: sessions || [], stages: stages || [], extra_charges: extraCharges || [], refunds: refunds || [], appointment_requests: apptRequests || [], ledger: ledger || [], messages: messages || [] })
}
