import { NextRequest, NextResponse } from 'next/server'
import { getActiveTenant } from '@/lib/tenant'
import { clearPanelSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// خروج از پنل — چه owner باشی چه یک کارمند، نشست فعال باطل و کوکی پاک می‌شود
// تا بشود روی همان مرورگر با هویت دیگری (owner ↔ کارمند) دوباره وارد شد.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const res = NextResponse.json({ success: true })
  await clearPanelSession(req, res, t.id)
  return res
}
