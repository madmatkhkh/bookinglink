import { NextRequest, NextResponse } from 'next/server'
import { getActiveTenant } from '@/lib/tenant'
import { checkDiscountCode } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ?resource_id=&code=&amount= → فقط پیش‌نمایشِ اعتبار/مبلغ، مصرف را ثبت نمی‌کند
// (redeem فقط در لحظه‌ی نهاییِ پرداختِ واقعی اتفاق می‌افتد)
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ ok: false, error: 'یافت نشد' }, { status: 404 })

  const q = req.nextUrl.searchParams
  const resourceId = q.get('resource_id')
  const code = q.get('code')
  const amount = Number(q.get('amount'))
  if (!resourceId || !code || !Number.isFinite(amount)) return NextResponse.json({ ok: false, error: 'پارامتر ناقص است' }, { status: 400 })

  const result = await checkDiscountCode(resourceId, code, amount)
  return NextResponse.json(result)
}
