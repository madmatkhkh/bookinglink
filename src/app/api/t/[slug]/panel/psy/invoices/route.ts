import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ─────────────────────────────────────────────────────────────────────────────
// فاکتورهای ماهانه‌ی نوبت‌لینک (فاز P5) — حق اشتراک + کارمزد تراکنش‌ها با
// تفکیک مالیات بر ارزش افزوده.
//
// فاکتورها را cron بیلینگ (/api/cron/subscriptions) صادر می‌کند؛ این روت فقط
// می‌خواندشان. تب «گزارشات مالی» پنل متخصص مصرف‌کننده‌ی آن است.
//
// فقط صاحب مجموعه: صورت‌حساب رابطه‌ی مالی نوبت‌لینک با خود tenant است، نه
// دیتای درمانی یک متخصص — پرسنل لیست خالی می‌گیرند (نه خطا، تا تب مالی‌شان
// نشکند؛ بخش فاکتورها در UI وقتی لیست خالی است اصلا رندر نمی‌شود).
// ─────────────────────────────────────────────────────────────────────────────

const LIMIT = 24 // دو سال فاکتور ماهانه

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ invoices: [] })

  // اگر جدول invoices هنوز روی این دیتابیس ساخته نشده باشد (migration 0049)،
  // لیست خالی برمی‌گردانیم نه خطا — همان قرارداد fail-open بقیه‌ی فازها.
  try {
    const { data, error } = await sb().from('invoices')
      .select('id, period_key, status, vat_rate, subscription_base, subscription_vat, txn_fee_base, txn_fee_vat, txn_count, total_base, total_vat, total, created_at')
      .eq('tenant_id', a.tenant.id)
      .order('period_key', { ascending: false })
      .limit(LIMIT)
    if (error) {
      console.error('invoices GET error:', error)
      return NextResponse.json({ invoices: [] })
    }
    return NextResponse.json({ invoices: data || [] })
  } catch (e) {
    console.error('invoices GET exception:', e)
    return NextResponse.json({ invoices: [] })
  }
}
