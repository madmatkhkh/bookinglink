import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { sb } from '@/lib/supabase'
import { recordLedgerEntry } from '@/lib/ledger'
import { gregorianToJalali, jalaliToGregorian } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// بیلینگ ماهانه‌ی نوبت‌لینک — دو کار مستقل در یک زمان‌بند روزانه:
//
//   الف) حق اشتراک ماهانه (فاز P4) — یک ردیف ledger برای هر tenant در ماه
//        جلالی جاری. پشت سوییچ platform_settings.plan_prices.enabled است.
//   ب)  صدور فاکتور ماه قبل (فاز P5) — از روی همان ledger. **مستقل از سوییچ
//        بالا** اجرا می‌شود، چون کارمزد تراکنش‌ها حتی با اشتراک خاموش هم باید
//        روی فاکتور بیاید.
//
// شکل entry اشتراک (تصمیم کلیدی — صفر تغییر در کد تسویه):
//   amount=0                → گردش مالی مراجعان را دست نمی‌زند
//   commission_amount=+کل   → در حسابداری سوپر به‌عنوان درآمد پلتفرم جمع می‌شود
//   doctor_amount=−کل       → در /super/settlements خودکار از owed کم می‌شود
//   method='online'         → کوئری تسویه فقط method='online' را می‌خواند
//   direction='inflow'      → کوئری تسویه outflow را رد می‌کند
//   resource_id=منبع اول    → کوئری تسویه ردیف بدون resource_id را رد می‌کند
// این چهار مورد اجباری‌اند؛ تغییرشان یعنی اشتراک هرگز وصول نمی‌شود.
//
// idempotency: source_id یک UUID قطعی از (tenant + ماه) است و ایندکس یکتای
// موجود ledger_source_uniq (source_table, source_id, purpose) اجرای چندباره را
// ساختارا بی‌اثر می‌کند — نه با «چک کردیم قبلا زده‌ایم یا نه».
//
// امنیت: فقط با Authorization: Bearer <CRON_SECRET>.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_VAT_PERCENT = 10
const SOURCE_TABLE = 'subscriptions'

/** نیمه‌شب اول ماه جلالی به وقت ایران، به‌صورت ISO (برای مقایسه با created_at که UTC است) */
function jalaliMonthFirstISO(y: number, m: number): string {
  // قرارداد کدبیس: jalaliToGregorian ماه 1-indexed می‌گیرد
  const g = jalaliToGregorian(y, m, 1)
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd) - 3.5 * 3600 * 1000).toISOString()
}

/**
 * پنجره‌ی یک ماه جلالی نسبت به ماه جاری (0 = همین ماه، -1 = ماه قبل).
 * رول‌اور سال را درست هندل می‌کند (ماه قبل از فروردین = اسفند سال قبل).
 */
function jalaliMonthWindow(offset: number): { key: string; startISO: string; endISO: string } {
  const iranNow = new Date(Date.now() + 3.5 * 3600 * 1000)
  // قرارداد کدبیس: gregorianToJalali ماه 0-indexed برمی‌گرداند
  const j = gregorianToJalali(iranNow.getUTCFullYear(), iranNow.getUTCMonth() + 1, iranNow.getUTCDate())
  let y = j.year
  let m = j.month + 1 + offset
  while (m < 1) { m += 12; y -= 1 }
  while (m > 12) { m -= 12; y += 1 }
  let ny = y, nm = m + 1
  if (nm > 12) { nm = 1; ny += 1 }
  return {
    key: `${y}/${String(m).padStart(2, '0')}`,
    startISO: jalaliMonthFirstISO(y, m),
    endISO: jalaliMonthFirstISO(ny, nm),
  }
}

