import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { requireModule } from '@/lib/modules'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// آمار و گزارش کسب‌وکاری — از روی همان جدول‌های موجود محاسبه می‌شود (دفتر
// حساب، جلسات، پرونده‌ها)، بدون نیاز به جدول جدید. فقط برای آخرین 90 روز
// (بار سنگین‌تر روی دیتابیس بی‌فایده است؛ برای یک مطب/کلینیک همین کافی است).
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const gate = await requireModule(a.tenant.id, 'analytics', a.tenant.plan)
  if (gate) return gate
  const db = sb()
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  let ledgerQ = db.from('ledger_entries').select('purpose, direction, amount, doctor_amount, commission_amount, created_at')
    .eq('tenant_id', a.tenant.id).gte('created_at', since)
  if (!a.isOwner) ledgerQ = ledgerQ.eq('resource_id', a.resourceId)
  let sessQ = db.from('psy_sessions').select('status, price, created_at').eq('tenant_id', a.tenant.id).gte('created_at', since)
  if (!a.isOwner) sessQ = sessQ.eq('resource_id', a.resourceId)
  let caseQ = db.from('psy_cases').select('created_at').eq('tenant_id', a.tenant.id).gte('created_at', since)
  if (!a.isOwner) caseQ = caseQ.eq('resource_id', a.resourceId)

  const [{ data: ledger }, { data: sessions }, { data: cases }] = await Promise.all([ledgerQ, sessQ, caseQ])

  // درآمد به تفکیک نوع (فقط inflow، refund/outflow جدا کسر می‌شود)
  const revenueByPurpose: Record<string, number> = {}
  let totalInflow = 0, totalOutflow = 0, totalCommission = 0
  for (const row of ledger || []) {
    if (row.direction === 'outflow') { totalOutflow += row.amount; continue }
    totalInflow += row.amount
    totalCommission += row.commission_amount || 0
    revenueByPurpose[row.purpose] = (revenueByPurpose[row.purpose] || 0) + row.amount
  }

  // نرخ no-show/کنسلی: از میان جلسات تکی که تاریخ‌گذاری شده‌اند
  const total = (sessions || []).length
  const forfeited = (sessions || []).filter(s => s.status === 'forfeited').length
  const noShowRate = total > 0 ? Math.round((forfeited / total) * 1000) / 10 : 0

  // رشد پرونده‌ها به تفکیک هفته (13 نقطه‌ی اخیر ≈ 90 روز)
  const weekly: Record<string, number> = {}
  for (const c of cases || []) {
    const d = new Date(c.created_at)
    const weekStart = new Date(d); weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay())
    const key = weekStart.toISOString().slice(0, 10)
    weekly[key] = (weekly[key] || 0) + 1
  }
  const caseGrowth = Object.entries(weekly).sort(([a], [b]) => a.localeCompare(b)).map(([week, count]) => ({ week, count }))

  return NextResponse.json({
    totalInflow, totalOutflow, totalCommission, netRevenue: totalInflow - totalOutflow,
    revenueByPurpose, noShowRate, sessionsTotal: total, sessionsForfeited: forfeited,
    newCases: (cases || []).length, caseGrowth,
  })
}
