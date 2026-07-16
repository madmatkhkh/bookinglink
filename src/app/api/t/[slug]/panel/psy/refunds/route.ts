import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { recordLedgerEntry } from '@/lib/ledger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// بازپرداخت دستی — برای وقتی دکتر (نه به‌خاطر کنسلی نوبت که مسیر جداگانه‌ی
// خودش را دارد، بلکه به هر دلیل دیگری) مبلغی به مراجع برمی‌گرداند. این یک
// عمل قطعی و همان لحظه است، نه چیزی که مراجع تایید/پرداخت کند — پس ثبتش هم در
// psy_refunds هم بلافاصله در ledger_entries (outflow) می‌نشیند.

// GET ?case_number=X → تاریخچه‌ی بازپرداخت‌های یک پرونده
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const case_number = req.nextUrl.searchParams.get('case_number')
  if (!case_number) return NextResponse.json({ error: 'case_number لازم است' }, { status: 400 })
  let q = sb().from('psy_refunds').select('*').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
    .order('created_at', { ascending: false })
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data } = await q
  return NextResponse.json({ refunds: data || [] })
}

// POST → ثبت یک بازپرداخت تازه (قطعی، همان لحظه)
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()
  const case_number = String(body.case_number || '').trim()
  const amount = Math.round(Number(body.amount) || 0)
  const note = body.note ? String(body.note).trim().slice(0, 300) : null
  const bankRef = String(body.bank_ref_number || '').trim().slice(0, 100)
  if (!case_number) return NextResponse.json({ error: 'case_number لازم است' }, { status: 400 })
  if (!(amount > 0)) return NextResponse.json({ error: 'مبلغ نامعتبر است' }, { status: 400 })
  // شماره پیگیری بانکی اجباری است — مراجع باید بتواند واریز را در سیستم بانکی پیگیری کند.
  if (!bankRef) return NextResponse.json({ error: 'شماره پیگیری بانکی الزامی است' }, { status: 400 })

  let caseQ = sb().from('psy_cases').select('id, resource_id').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)
  const { data: c } = await caseQ.maybeSingle()
  if (!c) return NextResponse.json({ error: 'پرونده یافت نشد یا دسترسی ندارید' }, { status: 404 })

  const recordedBy = a.isOwner ? 'owner' : 'staff'
  const { data: refund, error } = await sb().from('psy_refunds').insert({
    tenant_id: a.tenant.id, resource_id: c.resource_id, case_number, amount, note, bank_ref_number: bankRef, recorded_by: recordedBy,
  }).select().single()
  if (error || !refund) {
    console.error('panel/psy/refunds POST error:', error)
    return NextResponse.json({ error: 'مشکلی در ثبت بازپرداخت پیش آمد.' }, { status: 500 })
  }
  await recordLedgerEntry({
    tenantId: a.tenant.id, resourceId: c.resource_id || null, caseNumber: case_number,
    purpose: 'refund', method: 'card_to_card', direction: 'outflow', amount,
    commissionAmount: 0, doctorAmount: amount,
    sourceTable: 'psy_refunds', sourceId: refund.id, note: note || undefined,
    bankRefNumber: bankRef,
    recordedBy,
  })
  return NextResponse.json({ success: true, refund })
}
