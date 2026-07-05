import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { mergeResourceProfile, mergeCancellationPolicy, mergePaymentMethods } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// پروفایلِ per-resource: نام/عنوان/آواتار (روی خودِ resources) + بج/نوعِ
// جلسه/کارت (روی psy_resource_profiles). owner می‌تواند با ?resource_id=
// پروفایلِ هرکسی را ببیند/ویرایش کند؛ کارمند همیشه فقط پروفایلِ خودش را.

async function resolveTargetId(req: NextRequest, tenantId: string, isOwner: boolean, ownResourceId: string | null): Promise<string | null> {
  if (!isOwner) return ownResourceId
  const q = req.nextUrl.searchParams.get('resource_id')
  if (q) return q
  // owner بدونِ resource_id: اگر فقط یک منبع دارد همان پیش‌فرض است (تک‌دکترها)
  const { data } = await sb().from('resources').select('id').eq('tenant_id', tenantId)
    .order('sort_order').order('created_at').limit(1).maybeSingle()
  return data?.id || null
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const targetId = await resolveTargetId(req, a.tenant.id, a.isOwner, a.resourceId)
  if (!targetId) return NextResponse.json({ error: 'منبعی یافت نشد' }, { status: 404 })

  const { data: r } = await sb().from('resources').select('id, name, title, avatar_url, phone')
    .eq('id', targetId).eq('tenant_id', a.tenant.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { data: p } = await sb().from('psy_resource_profiles').select('*').eq('resource_id', targetId).maybeSingle()
  const prof = mergeResourceProfile(targetId, p)

  return NextResponse.json({
    profile: { resource_id: r.id, name: r.name, title: r.title, avatar_url: r.avatar_url, phone: r.phone,
      badges: prof.badges, session_modes: prof.session_modes, cards: prof.cards,
      cancellation_policy: prof.cancellation_policy, payment_methods: prof.payment_methods },
  }, { headers: NO_STORE })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const body = await req.json()
  const targetId = a.isOwner ? (body.resource_id || await resolveTargetId(req, a.tenant.id, true, null)) : a.resourceId
  if (!targetId) return NextResponse.json({ error: 'منبعی یافت نشد' }, { status: 404 })

  const { data: r } = await sb().from('resources').select('id').eq('id', targetId).eq('tenant_id', a.tenant.id).maybeSingle()
  if (!r) return NextResponse.json({ error: 'به این منبع دسترسی ندارید' }, { status: 403 })

  const resourcePatch: Record<string, unknown> = {}
  for (const k of ['name', 'title', 'avatar_url'] as const) if (k in body) resourcePatch[k] = body[k]
  if (Object.keys(resourcePatch).length) {
    const { error } = await sb().from('resources').update(resourcePatch).eq('id', targetId).eq('tenant_id', a.tenant.id)
    if (error) { console.error('src/app/api/t/[slug]/panel/psy/profile/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }
  }

  const profilePatch: Record<string, unknown> = { resource_id: targetId, updated_at: new Date().toISOString() }
  for (const k of ['badges', 'session_modes', 'cards'] as const) if (k in body) profilePatch[k] = body[k]
  if ('cancellation_policy' in body) profilePatch.cancellation_policy = mergeCancellationPolicy(body.cancellation_policy)
  if ('payment_methods' in body) {
    const pm = mergePaymentMethods(body.payment_methods)
    if (!pm.card_to_card && !pm.online)
      return NextResponse.json({ error: 'حداقل یک روشِ پرداخت باید فعال بماند' }, { status: 400 })
    profilePatch.payment_methods = pm
  }
  if (Object.keys(profilePatch).length > 2) {
    const { data: existing } = await sb().from('psy_resource_profiles').select('resource_id').eq('resource_id', targetId).maybeSingle()
    const q = existing
      ? sb().from('psy_resource_profiles').update(profilePatch).eq('resource_id', targetId)
      : sb().from('psy_resource_profiles').insert(profilePatch)
    const { error } = await q
    if (error) { console.error('src/app/api/t/[slug]/panel/psy/profile/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }
  }
  return NextResponse.json({ success: true }, { headers: NO_STORE })
}
