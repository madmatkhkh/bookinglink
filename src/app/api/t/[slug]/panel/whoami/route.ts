import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { MULTI_THERAPIST_FEATURE_KEY } from '@/lib/psy'
import { getEnabledModules } from '@/lib/modules'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// پنل بعد از لاگین باید بداند صاحب مجموعه است یا یک کارمند/منبع مشخص —
// تا تب «کارمندها» و سوییچر منبع را فقط برای owner نشان دهد. multiTherapist
// هم مشخص می‌کند اصلا «حالت کلینیک» برای این مجموعه روشن است یا نه — پیش‌فرض
// خاموش (تک‌درمانگر)، چون اکثریت tenantها تک‌نفره‌اند و تب تیم برایشان بلااستفاده‌ست.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a

  const [{ data: feature }, enabled] = await Promise.all([
    sb().from('tenant_features').select('enabled, config')
      .eq('tenant_id', a.tenant.id).eq('feature_key', MULTI_THERAPIST_FEATURE_KEY).maybeSingle(),
    getEnabledModules(a.tenant.id, a.tenant.plan),
  ])
  const multiTherapist = !!feature?.enabled
  const multiTherapistRequested = !multiTherapist && !!(feature?.config as any)?.requested
  // نقشه‌ی کامل ماژول‌های فعال (فاز 3) — پنل سایدبار/زیرتب‌ها را از روی همین می‌سازد.
  // قبل از migration 0029 نقشه خالی است و کلاینت fail-open (همه روشن) رفتار می‌کند.
  const modules: Record<string, boolean> = {}
  enabled.forEach((v, k) => { modules[k] = v })

  if (a.isOwner) return NextResponse.json({ isOwner: true, resourceId: null, resourceName: null, phone: a.tenant.owner_phone, slug: a.tenant.slug, multiTherapist, multiTherapistRequested, modules })
  const { data } = await sb().from('resources').select('name, phone').eq('id', a.resourceId).maybeSingle()
  return NextResponse.json({ isOwner: false, resourceId: a.resourceId, resourceName: data?.name || null, phone: data?.phone || null, slug: a.tenant.slug, multiTherapist, multiTherapistRequested, modules })
}
