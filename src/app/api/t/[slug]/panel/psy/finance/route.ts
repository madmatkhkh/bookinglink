import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { PSY_PRICING } from '@/lib/psy'
import { FLOW } from '@/lib/flow'
import { gregorianToJalali } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

const sessPrice = (t: string) => (t === 'online' ? PSY_PRICING.sessionOnline : PSY_PRICING.sessionOffline)
const pkgTotal = (p: any) =>
  (p.child_sessions || 0) * (p.child_session_type === 'online' ? PSY_PRICING.sessionOnline : PSY_PRICING.sessionOffline) +
  (p.parent_sessions || 0) * (p.parent_session_type === 'online' ? PSY_PRICING.sessionOnline : PSY_PRICING.sessionOffline)

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

  let casesQ = sb().from('psy_cases').select('*').eq('tenant_id', t.id)
  let pkgsQ = sb().from('psy_packages').select('*').eq('tenant_id', t.id)
  let sessQ = sb().from('psy_sessions').select('*').eq('tenant_id', t.id)
  if (resourceFilter) { casesQ = casesQ.eq('resource_id', resourceFilter); pkgsQ = pkgsQ.eq('resource_id', resourceFilter); sessQ = sessQ.eq('resource_id', resourceFilter) }
  const [{ data: cases }, { data: packages }, { data: sessions }] = await Promise.all([casesQ, pkgsQ, sessQ])

  const B = (cases || []).filter(x => inRange(x.created_at))
  const P = (packages || []).filter(x => inRange(x.created_at))
  const S = (sessions || []).filter(x => inRange(x.created_at))

  const paid = { interview: 0, assessment: 0, packages: 0, sessions: 0 }
  const paidCount = { interview: 0, assessment: 0, packages: 0, sessions: 0 }
  const pending = { interview: 0, assessment: 0, packages: 0, sessions: 0 }
  const pendingCount = { interview: 0, assessment: 0, packages: 0, sessions: 0 }
  const split = { online: 0, offline: 0 }
  const monthly: Record<string, number> = {}
  const addMonthly = (iso: string | undefined, amount: number) => {
    const k = jalaliMonthKey(iso); if (k) monthly[k] = (monthly[k] || 0) + amount
  }

  for (const b of B) {
    const iPrice = b.interview_price || PSY_PRICING.interview
    const aPrice = b.assessment_price || PSY_PRICING.assessment
    if (b.interview_paid) { paid.interview += iPrice; paidCount.interview++; addMonthly(b.created_at, iPrice) }
    else if (b.flow_status === FLOW.INTERVIEW_PAYMENT_SUBMITTED) { pending.interview += iPrice; pendingCount.interview++ }
    if (b.assessment_paid) { paid.assessment += aPrice; paidCount.assessment++; addMonthly(b.created_at, aPrice) }
    else if (b.flow_status === FLOW.ASSESSMENT_PAYMENT_SUBMITTED) { pending.assessment += aPrice; pendingCount.assessment++ }
  }
  for (const p of P) {
    const total = pkgTotal(p)
    if (p.paid) {
      paid.packages += total; paidCount.packages++; addMonthly(p.created_at, total)
      split.online += (p.child_sessions || 0) * (p.child_session_type === 'online' ? PSY_PRICING.sessionOnline : 0)
        + (p.parent_sessions || 0) * (p.parent_session_type === 'online' ? PSY_PRICING.sessionOnline : 0)
      split.offline += (p.child_sessions || 0) * (p.child_session_type !== 'online' ? PSY_PRICING.sessionOffline : 0)
        + (p.parent_sessions || 0) * (p.parent_session_type !== 'online' ? PSY_PRICING.sessionOffline : 0)
    } else if (p.payment_submitted) { pending.packages += total; pendingCount.packages++ }
  }
  for (const s of S) {
    const price = sessPrice(s.session_type)
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
      const full = sessPrice(s.session_type)
      refundsTotal += Math.round(full * (100 - s.refund_percent) / 100)
      refundsCount++
    }
  }
  const netPaid = totalPaid - refundsTotal

  const monthlySorted = Object.entries(monthly).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-12)
    .map(([month, amount]) => ({ month, amount }))

  const perCase: Record<string, number> = {}
  const bump = (cn: string, amt: number) => { if (cn) perCase[cn] = (perCase[cn] || 0) + amt }
  for (const b of B) {
    if (b.interview_paid) bump(b.case_number, b.interview_price || PSY_PRICING.interview)
    if (b.assessment_paid) bump(b.case_number, b.assessment_price || PSY_PRICING.assessment)
  }
  for (const p of P) if (p.paid) bump(p.case_number, pkgTotal(p))
  for (const s of S) if (s.paid) bump(s.case_number, sessPrice(s.session_type))
  const nameByCase: Record<string, string> = {}
  for (const b of B) if (b.case_number) nameByCase[b.case_number] = b.child_name || b.case_number
  const topCases = Object.entries(perCase).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([case_number, amount]) => ({ case_number, name: nameByCase[case_number] || case_number, amount }))

  return NextResponse.json({
    totalPaid, totalPending, refundsTotal, refundsCount, netPaid,
    paid, paidCount, pending, pendingCount, split, monthly: monthlySorted, topCases,
  }, { headers: NO_STORE })
}
