import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { getResourcePricing, packageAmount, DEFAULT_PRICING, Pricing, resolvePrice } from '@/lib/psy'
import { gregorianToJalali } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// مبلغ واقعی همیشه از روی ستون price ذخیره‌شده روی خود ردیف خوانده می‌شود (همان
// چیزی که واقعا از دکتر/مراجع در آن لحظه‌ی خاص خواسته شده)؛ فقط برای ردیف‌های
// خیلی قدیمی که price ذخیره‌شده صفر است (پیش از پیاده‌شدن قیمت‌گذاری per-resource)
// با قیمت فعلی همان دکتر بازمحاسبه می‌شود — تقریبی، نه قیمت واقعی آن زمان.
const sessPrice = (s: any, pricing: any) => s.price || resolvePrice(s.session_type, pricing)
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
  // کارمند فقط گزارش مالی خودش را می‌بیند؛ owner می‌تواند با ?resource_id= فیلتر کند یا همه را ببیند
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

  let casesQ = sb().from('psy_cases').select('case_number, client_name').eq('tenant_id', t.id)
  let stagesQ = sb().from('psy_stages').select('*').eq('tenant_id', t.id)
  let pkgsQ = sb().from('psy_packages').select('*').eq('tenant_id', t.id)
  let sessQ = sb().from('psy_sessions').select('*').eq('tenant_id', t.id)
  if (resourceFilter) { stagesQ = stagesQ.eq('resource_id', resourceFilter); pkgsQ = pkgsQ.eq('resource_id', resourceFilter); sessQ = sessQ.eq('resource_id', resourceFilter) }
  const [{ data: cases }, { data: stages }, { data: packages }, { data: sessions }] = await Promise.all([casesQ, stagesQ, pkgsQ, sessQ])

  const St = (stages || []).filter(x => inRange(x.created_at))
  const P = (packages || []).filter(x => inRange(x.created_at))
  const S = (sessions || []).filter(x => inRange(x.created_at))

  // نگاشت قیمت فعلی هر resource — فقط به‌عنوان fallback برای ردیف‌های خیلی
  // قدیمی که ستون price‌شان صفر مانده (پیش از قیمت‌گذاری per-resource)
  const resourceIds = Array.from(new Set([...P, ...S].map(x => x.resource_id).filter(Boolean)))
  const pricingEntries = await Promise.all(resourceIds.map(async id => [id, await getResourcePricing(id)] as [string, Pricing]))
  const pricingMap = new Map<string, Pricing>(pricingEntries)
  const pricingFor = (resourceId: string | null | undefined): Pricing => (resourceId && pricingMap.get(resourceId)) || DEFAULT_PRICING

  // تفکیک بر اساس عنوان مرحله (نه نوع ثابت). هر عنوان دلخواه دکتر یک ردیف.
  const byTitle: Record<string, { paid: number; paidCount: number; pending: number; pendingCount: number }> = {}
  const bumpTitle = (title: string, field: 'paid' | 'pending', amount: number) => {
    if (!byTitle[title]) byTitle[title] = { paid: 0, paidCount: 0, pending: 0, pendingCount: 0 }
    byTitle[title][field] += amount
    byTitle[title][field === 'paid' ? 'paidCount' : 'pendingCount']++
  }
  const paid = { stages: 0, packages: 0, sessions: 0 }
  const pending = { stages: 0, packages: 0, sessions: 0 }
  const split = { online: 0, offline: 0 }
  const monthly: Record<string, number> = {}
  const addMonthly = (iso: string | undefined, amount: number) => {
    const k = jalaliMonthKey(iso); if (k) monthly[k] = (monthly[k] || 0) + amount
  }

  // هر مرحله از psy_stages — بر اساس عنوان خودش گروه می‌شود.
  for (const st of St) {
    const title = (st.title || '').trim() || 'جلسه'
    if (st.paid) { paid.stages += st.price || 0; bumpTitle(title, 'paid', st.price || 0); addMonthly(st.created_at, st.price || 0) }
    else if (st.payment_submitted) { pending.stages += st.price || 0; bumpTitle(title, 'pending', st.price || 0) }
  }
  for (const p of P) {
    const pricing = pricingFor(p.resource_id)
    const total = pkgTotal(p, pricing)
    if (p.paid) {
      paid.packages += total; addMonthly(p.created_at, total)
      split.online += (p.primary_sessions || 0) * (p.primary_session_type === 'online' ? pricing.online : 0)
        + (p.secondary_sessions || 0) * (p.secondary_session_type === 'online' ? pricing.online : 0)
      split.offline += (p.primary_sessions || 0) * (p.primary_session_type !== 'online' ? pricing.offline : 0)
        + (p.secondary_sessions || 0) * (p.secondary_session_type !== 'online' ? pricing.offline : 0)
    } else if (p.payment_submitted) { pending.packages += total }
  }
  for (const s of S) {
    const price = sessPrice(s, pricingFor(s.resource_id))
    if (s.paid) {
      paid.sessions += price; addMonthly(s.created_at, price)
      if (s.session_type === 'online') split.online += price; else split.offline += price
    } else if (s.payment_submitted) { pending.sessions += price }
  }

  // تبدیل byTitle به آرایه‌ی مرتب (بیشترین درآمد اول) برای نمایش
  const stageBreakdown = Object.entries(byTitle)
    .map(([title, v]) => ({ title, ...v }))
    .sort((a, b) => b.paid - a.paid)

  const totalPaid = paid.stages + paid.packages + paid.sessions
  const totalPending = pending.stages + pending.packages + pending.sessions

  let refundsTotal = 0, refundsCount = 0
  const refundsList: { case_number: string; name: string; amount: number; percent: number; date: string; card: string | null }[] = []
  for (const s of S) {
    if (s.paid && s.refund_percent && s.refund_percent > 0) {
      const full = sessPrice(s, pricingFor(s.resource_id))
      const amt = Math.round(full * (100 - s.refund_percent) / 100)
      refundsTotal += amt
      refundsCount++
      refundsList.push({ case_number: s.case_number, name: '', amount: amt, percent: s.refund_percent, date: s.created_at, card: s.refund_card || null })
    }
  }
  const netPaid = totalPaid - refundsTotal

  const monthlySorted = Object.entries(monthly).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-12)
    .map(([month, amount]) => ({ month, amount }))

  // ── امروز / این هفته / سری روزانه (Shopify-style) ─────────────────────────
  // این‌ها بازه‌های مطلق‌اند (نه بازه‌ی گزارش انتخابی) — «امروز» یعنی امروز،
  // فارغ از این‌که کاربر بازه‌ی گزارش را چه گذاشته. پس روی همه‌ی ردیف‌ها (نه St/P/S
  // فیلترشده) حساب می‌شوند.
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  // شروع هفته: شنبه (هفته‌ی ایرانی). getDay(): 0=یکشنبه..6=شنبه → شنبه=6
  const daysSinceSaturday = (now.getDay() + 1) % 7
  const startOfWeek = startOfToday - daysSinceSaturday * 86400000
  const dayKey = (iso: string | undefined): number | null => {
    if (!iso) return null
    const d = new Date(iso); if (isNaN(d.getTime())) return null
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  // amountByDay از همه‌ی ردیف‌های paid (بدون فیلتر بازه) — برای today/week/daily
  const amountByDay = new Map<number, number>()
  const addDay = (iso: string | undefined, amt: number) => {
    const k = dayKey(iso); if (k === null) return
    amountByDay.set(k, (amountByDay.get(k) || 0) + amt)
  }
  for (const st of stages || []) if (st.paid) addDay(st.created_at, st.price || 0)
  for (const p of packages || []) if (p.paid) addDay(p.created_at, pkgTotal(p, pricingFor(p.resource_id)))
  for (const s of sessions || []) if (s.paid) addDay(s.created_at, sessPrice(s, pricingFor(s.resource_id)))

  let todayTotal = 0, weekTotal = 0
  amountByDay.forEach((amt, k) => {
    if (k >= startOfToday) todayTotal += amt
    if (k >= startOfWeek) weekTotal += amt
  })
  // سری ۳۰ روز اخیر برای نمودار میله‌ای روزانه (قدیمی‌ترین → جدیدترین)
  const daily: { date: string; amount: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const k = startOfToday - i * 86400000
    daily.push({ date: new Date(k).toISOString(), amount: amountByDay.get(k) || 0 })
  }
  // سری ۱۲ هفته‌ی اخیر (هر ستون = یک هفته، از شنبه)
  const weekly: { date: string; amount: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const ws = startOfWeek - i * 7 * 86400000
    const we = ws + 7 * 86400000
    let sum = 0
    amountByDay.forEach((amt, k) => { if (k >= ws && k < we) sum += amt })
    weekly.push({ date: new Date(ws).toISOString(), amount: sum })
  }
  // سری ۱۲ ماه اخیر
  const monthlyChart: { date: string; amount: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ms = d.getTime()
    const me = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime()
    let sum = 0
    amountByDay.forEach((amt, k) => { if (k >= ms && k < me) sum += amt })
    monthlyChart.push({ date: d.toISOString(), amount: sum })
  }

  // ── فهرست تک‌تک تراکنش‌ها (برای جدول جزئیات) ─────────────────────────────
  // منبع: ledger_entries (منبع حقیقت مالی — روش پرداخت، مبلغ، کمیسیون را دارد).
  // فقط ورودی‌ها (inflow) در بازه‌ی گزارش انتخابی.
  let txnQ = sb().from('ledger_entries')
    .select('purpose, method, amount, commission_amount, doctor_amount, bank_ref_number, case_number, created_at')
    .eq('tenant_id', t.id).eq('direction', 'inflow')
    .order('created_at', { ascending: false })
  if (resourceFilter) txnQ = txnQ.eq('resource_id', resourceFilter)
  if (from) txnQ = txnQ.gte('created_at', from)
  if (to) txnQ = txnQ.lte('created_at', to)
  const { data: txnRows } = await txnQ
  const PURPOSE_FA: Record<string, string> = {
    stage: 'جلسه', interview: 'مصاحبه', assessment: 'ارزیابی', package: 'پروتکل درمان', session: 'جلسه', extra_charge: 'شارژ اضافه',
  }
  const transactions = (txnRows || []).map(r => ({
    type: PURPOSE_FA[r.purpose] || r.purpose,
    method: r.method as 'online' | 'card_to_card',
    amount: r.amount || 0,
    commission: r.commission_amount || 0,
    doctorAmount: r.doctor_amount || 0,
    bankRef: r.bank_ref_number || null,
    date: r.created_at,
    case_number: r.case_number || '',
    name: '',
  }))

  const perCase: Record<string, number> = {}
  const bump = (cn: string, amt: number) => { if (cn) perCase[cn] = (perCase[cn] || 0) + amt }
  for (const st of St) if (st.paid) bump(st.case_number, st.price || 0)
  for (const p of P) if (p.paid) bump(p.case_number, pkgTotal(p, pricingFor(p.resource_id)))
  for (const s of S) if (s.paid) bump(s.case_number, sessPrice(s, pricingFor(s.resource_id)))
  const nameByCase: Record<string, string> = {}
  for (const b of cases || []) if (b.case_number) nameByCase[b.case_number] = b.client_name || b.case_number
  const topCases = Object.entries(perCase).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([case_number, amount]) => ({ case_number, name: nameByCase[case_number] || case_number, amount }))
  for (const r of refundsList) r.name = nameByCase[r.case_number] || r.case_number
  for (const tr of transactions) tr.name = nameByCase[tr.case_number] || tr.case_number
  refundsList.sort((a, b) => (a.date < b.date ? 1 : -1))

  // تسویه‌ی پرداخت آنلاین — چقدر پول از تراکنش‌های آنلاین (که همه‌شان اول به
  // حساب خود پلتفرم می‌رود) بابت سهم همین دکتر مانده، و چقدرش خودکار
  // (سرویس تسهیم زیبال) مستقیم به شبای او واریز شده.
  let intentsQ = sb().from('psy_payment_intents').select('*').eq('tenant_id', t.id).eq('status', 'paid')
  if (resourceFilter) intentsQ = intentsQ.eq('resource_id', resourceFilter)
  const { data: intents } = await intentsQ
  const paidIntents = (intents || []).filter(x => inRange(x.created_at))
  const settlement = paidIntents.reduce((acc, i) => {
    const commission = i.commission_amount || 0
    const doctorShare = (i.amount || 0) - commission
    acc.totalOnline += i.amount || 0
    acc.totalCommission += commission
    if (i.split_applied) acc.autoSettled += doctorShare
    else acc.owed += doctorShare
    acc.count++
    return acc
  }, { totalOnline: 0, totalCommission: 0, autoSettled: 0, owed: 0, count: 0 })

  // معوق واقعی: مانده‌ی بدهی همیشه یک عدد سراسری است، نه چیزی که به بازه‌ی
  // گزارش انتخابی محدود باشد — دقیقا همان چیزی که سوپرادمین در /super/settlements
  // می‌بیند (owed_gross - settled_manual). قبلا اینجا `settlement.owed` هیچ‌وقت
  // تسویه‌های ثبت‌شده‌ی سوپرادمین (جدول settlements) را کم نمی‌کرد؛ یعنی تسویه‌ی
  // سوپر هیچ‌وقت اینجا دیده نمی‌شد. owed را با همین محاسبه‌ی سراسری جایگزین می‌کنیم.
  let allIntentsQ = sb().from('psy_payment_intents').select('amount, commission_amount, split_applied').eq('tenant_id', t.id).eq('status', 'paid')
  if (resourceFilter) allIntentsQ = allIntentsQ.eq('resource_id', resourceFilter)
  let settlementsQ = sb().from('settlements').select('amount').eq('tenant_id', t.id)
  if (resourceFilter) settlementsQ = settlementsQ.eq('resource_id', resourceFilter)
  const [{ data: allIntents }, { data: settlementRows }] = await Promise.all([allIntentsQ, settlementsQ])
  const owedGross = (allIntents || []).reduce((sum, i) => sum + (i.split_applied ? 0 : (i.amount || 0) - (i.commission_amount || 0)), 0)
  const settledManual = (settlementRows || []).reduce((sum, s) => sum + (s.amount || 0), 0)
  settlement.owed = Math.max(0, owedGross - settledManual)
  const settlementWithManual = { ...settlement, settledManual }

  return NextResponse.json({
    totalPaid, totalPending, refundsTotal, refundsCount, netPaid, refundsList,
    todayTotal, weekTotal, daily, weekly, monthlyChart, transactions,
    stageBreakdown, paid, pending, split, monthly: monthlySorted, topCases, settlement: settlementWithManual,
  }, { headers: NO_STORE })
}
