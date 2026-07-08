import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// پنل بعد از لاگین باید بداند صاحبِ مجموعه است یا یک کارمند/منبعِ مشخص —
// تا تبِ «کارمندها» و سوییچرِ منبع را فقط برای owner نشان دهد.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (a.isOwner) return NextResponse.json({ isOwner: true, resourceId: null, resourceName: null, phone: a.tenant.owner_phone, slug: a.tenant.slug })
  const { data } = await sb().from('resources').select('name, phone').eq('id', a.resourceId).maybeSingle()
  return NextResponse.json({ isOwner: false, resourceId: a.resourceId, resourceName: data?.name || null, phone: data?.phone || null, slug: a.tenant.slug })
}
