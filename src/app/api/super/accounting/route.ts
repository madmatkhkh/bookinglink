import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// دفترِ حسابِ کاملِ پلتفرم + وضعیتِ تسویه‌ی سهمِ دکترها.
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

  let ledgerQ = sb().from('ledger_entries').select('*').order('created_at', { ascending: false }).limit(limit)
  if (tenantId) ledgerQ = ledgerQ.eq('tenant_id', tenantId)
  if (resourceId) ledgerQ = ledgerQ.eq('resource_id', resourceId)
  if (method) ledgerQ = ledgerQ.eq('method', method)
  if (purpose) ledgerQ = ledgerQ.eq('purpose', purpose)
  if (from) ledgerQ = ledgerQ.gte('created_at', from)
  if (to) ledgerQ = ledgerQ.lte('created_at', to)
  const { data: entries } = await ledgerQ

  // نام‌هایِ tenant و resource برایِ نمایش
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

  // خلاصه‌ی کلِ فیلترِ فعلی
  const totals = rows.reduce((acc, e) => {
    if (e.direction === 'outflow') { acc.refunds += e.amount; return acc }
    acc.gross += e.amount
    acc.commission += e.commission_amount || 0
    acc.doctorShare += e.doctor_amount || 0
    if (e.method === 'online') acc.online += e.amount; else acc.cardToCard += e.amount
    return acc
  }, { gross: 0, commission: 0, doctorShare: 0, online: 0, cardToCard: 0, refunds: 0 })

  return NextResponse.json({ entries: rows, totals, sheba: Object.fromEntries(shebaByResource) }, { headers: NO_STORE })
}
