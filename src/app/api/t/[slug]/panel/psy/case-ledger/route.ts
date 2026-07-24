import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// دفتر حساب کامل یک پرونده — منبع حقیقت مالی برای نمایش «اطلاعات پرداخت کامل»
// در پنل متخصص. هر ردیف ledger یک تراکنش نهایی‌شده است (مبلغ، روش، سهم متخصص،
// کمیسیون، شماره پیگیری بانکی، تاریخ). بازپرداخت‌ها هم به‌عنوان outflow این‌جا
// هستند (ledger)، ولی جزئیات شماره پیگیری بازپرداخت را از psy_refunds جدا هم
// می‌آوریم تا در بخش بازپرداخت نمایش داده شود.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const case_number = req.nextUrl.searchParams.get('case_number')
  if (!case_number) return NextResponse.json({ error: 'case_number لازم است' }, { status: 400 })

  let q = sb().from('ledger_entries')
    .select('id, purpose, method, direction, amount, commission_amount, fee_base_amount, fee_vat_amount, doctor_amount, bank_ref_number, split_applied, note, created_at')
    .eq('tenant_id', a.tenant.id).eq('case_number', case_number)
    .order('created_at', { ascending: false })
  // کارمند فقط پرونده‌های منبع خودش را می‌بیند
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data: entries } = await q

  return NextResponse.json({ entries: entries || [] }, { headers: NO_STORE })
}
