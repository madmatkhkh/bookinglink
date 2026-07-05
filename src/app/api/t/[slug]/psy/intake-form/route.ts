import { NextRequest, NextResponse } from 'next/server'
import { getActiveTenant } from '@/lib/tenant'
import { getIntakeForm, getDefaultResourceId, DEFAULT_INTAKE_FORM } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// فرمِ رزروِ عمومی — resource_id از انتخابگرِ دکتر می‌آید؛ اگر داده نشود (تک‌دکترها)
// پیش‌فرض همان تنها/اولین دکترِ tenant است.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const resourceId = req.nextUrl.searchParams.get('resource_id') || await getDefaultResourceId(t.id)
  if (!resourceId) return NextResponse.json({ form: DEFAULT_INTAKE_FORM })
  const form = await getIntakeForm(resourceId)
  return NextResponse.json({ form })
}