/** UUID قطعی (نسخه‌ی 4 شکلی) از یک کلید متنی — تا source_id بدون جدول کمکی idempotent بماند */
function deterministicUuid(...parts: string[]): string {
  const b = Buffer.from(createHash('sha256').update(parts.join(':')).digest().subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x40 // version
  b[8] = (b[8] & 0x3f) | 0x80 // variant
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

async function readSetting(key: string): Promise<any | null> {
  try {
    const { data } = await sb().from('platform_settings').select('value').eq('key', key).maybeSingle()
    return data?.value ?? null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = sb()
  const planPrices = await readSetting('plan_prices')
  const planFees = await readSetting('plan_fees')

  // نرخ مالیات یک منبع دارد (plan_fees) — همان که کارمزد تراکنش استفاده می‌کند
  const vatPercent = typeof planFees?.vat_percent === 'number' ? planFees.vat_percent : DEFAULT_VAT_PERCENT
  // کلید ایمنی: تا آگاهانه true نشود هیچ‌کس شارژ نمی‌شود
  const billingEnabled = planPrices?.enabled === true

  // مجموعه‌های تستی نه شارژ می‌شوند نه فاکتور می‌گیرند
  const { data: tenants } = await db.from('tenants')
    .select('id, plan, is_test').eq('status', 'active').eq('is_test', false)
  const list = tenants || []

  // منبع اول هر tenant (یک کوئری برای همه) — entry اشتراک بدون resource_id
  // در محاسبه‌ی تسویه نادیده گرفته می‌شود، پس اجباری است.
  const { data: resources } = await db.from('resources')
    .select('id, tenant_id, sort_order, created_at')
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  const firstResource = new Map<string, string>()
  for (const r of resources || []) if (!firstResource.has(r.tenant_id)) firstResource.set(r.tenant_id, r.id)

  // ── الف) حق اشتراک ماه جاری ──────────────────────────────────────────────
  const month = jalaliMonthWindow(0)
  let charged = 0, skippedNoPrice = 0, skippedNoResource = 0, alreadyCharged = 0

  if (billingEnabled) {
    for (const t of list) {
      // 'free' قدیمی همان پلن «پایه» است (alias در کد، بدون UPDATE روی دیتای زنده)
      const priceKey = t.plan === 'free' ? 'base' : t.plan
      const price = planPrices?.[priceKey]
      if (typeof price !== 'number' || price <= 0) { skippedNoPrice++; continue }

      const resourceId = firstResource.get(t.id)
      if (!resourceId) { skippedNoResource++; continue }

      const base = Math.round(price)
      const vat = Math.round(base * vatPercent / 100)
      const total = base + vat

      const created = await recordLedgerEntry({
        tenantId: t.id,
        resourceId,
        caseNumber: null,
        purpose: 'subscription_fee',
        method: 'online',
        direction: 'inflow',
        amount: 0,
        commissionAmount: total,
        feeBaseAmount: base,
        feeVatAmount: vat,
        doctorAmount: -total,
        sourceTable: SOURCE_TABLE,
        sourceId: deterministicUuid(SOURCE_TABLE, t.id, month.key),
        recordedBy: 'cron:subscriptions',
        note: `حق اشتراک ${month.key}`,
      })
      if (created) charged++; else alreadyCharged++
    }
  }

  // ── ب) صدور فاکتور ماه قبل (مستقل از سوییچ بیلینگ) ───────────────────────
  const prev = jalaliMonthWindow(-1)
  let invoiced = 0, invoiceSkippedEmpty = 0

  for (const t of list) {
    try {
      // فقط entryهای مدل جدید (که تفکیک پایه/مالیات دارند) روی فاکتور می‌آیند.
      // کارمزدهای مدل قدیمی یا override per-متخصص ستون تفکیک ندارند و فاکتورشان
      // دستی است — حد شناخته‌شده و مستند فاز P5.
      const { data: entries } = await db.from('ledger_entries')
        .select('purpose, fee_base_amount, fee_vat_amount')
        .eq('tenant_id', t.id).eq('direction', 'inflow')
        .not('fee_base_amount', 'is', null)
        .gte('created_at', prev.startISO).lt('created_at', prev.endISO)

      let subBase = 0, subVat = 0, txnBase = 0, txnVat = 0, txnCount = 0
      for (const e of entries || []) {
        const b = e.fee_base_amount || 0
        const v = e.fee_vat_amount || 0
        if (e.purpose === 'subscription_fee') { subBase += b; subVat += v }
        else { txnBase += b; txnVat += v; txnCount++ }
      }

      const totalBase = subBase + txnBase
      const totalVat = subVat + txnVat
      if (totalBase === 0 && totalVat === 0) { invoiceSkippedEmpty++; continue } // فاکتور تمام‌صفر نمی‌سازیم

      // ایندکس یکتای invoices_tenant_period_uniq اجرای دوباره را بی‌اثر می‌کند
      const { error } = await db.from('invoices')
        .upsert({
          tenant_id: t.id,
          period_key: prev.key,
          status: 'issued',
          vat_rate: vatPercent, // نرخ لحظه‌ی صدور، دیتا نه هاردکد
          subscription_base: subBase,
          subscription_vat: subVat,
          txn_fee_base: txnBase,
          txn_fee_vat: txnVat,
          txn_count: txnCount,
          total_base: totalBase,
          total_vat: totalVat,
          total: totalBase + totalVat,
        }, { onConflict: 'tenant_id,period_key', ignoreDuplicates: true })
      if (error) console.error('invoice upsert error:', t.id, error)
      else invoiced++
    } catch (e) {
      console.error('invoice exception:', t.id, e)
    }
  }

  return NextResponse.json({
    success: true,
    billing_enabled: billingEnabled,
    tenants: list.length,
    subscription: {
      period: month.key,
      charged,
      already_charged: alreadyCharged,
      skipped_no_price: skippedNoPrice,
      skipped_no_resource: skippedNoResource,
    },
    invoices: { period: prev.key, issued: invoiced, skipped_empty: invoiceSkippedEmpty },
  })
}
