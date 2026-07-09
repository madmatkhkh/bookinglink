import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { getResourcePricing, packageAmount, redeemDiscountCodeByCode } from '@/lib/psy'
import { recordLedgerEntry } from '@/lib/ledger'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const q = req.nextUrl.searchParams
  if (q.get('pending')) {
    let query = sb().from('psy_packages').select('*').eq('tenant_id', a.tenant.id)
      .eq('payment_submitted', true).eq('paid', false).order('created_at', { ascending: false })
    if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
    const { data } = await query
    return NextResponse.json({ packages: data || [] })
  }
  const case_number = q.get('case_number')
  let query = sb().from('psy_packages').select('*')
    .eq('tenant_id', a.tenant.id).eq('case_number', case_number).order('created_at', { ascending: false })
  if (!a.isOwner) query = query.eq('resource_id', a.resourceId)
  const { data } = await query
  return NextResponse.json({ packages: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()

  // پکیج هم resource_id را از پرونده‌ی صاحبش به ارث می‌برد
  let caseQ = sb().from('psy_cases').select('resource_id').eq('tenant_id', a.tenant.id).eq('case_number', body.case_number)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)
  const { data: parentCase } = await caseQ.maybeSingle()
  if (!parentCase) return NextResponse.json({ error: 'پرونده یافت نشد یا دسترسی ندارید' }, { status: 404 })

  const { resource_id: _ignored, price: _ignoredPrice, ...rest } = body
  const pricing = await getResourcePricing(parentCase.resource_id)
  const price = packageAmount(rest, pricing)
  const { data } = await sb().from('psy_packages')
    .insert([{ ...rest, price, tenant_id: a.tenant.id, resource_id: parentCase.resource_id }]).select().single()
  return NextResponse.json({ package: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id, resource_id: _ignored, price: _ignoredPrice, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  // وضعیتِ فعلی را قبل از آپدیت می‌خوانیم تا «گذار به paid» را تشخیص دهیم (نه هر آپدیتِ paid)
  const { data: before } = await sb().from('psy_packages').select('*').eq('id', id).eq('tenant_id', a.tenant.id).maybeSingle()

  // اگر ترکیبِ جلسات عوض شده، قیمت هم دوباره از رویِ تنظیماتِ همان دکتر محاسبه می‌شود
  // (کلاینت هرگز مستقیم قیمت را تعیین نمی‌کند — طبقِ همان قاعده‌ی POST).
  const compositionKeys = ['primary_sessions', 'primary_session_type', 'secondary_sessions', 'secondary_session_type']
  if (compositionKeys.some(k => k in updates) && before) {
    const merged = { ...before, ...updates }
    updates.price = packageAmount(merged, await getResourcePricing(before.resource_id))
  }

  let q = sb().from('psy_packages').update(updates).eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data, error } = await q.select().single()
  if (error) { console.error('src/app/api/t/[slug]/panel/psy/packages/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }

  // گذار به paid → ثبت در دفترِ حساب (کارت‌به‌کارت؛ آنلاین از callback ثبت می‌شود
  // که این ردیف idempotent است پس تداخل ندارد). فقط وقتی قبلاً paid نبوده.
  if (updates.paid === true && before && !before.paid && data) {
    const freshEntry = await recordLedgerEntry({
      tenantId: a.tenant.id,
      resourceId: data.resource_id || null,
      caseNumber: data.case_number,
      purpose: 'package',
      method: 'card_to_card',
      amount: data.price || 0,
      commissionAmount: 0,
      doctorAmount: data.price || 0,
      sourceTable: 'psy_packages',
      sourceId: data.id,
      recordedBy: a.isOwner ? 'owner' : 'staff',
    })
    // مصرفِ کدِ تخفیفِ کارت‌به‌کارت فقط لحظه‌ی تاییدِ واقعی — و فقط یک بار (گیت روی ثبتِ تازه‌ی ledger)
    if (freshEntry && data.discount_code && data.resource_id)
      await redeemDiscountCodeByCode(data.resource_id, data.discount_code)
  }
  return NextResponse.json({ package: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { id } = await req.json()
  let q = sb().from('psy_packages').delete().eq('id', id).eq('tenant_id', a.tenant.id)
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  await q
  return NextResponse.json({ success: true })
}
