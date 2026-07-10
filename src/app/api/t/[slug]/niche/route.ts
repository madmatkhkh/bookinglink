import { NextRequest, NextResponse } from 'next/server'
import { getActiveTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// نیچ یک tenant — عمومی و سبک، فقط برای تصمیم روتینگ پنل
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  return NextResponse.json({ niche_key: t.niche_key })
}
