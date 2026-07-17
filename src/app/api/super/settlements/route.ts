import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// وضعیت تسویه‌ی سهم متخصص‌ها از تراکنش‌های آنلاین.
//
// منطق: در پرداخت آنلاین کل پول اول به حساب پلتفرم می‌رود. سهم متخصص (doctor_amount)
// یا خودکار (تسهیم زیبال، split_applied=true) واریز شده، یا پلتفرم باید دستی
// واریز کند. «بدهی معوق» = مجموع سهم متخصص از تراکنش‌های آنلاینی که split نشده،
// منهای آنچه قبلا در settlements برایش ثبت تسویه شده.
export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: entries }, { data: settlements }, { data: settlementItems }, { data: resources }, { data: tenants }, { data: profiles }] = await Promise.all([
    sb().from('ledger_entries').select('id, tenant_id, resource_id, method, direction, doctor_amount, split_applied, case_number, bank_ref_number, created_at').eq('method', 'online'),
    sb().from('settlements').select('*').order('created_at', { ascending: false }),
    sb().from('settlement_items').select('ledger_entry_id'),
    sb().from('resources').select('id, name, tenant_id'),
    sb().from('tenants').select('id, slug, tenant_profiles(display_name)'),
    sb().from('psy_resource_profiles').select('resource_id, settlement_sheba, settlement_sheba_holder_name'),
  ])

  const tenantName = new Map<string, { slug: string; name: string | null }>()
  for (const t of tenants || []) {
    const p = Array.isArray(t.tenant_profiles) ? t.tenant_profiles[0] : t.tenant_profiles
    tenantName.set(t.id, { slug: t.slug, name: (p as any)?.display_name || null })
  }
  // مجموعه‌های تستی از تسویه هم کنار گذاشته می‌شوند (پرداختشان واقعی نبوده).
  const { data: testT } = await sb().from('tenants').select('id').eq('is_test', true)
  const testTenantIds = new Set((testT || []).map(t => t.id))
  const resourceInfo = new Map((resources || []).filter(r => !testTenantIds.has(r.tenant_id)).map(r => [r.id, r]))
  const shebaByResource = new Map((profiles || []).map(p => [p.resource_id, p]))
  // تراکنش‌هایی که قبلا در یک تسویه حساب شده‌اند — برای این‌که دوباره پیشنهاد نشوند
  const settledEntryIds = new Set((settlementItems || []).map(i => i.ledger_entry_id))

  // جمع سهم معوق (فقط split نشده و inflow) per-resource + لیست تراکنش‌های تسویه‌نشده
  const owedByResource = new Map<string, number>()
  const autoByResource = new Map<string, number>()
  const unsettledByResource = new Map<string, any[]>()
  for (const e of entries || []) {
    if (!e.resource_id || e.direction === 'outflow') continue
    if (testTenantIds.has(e.tenant_id)) continue  // مجموعه‌ی تستی → کنار
    if (e.split_applied) {
      autoByResource.set(e.resource_id, (autoByResource.get(e.resource_id) || 0) + (e.doctor_amount || 0))
    } else {
      owedByResource.set(e.resource_id, (owedByResource.get(e.resource_id) || 0) + (e.doctor_amount || 0))
      if (!settledEntryIds.has(e.id)) {
        const list = unsettledByResource.get(e.resource_id) || []
        list.push({ id: e.id, doctor_amount: e.doctor_amount || 0, case_number: e.case_number, bank_ref_number: e.bank_ref_number, created_at: e.created_at })
        unsettledByResource.set(e.resource_id, list)
      }
    }
  }
  // جمع تسویه‌های ثبت‌شده per-resource
  const settledByResource = new Map<string, number>()
  for (const s of settlements || []) {
    if (!s.resource_id) continue
    settledByResource.set(s.resource_id, (settledByResource.get(s.resource_id) || 0) + s.amount)
  }

  const resourceIds = Array.from(new Set<string>([...Array.from(owedByResource.keys()), ...Array.from(autoByResource.keys()), ...Array.from(settledByResource.keys())]))
  const summary = resourceIds.map(rid => {
    const r = resourceInfo.get(rid)
    const tn = r ? tenantName.get(r.tenant_id) : null
    const sheba = shebaByResource.get(rid) as any
    const owedGross = owedByResource.get(rid) || 0
    const settled = settledByResource.get(rid) || 0
    return {
      resource_id: rid,
      resource_name: r?.name || null,
      tenant_slug: tn?.slug || null,
      tenant_name: tn?.name || null,
      auto_settled: autoByResource.get(rid) || 0,   // خودکار توسط تسهیم زیبال
      owed_gross: owedGross,                         // کل سهم معوق دستی
      settled_manual: settled,                       // آنچه دستی تسویه شده
      outstanding: Math.max(0, owedGross - settled), // باقی بدهی واقعی
      unsettled_items: unsettledByResource.get(rid) || [], // تراکنش‌های تسویه‌نشده
      settlement_sheba: sheba?.settlement_sheba || null,
      settlement_holder: sheba?.settlement_sheba_holder_name || null,
    }
  }).filter(s => s.owed_gross > 0 || s.settled_manual > 0 || s.auto_settled > 0)
    .sort((a, b) => b.outstanding - a.outstanding)

  const settlementRows = (settlements || []).map(s => {
    const r = resourceInfo.get(s.resource_id)
    const tn = r ? tenantName.get(r.tenant_id) : null
    return { ...s, resource_name: r?.name || null, tenant_slug: tn?.slug || null }
  })

  return NextResponse.json({ summary, settlements: settlementRows }, { headers: NO_STORE })
}

