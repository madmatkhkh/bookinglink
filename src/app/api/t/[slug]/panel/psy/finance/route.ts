import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { getResourcePricing, packageAmount, DEFAULT_PRICING, Pricing } from '@/lib/psy'
import { gregorianToJalali } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// مبلغِ واقعی همیشه از رویِ ستونِ price ذخیره‌شده روی خودِ ردیف خوانده می‌شود (همان
// چیزی که واقعاً از دکتر/مراجع در آن لحظه‌ی خاص خواسته شده)؛ فقط برایِ ردیف‌هایِ
// خیلی قدیمی که price ذخیره‌شده صفر است (پیش از پیاده‌شدنِ قیمت‌گذاریِ per-resource)
// با قیمتِ فعلیِ همان دکتر بازمحاسبه می‌شود — تقریبی، نه قیمتِ واقعیِ آن زمان.
const sessPrice = (s: any, pricing: any) => s.price || (s.session_type === 'online' ? pricing.sessionOnline : pricing.sessionOffline)
const pkgTotal = (p: any, pricing: any) => p.price || packageAmount(p, pricing)

function jalaliMonthKey(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return `${j.year}/${String(j.month + 1).padStart(2, '0')}`
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const t = a.tenant
  // کارمند فقط گزارشِ مالیِ خودش را می‌بیند؛ owner می‌تواند با ?resource_id= فیلتر کند یا همه را ببیند
  const resourceFilter = a.isOwner ? req.nextUrl.searchParams.get('resource_id') : a.resourceId

  const from = req.nextUrl.searchParams.get('from')

  const to = req.nextUrl.searchParams.get('to')
  const fromT = from ? new Date(from).getTime() : null
  const toT = to ? new Date(to).getTime() : null
  const inRange = (iso?: string) => {
    if (fromT === null && toT === null) return true
    if (!iso) return false
    const ts = new Date(iso).getTime()
    if (isNaN(ts)) return false
    if (fromT !== null && ts < fromT) return false
    if (toT !== null && ts > toT) return false
    return true
  }

  let casesQ = sb().from('psy_cases').select('case_number, child_name').eq('tenant_id', t.id)
  let stagesQ = sb().from('psy_stages').select('*').eq('tenant_id', t.id)
  let pkgsQ = sb().from('psy_packages').select('*').eq('tenant_id', t.id)
  let sessQ = sb().from('psy_sessions').select('*').eq('tenant_id', t.id)
  if (resourceFilter) { stagesQ = stagesQ.eq('resource_id', resourceFilter); pkgsQ = pkgsQ.eq('resource_id', resourceFilter); sessQ = sessQ.eq('resource_id', resourceFilter) }
  const [{ data: cases }, { data: stages }, { data: packages }, { data: sessions }] = await Promise.all([casesQ, stagesQ, pkgsQ, sessQ])

  const St = (stages || []).filter(x => inRange(x.created_at))
  const P = (packages || []).filter(x => inRange(x.created_at))
  const S = (sessions || []).filter(x => inRange(x.created_at))

  // نگاشتِ قیمتِ فعلیِ هر resource — فقط به‌عنوانِ fallback برایِ ردیف‌هایِ خیلی
  // قدیمی که ستونِ price‌شان صفر مانده (پیش از قیمت‌گذاریِ per-resource)
  const resourceIds = Array.from(new Set([...P, ...S].map(x => x.resource_id).filter(Boolean)))
  const pricingEntries = await Promise.all(resourceIds.map(async id => [id, await getResourcePricing(id)] as [string, Pricing]))
  const pricingMap = new Map<string, Pricing>(pricingEntries)
  const pricingFor = (resourceId: string | null | undefined): Pricing => (resourceId && pricingMap.get(resourceId)) || DEFAULT_PRICING

  const paid = { interview: 0, assessment: 0, packages: 0, sessions: 0 }
  const paidCount = { interview: 0, assessment: 0, packages: 0, sessions: 0 }
  const pending = { interview: 0, assessment: 0, packages: 0, sessions: 0 }
  const pendingCount = { interview: 0, assessment: 0, packages: 0, sessions: 0 }
  const split = { online: 0, offline: 0 }
  const monthly: Record<string, number> = {}
  const addMonthly = (iso: string | undefined, amount: number) => {
    const k = jalaliMonthKey(iso); if (k) monthly[k] = (monthly[k] || 0) + amount
  }

  // مصاحبه/ارزیابی حالا از psy_stages می‌آید (هر مرحله یک ردیفِ مستقل، هر تعداد ممکن)
  for (const st of St) {
    const bucket = st.stage_type === 'assessment' ? 'assessment' : 'interview'
    if (st.paid) { paid[bucket] += st.price || 0; paidCount[bucket]++; addMonthly(st.created_at, st.price || 0) }
    else if (st.payment_submitted) { pending[bucket] += st.price || 0; pendingCount[bucket]++ }
  }
  for (const p of P) {
    const pricing = pricingFor(p.resource_id)
    const total = pkgTotal(p, pricing)
    if (p.paid) {
      paid.packages += total; paidCount.packages++; addMonthly(p.created_at, total)
      split.online += (p.child_sessions || 0) * (p.child_session_type === 'online' ? pricing.sessionOnline : 0)
        + (p.parent_sessions || 0) * (p.parent_session_type === 'online' ? pricing.sessionOnline : 0)
      split.offline += (p.child_sessions || 0) * (p.child_session_type !== 'online' ? pricing.sessionOffline : 0)
        + (p.parent_sessions || 0) * (p.parent_session_type !== 'online' ? pricing.sessionOffline : 0)
    } else if (p.payment_submitted) { pending.packages += total; pendingCount.packages++ }
  }
  for (const s of S) {
    const price = sessPrice(s, pricingFor(s.resource_id))
    if (s.paid) {
      paid.sessions += price; paidCount.sessions++; addMonthly(s.created_at, price)
      if (s.session_type === 'online') split.online += price; else split.offline += price
    } else if (s.payment_submitted) { pending.sessions += price; pendingCount.sessions++ }
  }

  const totalPaid = paid.interview + paid.assessment + paid.packages + paid.sessions
  const totalPending = pending.interview + pending.assessment + pending.packages + pending.sessions

  let refundsTotal = 0, refundsCount = 0
  for (const s of S) {
    if (s.paid && s.refund_percent && s.refund_percent > 0) {
      const full = sessPrice(s, pricingFor(s.resource_id))
      refundsTotal += Math.round(full * (100 - s.refund_percent) / 100)
      refundsCount++
    }
  }
  const netPaid = totalPaid - refundsTotal

  const monthlySorted = Object.entries(monthly).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-12)
    .map(([month, amount]) => ({ month, amount }))

  const perCase: Record<string, number> = {}
  const bump = (cn: string, amt: number) => { if (cn) perCase[cn] = (perCase[cn] || 0) + amt }
  for (const st of St) if (st.paid) bump(st.case_number, st.price || 0)
  for (const p of P) if (p.paid) bump(p.case_number, pkgTotal(p, pricingFor(p.resource_id)))
  for (const s of S) if (s.paid) bump(s.case_number, sessPrice(s, pricingFor(s.resource_id)))
  const nameByCase: Record<string, string> = {}
  for (const b of cases || []) if (b.case_number) nameByCase[b.case_number] = b.child_name || b.case_number
  const topCases = Object.entries(perCase).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([case_number, amount]) => ({ case_number, name: nameByCase[case_number] || case_number, amount }))

  return NextResponse.json({
    totalPaid, totalPending, refundsTotal, refundsCount, netPaid,
    paid, paidCount, pending, pendingCount, split, monthly: monthlySorted, topCases,
  }, { headers: NO_STORE })
}
