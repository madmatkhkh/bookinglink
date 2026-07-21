// ─────────────────────────────────────────────────────────────────────────────
// لایه‌ی حسابداری — نقطه‌ی واحد ثبت در دفتر حساب (ledger_entries).
//
// اصل طراحی: هر جایی که یک تراکنش «نهایی» می‌شود (پرداخت آنلاین در callback زیبال،
// یا تایید دستی کارت‌به‌کارت توسط دکتر) دقیقا یک بار recordLedgerEntry صدا زده
// می‌شود. ثبت idempotent است: اگر همان (source_table, source_id, purpose) قبلا
// ثبت شده باشد، دوباره ثبت نمی‌شود (unique index در دیتابیس هم پشتیبان است) — تا
// رفرش کاربر یا دابل‌کلیک دکتر باعث ردیف تکراری/جمع اشتباه نشود.
//
// دفتر تغییرناپذیر است: فقط INSERT، هیچ‌وقت UPDATE/DELETE. اگر تراکنشی برگشت خورد
// (بازپرداخت)، یک ردیف جدید با direction='outflow' ثبت می‌شود، نه ویرایش ردیف قبلی.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'

export type LedgerPurpose = 'stage' | 'interview' | 'assessment' | 'package' | 'session' | 'refund' | 'extra_charge' | 'subscription_fee'
export type LedgerMethod = 'online' | 'card_to_card'

export type RecordLedgerInput = {
  tenantId: string
  resourceId: string | null
  caseNumber: string | null
  purpose: LedgerPurpose
  method: LedgerMethod
  direction?: 'inflow' | 'outflow'
  amount: number
  commissionAmount?: number
  // فاز P2: تفکیک کارمزد پلتفرم به پایه + مالیات بر ارزش افزوده (بخش 9.6).
  // اختیاری و فقط وقتی مدل جدید فعال است پر می‌شود؛ commissionAmount همچنان
  // «کل کسر» است (پایه+VAT) تا معنای ستون قدیمی و همه‌ی گزارش‌ها دست نخورد.
  feeBaseAmount?: number | null
  feeVatAmount?: number | null
  doctorAmount?: number
  sourceTable?: string | null
  sourceId?: string | null
  paymentIntentId?: string | null
  splitApplied?: boolean
  bankRefNumber?: string | null
  recordedBy?: string
  note?: string
}

// ثبت یک ردیف دفتر حساب. برمی‌گرداند آیا ردیف تازه‌ای ثبت شد یا نه (false =
// از قبل بود، idempotent). هرگز throw نمی‌کند — خطای ثبت ledger نباید فلو
// اصلی پرداخت را بشکند؛ فقط لاگ می‌شود (ثبت بعدی تطبیقی می‌تواند جبرانش کند).
export async function recordLedgerEntry(input: RecordLedgerInput): Promise<boolean> {
  try {
    // چک idempotency در سطح اپ (unique index هم در DB هست، این فقط برای صرفه‌جویی)
    if (input.sourceTable && input.sourceId) {
      const { data: existing } = await sb().from('ledger_entries').select('id')
        .eq('source_table', input.sourceTable).eq('source_id', input.sourceId).eq('purpose', input.purpose).maybeSingle()
      if (existing) return false
    }
    const { error } = await sb().from('ledger_entries').insert({
      tenant_id: input.tenantId,
      resource_id: input.resourceId,
      case_number: input.caseNumber,
      purpose: input.purpose,
      method: input.method,
      direction: input.direction || 'inflow',
      amount: Math.round(input.amount),
      commission_amount: Math.round(input.commissionAmount || 0),
      // ستون‌های تفکیک فقط وقتی مقدار دارند نوشته می‌شوند — قبل از اجرای
      // migration 0046 این کلیدها اصلا در insert نیستند و چیزی نمی‌شکند.
      ...(input.feeBaseAmount != null ? {
        fee_base_amount: Math.round(input.feeBaseAmount),
        fee_vat_amount: Math.round(input.feeVatAmount || 0),
      } : {}),
      doctor_amount: Math.round(input.doctorAmount ?? (input.amount - (input.commissionAmount || 0))),
      source_table: input.sourceTable || null,
      source_id: input.sourceId || null,
      payment_intent_id: input.paymentIntentId || null,
      split_applied: input.splitApplied || false,
      bank_ref_number: input.bankRefNumber || null,
      recorded_by: input.recordedBy || 'system',
      note: input.note || null,
    })
    if (error) {
      // 23505 = تخطی از unique (یعنی مسابقه‌ای دیگری همین لحظه ثبتش کرد) — طبیعی، نه خطا
      if (error.code !== '23505') console.error('recordLedgerEntry error:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('recordLedgerEntry exception:', e)
    return false
  }
}
