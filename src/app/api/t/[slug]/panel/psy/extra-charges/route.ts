import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { recordLedgerEntry } from '@/lib/ledger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// شارژ اضافه — دکتر یک مبلغ دلخواه برای پرونده تعریف می‌کند («ارسال لینک
// پرداخت اضافه»)؛ در پنل مراجع (آنلاین یا کارت‌به‌کارت) قابل‌پرداخت می‌شود.
// برخلاف مصاحبه/ارزیابی/پروتکل، هیچ نوبتی به این گره نمی‌خورد — صرفا یک مبلغ
// قابل‌پرداخت است. تایید/رد کارت‌به‌کارت همین‌جا (از تب پرونده‌ی همین مراجع)
// انجام می‌شود، نه در صف عمومی «تأیید پرداخت‌ها» — چون این‌ها موردی و کم‌تکرارند.

// GET ?case_number=X → تاریخچه‌ی شارژهای اضافه‌ی یک پرونده
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const case_number = req.nextUrl.searchParams.get('case_number')
  if (!case_number) return NextResponse.json({ error: 'case_number لازم است' }, { status: 400 })
  let q = sb().from('psy_extra_charges').select('*').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
    .order('created_at', { ascending: false })
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data } = await q
  return NextResponse.json({ extra_charges: data || [] })
}

// POST → دکتر یک شارژ اضافه‌ی جدید برای پرونده می‌سازد
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()
  const case_number = String(body.case_number || '').trim()
  const title = String(body.title || '').trim().slice(0, 120)
  const amount = Math.round(Number(body.amount) || 0)
  if (!case_number) return NextResponse.json({ error: 'case_number لازم است' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'بابت چه چیزی؟ (توضیح لازم است)' }, { status: 400 })
  if (!(amount > 0)) return NextResponse.json({ error: 'مبلغ نامعتبر است' }, { status: 400 })

  let caseQ = sb().from('psy_cases').select('id, resource_id').eq('tenant_id', a.tenant.id).eq('case_number', case_number)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)
  const { data: c } = await caseQ.maybeSingle()
  if (!c) return NextResponse.json({ error: 'پرونده یافت نشد یا دسترسی ندارید' }, { status: 404 })

  const { data: charge, error } = await sb().from('psy_extra_charges').insert({
    tenant_id: a.tenant.id, resource_id: c.resource_id, case_number, title, amount,
    status: 'awaiting_payment',
  }).select().single()
  if (error || !charge) {
    console.error('panel/psy/extra-charges POST error:', error)
    return NextResponse.json({ error: 'مشکلی در ثبت شارژ اضافه پیش آمد.' }, { status: 500 })
  }
  return NextResponse.json({ success: true, extra_charge: charge })
}

// PATCH → تایید/رد پرداخت کارت‌به‌کارت
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  let q = sb().from('psy_extra_charges').select('*').eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data: charge } = await q.maybeSingle()
  if (!charge) return NextResponse.json({ error: 'یافت نشد یا دسترسی ندارید' }, { status: 404 })

  if (body.confirm_payment) {
    const { error } = await sb().from('psy_extra_charges')
      .update({ status: 'paid', payment_reject_reason: null }).eq('id', id).eq('tenant_id', a.tenant.id)
    if (error) { console.error('panel/psy/extra-charges PATCH error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد.' }, { status: 500 }) }
    await recordLedgerEntry({
      tenantId: a.tenant.id, resourceId: charge.resource_id || null, caseNumber: charge.case_number,
      purpose: 'extra_charge', method: 'card_to_card', amount: charge.amount,
      commissionAmount: 0, doctorAmount: charge.amount,
      sourceTable: 'psy_extra_charges', sourceId: charge.id, note: charge.title,
      recordedBy: a.isOwner ? 'owner' : 'staff',
    })
    return NextResponse.json({ success: true })
  }
  if (body.reject_payment) {
    const reason = body.reject_reason ? String(body.reject_reason).trim().slice(0, 300) : null
    const { error } = await sb().from('psy_extra_charges')
      .update({ status: 'awaiting_payment', payment_ref: null, payment_reject_reason: reason }).eq('id', id).eq('tenant_id', a.tenant.id)
    if (error) { console.error('panel/psy/extra-charges PATCH error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد.' }, { status: 500 }) }
    return NextResponse.json({ success: true })
  }
  return NextResponse.json({ error: 'چیزی برای بروزرسانی نیست' }, { status: 400 })
}

// DELETE → فقط اگر هنوز پرداخت نشده (شارژ اشتباهی)
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  let q = sb().from('psy_extra_charges').select('status').eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data: charge } = await q.maybeSingle()
  if (!charge) return NextResponse.json({ error: 'یافت نشد یا دسترسی ندارید' }, { status: 404 })
  if (charge.status === 'paid') return NextResponse.json({ error: 'شارژ پرداخت‌شده قابل حذف نیست' }, { status: 400 })

  const { error } = await sb().from('psy_extra_charges').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (error) { console.error('panel/psy/extra-charges DELETE error:', error); return NextResponse.json({ error: 'مشکلی در حذف پیش آمد.' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
