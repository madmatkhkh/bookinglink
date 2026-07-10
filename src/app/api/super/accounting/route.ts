import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// دفتر حساب کامل پلتفرم + خلاصه‌ی «بر اساس متخصص» (هر متخصص چقدر گردش داشته،
// چقدرش سهم نوبت‌لینک بوده، چقدرش سهم خود متخصص). پلتفرم چندنیچی است (روانشناسی،
// سالن، ...) پس این‌جا از واژه‌ی خنثی «متخصص» استفاده می‌شود، نه واژه‌ای مثل «دکتر»
// که فقط مال یک نیچ است.
//
// پارامترها: ?tenant_id=&resource_id=&method=&purpose=&from=&to=&limit=
export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams
  const tenantId = q.get('tenant_id')
  const resourceId = q.get('resource_id')
  const method = q.get('method')
  const purpose = q.get('purpose')
  const from = q.get('from')
  const to = q.get('to')
  const limit = Math.min(2000, Number(q.get('limit')) || 500)

  function applyFilters<T>(query: T): T {
    let x: any = query
    if (tenantId) x = x.eq('tenant_id', tenantId)
    if (resourceId) x = x.eq('resource_id', resourceId)
    if (method) x = x.eq('method', method)
    if (purpose) x = x.eq('purpose', purpose)
    if (from) x = x.gte('created_at', from)
    if (to) x = x.lte('created_at', to)
    return x
  }

  const [{ data: entries }, { data: aggRows }] = await Promise.all([
    applyFilters(sb().from('ledger_entries').select('*').order('created_at', { ascending: false })).limit(limit),
    // ردیف سبک، بدون سقف نمایش — پایه‌ی محاسبه‌ی «بر اساس متخصص» تا با محدودیت
    // لیست نمایشی قاطی نشود و همیشه دقیق بماند
    applyFilters(sb().from('ledger_entries').select('resource_id, tenant_id, method, direction, amount, commission_amount, doctor_amount')),
  ])

  // نام‌های tenant و resource برای نمایش
  const [{ data: tenants }, { data: resources }, { data: profiles }] = await Promise.all([
    sb().from('tenants').select('id, slug, tenant_profiles(display_name)'),
    sb().from('resources').select('id, name'),
    sb().from('psy_resource_profiles').select('resource_id, settlement_sheba, settlement_sheba_holder_name'),
  ])
  const tenantName = new Map<string, { slug: string; name: string | null }>()
  for (const t of tenants || []) {
    const p = Array.isArray(t.tenant_profiles) ? t.tenant_profiles[0] : t.tenant_profiles
    tenantName.set(t.id, { slug: t.slug, name: (p as any)?.display_name || null })
  }
  const resourceName = new Map((resources || []).map(r => [r.id, r.name]))
  const shebaByResource = new Map((profiles || []).map(p => [p.resource_id, p]))

  const rows = (entries || []).map(e => {
    const tn = tenantName.get(e.tenant_id)
    return {
      ...e,
      tenant_slug: tn?.slug || null,
      tenant_name: tn?.name || null,
      resource_name: e.resource_id ? (resourceName.get(e.resource_id) || null) : null,
    }
  })

  // خلاصه‌ی کل فیلتر فعلی
  const totals = rows.reduce((acc, e) => {
    if (e.direction === 'outflow') { acc.refunds += e.amount; return acc }
    acc.gross += e.amount
    acc.commission += e.commission_amount || 0
    acc.doctorShare += e.doctor_amount || 0
    if (e.method === 'online') acc.online += e.amount; else acc.cardToCard += e.amount
    return acc
  }, { gross: 0, commission: 0, doctorShare: 0, online: 0, cardToCard: 0, refunds: 0 })

  // خلاصه‌ی «بر اساس متخصص» — هر متخصص چقدر گردش داشته/چقدرش سهم نوبت‌لینک/چقدرش سهم خودش
  const byResourceMap = new Map<string, {
    resource_id: string; tenant_id: string; gross: number; commission: number
    specialistShare: number; online: number; cardToCard: number; refunds: number; count: number
  }>()
  for (const e of aggRows || []) {
    if (!e.resource_id) continue
    if (!byResourceMap.has(e.resource_id)) {
      byResourceMap.set(e.resource_id, {
        resource_id: e.resource_id, tenant_id: e.tenant_id, gross: 0, commission: 0,
        specialistShare: 0, online: 0, cardToCard: 0, refunds: 0, count: 0,
      })
    }
    const agg = byResourceMap.get(e.resource_id)!
    if (e.direction === 'outflow') { agg.refunds += e.amount; continue }
    agg.gross += e.amount
    agg.commission += e.commission_amount || 0
    agg.specialistShare += e.doctor_amount || 0
    if (e.method === 'online') agg.online += e.amount; else agg.cardToCard += e.amount
    agg.count++
  }
  const byResource = Array.from(byResourceMap.values())
    .map(a => {
      const tn = tenantName.get(a.tenant_id)
      return {
        ...a,
        resource_name: resourceName.get(a.resource_id) || null,
        tenant_name: tn?.name || null,
        tenant_slug: tn?.slug || null,
      }
    })
    .sort((a, b) => b.gross - a.gross)

  return NextResponse.json({ entries: rows, totals, byResource, sheba: Object.fromEntries(shebaByResource) }, { headers: NO_STORE })
}
