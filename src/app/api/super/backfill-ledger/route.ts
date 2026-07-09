import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'
import { recordLedgerEntry } from '@/lib/ledger'
import { getResourcePricing, packageAmount } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// یک‌بار-اجرا: تراکنش‌هایی که *قبل* از راه‌اندازیِ دفترِ حساب پرداخت شده بودند در
// ledger نیستند. این route همه‌ی رکوردهایِ paid موجود (مرحله/پروتکل/جلسه) و
// intentهایِ آنلاینِ paid را می‌خواند و به ledger منتقل می‌کند. چون recordLedgerEntry
// idempotent است، اجرای چندباره‌ی این اسکریپت ردیفِ تکراری نمی‌سازد — امن است.
//
// نکته: برایِ کارت‌به‌کارتِ قدیمی، method='card_to_card' و کلِ مبلغ سهمِ متخصص است.
// برایِ آنلاینِ قدیمی که از psy_payment_intents می‌آید، کارمزد/سهم از خودِ intent.
// چون همان source (مثلاً یک psy_session) هم ممکن است paid باشد و هم یک intentِ paid
// داشته باشد، اول intentها را ثبت می‌کنیم؛ چون unique index رویِ
// (source_table, source_id, purpose) است و منبعِ intent «psy_payment_intents» است
// (نه psy_sessions)، تداخلی رخ نمی‌دهد و ممکن است یک تراکنش دوبار شمرده شود.
// برایِ همین: اگر یک session/package/stage یک intentِ paid دارد، از ثبتِ کارت‌به‌کارتش
// صرف‌نظر می‌کنیم (آن پول آنلاین بوده، نه کارت‌به‌کارت).
export async function POST(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = { intents: 0, stages: 0, packages: 0, sessions: 0, skipped: 0 }

  // 1) intentهایِ آنلاینِ paid — و ثبتِ ref_idهاشان تا از دوباره‌شماریِ کارت‌به‌کارت جلوگیری شود
  const { data: intents } = await sb().from('psy_payment_intents').select('*').eq('status', 'paid')
  const onlineRefIds = new Set<string>()
  for (const it of intents || []) {
    if (it.ref_id) onlineRefIds.add(it.ref_id)
    let purpose: 'interview' | 'assessment' | 'package' | 'session' = 'session'
    let caseNumber: string | null = it.case_number || null
    if (it.purpose === 'stage' && it.ref_id) {
      const { data: st } = await sb().from('psy_stages').select('case_number, stage_type').eq('id', it.ref_id).maybeSingle()
      purpose = st?.stage_type === 'assessment' ? 'assessment' : 'interview'
      caseNumber = caseNumber || st?.case_number || null
    } else if (it.purpose === 'package') purpose = 'package'
    else if (it.purpose === 'session') purpose = 'session'
    const created = await recordLedgerEntry({
      tenantId: it.tenant_id, resourceId: it.resource_id || null, caseNumber, purpose,
      method: 'online', amount: it.amount || 0, commissionAmount: it.commission_amount || 0,
      doctorAmount: (it.amount || 0) - (it.commission_amount || 0),
      sourceTable: 'psy_payment_intents', sourceId: it.id, paymentIntentId: it.id,
      splitApplied: it.split_applied || false, recordedBy: 'backfill',
    })
    if (created) result.intents++
  }

  // 2) مرحله‌هایِ paid (کارت‌به‌کارت) — مگر آنکه یک intentِ آنلاین برایشان بوده
  const { data: stages } = await sb().from('psy_stages').select('*').eq('paid', true)
  for (const st of stages || []) {
    if (onlineRefIds.has(st.id)) { result.skipped++; continue }
    const created = await recordLedgerEntry({
      tenantId: st.tenant_id, resourceId: st.resource_id || null, caseNumber: st.case_number,
      purpose: st.stage_type === 'assessment' ? 'assessment' : 'interview', method: 'card_to_card',
      amount: st.price || 0, commissionAmount: 0, doctorAmount: st.price || 0,
      sourceTable: 'psy_stages', sourceId: st.id, recordedBy: 'backfill',
    })
    if (created) result.stages++
  }

  // 3) پروتکل‌هایِ paid
  const { data: packages } = await sb().from('psy_packages').select('*').eq('paid', true)
  for (const p of packages || []) {
    if (onlineRefIds.has(p.id)) { result.skipped++; continue }
    let price = p.price || 0
    if (!price) price = packageAmount(p, await getResourcePricing(p.resource_id))
    const created = await recordLedgerEntry({
      tenantId: p.tenant_id, resourceId: p.resource_id || null, caseNumber: p.case_number,
      purpose: 'package', method: 'card_to_card', amount: price, commissionAmount: 0, doctorAmount: price,
      sourceTable: 'psy_packages', sourceId: p.id, recordedBy: 'backfill',
    })
    if (created) result.packages++
  }

  // 4) جلسه‌هایِ paid
  const { data: sessions } = await sb().from('psy_sessions').select('*').eq('paid', true)
  for (const s of sessions || []) {
    if (onlineRefIds.has(s.id)) { result.skipped++; continue }
    let price = s.price || 0
    if (!price) { const pr = await getResourcePricing(s.resource_id); price = s.session_type === 'online' ? pr.sessionOnline : pr.sessionOffline }
    const created = await recordLedgerEntry({
      tenantId: s.tenant_id, resourceId: s.resource_id || null, caseNumber: s.case_number,
      purpose: 'session', method: 'card_to_card', amount: price, commissionAmount: 0, doctorAmount: price,
      sourceTable: 'psy_sessions', sourceId: s.id, recordedBy: 'backfill',
    })
    if (created) result.sessions++
  }

  return NextResponse.json({ success: true, ...result })
}