// ثبت تسویه: {resource_id, amount?, reference?, note?, bank_ref_number?, paid_at?, entry_ids?[]}
// اگر entry_ids داده شود، تسویه به همان تراکنش‌ها لینک می‌شود و مبلغ از جمع
// آن‌ها گرفته می‌شود (تا همیشه دقیق باشد). tenant_id از خود resource.
export async function POST(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.resource_id) return NextResponse.json({ error: 'resource_id لازم است' }, { status: 400 })

  const { data: resource } = await sb().from('resources').select('tenant_id').eq('id', b.resource_id).maybeSingle()
  if (!resource) return NextResponse.json({ error: 'منبع یافت نشد' }, { status: 404 })

  const entryIds: string[] = Array.isArray(b.entry_ids) ? b.entry_ids.filter((x: any) => typeof x === 'string') : []

  // اگر تراکنش‌های مشخص انتخاب شده‌اند، مبلغ را از خودشان می‌گیریم (نه از ورودی
  // دستی) تا مبلغ تسویه همیشه دقیقا برابر جمع سهم آن تراکنش‌ها باشد.
  let coveredItems: { id: string; doctor_amount: number }[] = []
  if (entryIds.length) {
    const { data: rows } = await sb().from('ledger_entries')
      .select('id, doctor_amount, resource_id, method, direction')
      .in('id', entryIds).eq('resource_id', b.resource_id).eq('method', 'online').eq('direction', 'inflow')
    coveredItems = (rows || []).map(r => ({ id: r.id, doctor_amount: r.doctor_amount || 0 }))
    if (!coveredItems.length) return NextResponse.json({ error: 'تراکنش معتبری برای تسویه یافت نشد' }, { status: 400 })
    // جلوگیری از تسویه‌ی دوباره‌ی همان تراکنش (unique روی settlement_items هم پشتیبان است)
    const { data: already } = await sb().from('settlement_items').select('ledger_entry_id').in('ledger_entry_id', coveredItems.map(i => i.id))
    if (already && already.length) return NextResponse.json({ error: 'برخی از این تراکنش‌ها قبلا تسویه شده‌اند' }, { status: 409 })
  }

  const amount = coveredItems.length
    ? coveredItems.reduce((s, i) => s + i.doctor_amount, 0)
    : Math.round(Number(b.amount) || 0)
  if (amount <= 0) return NextResponse.json({ error: 'مبلغ تسویه نامعتبر است' }, { status: 400 })

  const { data: settlement, error } = await sb().from('settlements').insert({
    tenant_id: resource.tenant_id, resource_id: b.resource_id, amount,
    method: 'manual',
    reference: b.reference ? String(b.reference).slice(0, 100) : null,
    bank_ref_number: b.bank_ref_number ? String(b.bank_ref_number).slice(0, 100) : null,
    paid_at: b.paid_at ? new Date(b.paid_at).toISOString() : new Date().toISOString(),
    status: 'paid',
    note: b.note ? String(b.note).slice(0, 500) : null, recorded_by: 'super',
  }).select().single()
  if (error || !settlement) {
    console.error('super/settlements POST error:', error)
    return NextResponse.json({ error: 'ثبت تسویه ناموفق بود', detail: `${error?.code || ''} ${error?.message || ''}`.trim() }, { status: 500 })
  }

  // لینک تراکنش‌ها به این تسویه
  if (coveredItems.length) {
    const { error: itemsErr } = await sb().from('settlement_items').insert(
      coveredItems.map(i => ({ settlement_id: settlement.id, ledger_entry_id: i.id, doctor_amount: i.doctor_amount }))
    )
    if (itemsErr) {
      // تسویه ثبت شد ولی لینک نخورد — لاگ کن (unique راهزنی همزمان را می‌گیرد)
      console.error('super/settlements items insert error:', itemsErr)
    }
  }
  return NextResponse.json({ success: true })
}
