import { NextRequest, NextResponse } from 'next/server'
import { getActiveTenant } from '@/lib/tenant'
import { getClinicSettings } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// تنظیماتِ عمومیِ کلینیک برای صفحه‌های سمتِ مراجع (نام دکتر، کارت‌ها، مطب‌ها، مدها)
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const settings = await getClinicSettings(t.id)
  return NextResponse.json({ settings })
}
