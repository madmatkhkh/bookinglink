import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { STAGE_TYPES, STAGE_STATUS } from '@/lib/flow'
import { getResourcePricing, resolvePrice } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// GET ?case_number=X → درخواست‌های یک پرونده
// GET ?pending=true  → همه‌ی درخواست‌های در انتظار (برای بج و لیست تأیید)
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const q = req.nextUrl.searchParams
  const case_number = q.get('case_number')
  const pendingOnly = q.get('pending') === 'true'

  let query = sb().from('psy_appointment_requests').select('*').eq('tenant_id', a.tenant.id)
  if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
  if (case_number) query = query.eq('case_number', case_number)
  if (pendingOnly) query = query.eq('status', 'pending')
  query = query.order('created_at', { ascending: false })
  const { data } = await query

  // برای لیست در انتظار، نام مراجع را هم ضمیمه کن تا دکتر بداند کیست.
  let withNames = data || []
  if (pendingOnly && withNames.length) {
    const caseNumbers = Array.from(new Set(withNames.map(r => r.case_number)))
    const { data: cases } = await sb().from('psy_cases')
      .select('case_number, client_name').eq('tenant_id', a.tenant.id).in('case_number', caseNumbers)
    const nameByCase = new Map((cases || []).map(c => [c.case_number, c.client_name]))
    withNames = withNames.map(r => ({ ...r, client_name: nameByCase.get(r.case_number) || r.case_number }))
  }
  return NextResponse.json({ requests: withNames }, { headers: NO_STORE })
}

// PATCH { id, action: 'approve'|'reject', stage_type?, price?, reject_reason? }
// approve → یک مرحله‌ی جدید می‌سازد (همان فلوی stages) و درخواست را approved می‌کند.
// reject  → درخواست را رد می‌کند با دلیل اختیاری.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const b = await req.json().catch(() => ({}))
  const id = String(b.id || '')
  const action = String(b.action || '')
  if (!id || !['approve', 'reject'].includes(action))
    return NextResponse.json({ error: 'درخواست نامعتبر است' }, { status: 400 })

  let reqQ = sb().from('psy_appointment_requests').select('*').eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) reqQ = reqQ.eq('resource_id', a.resourceId)
  const { data: request } = await reqQ.maybeSingle()
  if (!request) return NextResponse.json({ error: 'درخواست یافت نشد یا دسترسی ندارید' }, { status: 404 })
  if (request.status !== 'pending') return NextResponse.json({ error: 'این درخواست قبلا بررسی شده است' }, { status: 400 })

  if (action === 'reject') {
    const reason = b.reject_reason ? String(b.reject_reason).trim().slice(0, 300) : null
    await sb().from('psy_appointment_requests')
      .update({ status: 'rejected', reject_reason: reason, resolved_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ success: true })
  }

  // approve — یک مرحله می‌سازد. نوع پیش‌فرض: مصاحبه (interview)، مگر دکتر چیز دیگری بدهد.
  const stage_type = (STAGE_TYPES as readonly string[]).includes(b.stage_type) ? b.stage_type : 'interview'
  const title = String(b.title || '').trim().slice(0, 60)
  if (stage_type === 'custom' && !title)
    return NextResponse.json({ error: 'برای جلسه‌ی دلخواه، عنوان لازم است' }, { status: 400 })

  const { data: c } = await sb().from('psy_cases')
    .select('id, resource_id, current_stage_id, session_type')
    .eq('tenant_id', a.tenant.id).eq('case_number', request.case_number).maybeSingle()
  if (!c) return NextResponse.json({ error: 'پرونده یافت نشد' }, { status: 404 })
  if (c.current_stage_id) return NextResponse.json({ error: 'این پرونده الان یک مرحله‌ی باز دارد' }, { status: 400 })

  const price = typeof b.price === 'number' && b.price >= 0
    ? b.price
    : resolvePrice(c.session_type, await getResourcePricing(c.resource_id))

  const { data: stage, error } = await sb().from('psy_stages').insert({
    tenant_id: a.tenant.id, resource_id: c.resource_id, case_number: request.case_number, stage_type,
    title: stage_type === 'custom' ? title : null,
    price, status: STAGE_STATUS.AWAITING_PAYMENT,
  }).select().single()
  if (error || !stage) {
    console.error('appointment-request approve → stage error:', error)
    return NextResponse.json({ error: 'ساخت مرحله ناموفق بود' }, { status: 500 })
  }
  await sb().from('psy_cases').update({ current_stage_id: stage.id }).eq('id', c.id)
  await sb().from('psy_appointment_requests')
    .update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ success: true, stage })
}
