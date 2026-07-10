import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { MULTI_THERAPIST_FEATURE_KEY } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// POST { enabled } → روشن/خاموش‌کردن «حالت کلینیک» توسط خودِ owner (بدون نیاز
// به سوپرادمین) — فقط تب «تیم/درمانگرها» را نمایش/مخفی می‌کند، هیچ دیتایی
// حذف یا لمس نمی‌شود؛ کاملا برگشت‌پذیر.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ error: 'فقط صاحب مجموعه می‌تواند این را تغییر دهد' }, { status: 403 })

  const { enabled } = await req.json().catch(() => ({}))

  const { data: existing } = await sb().from('tenant_features').select('tenant_id')
    .eq('tenant_id', a.tenant.id).eq('feature_key', MULTI_THERAPIST_FEATURE_KEY).maybeSingle()

  const { error } = existing
    ? await sb().from('tenant_features').update({ enabled: !!enabled })
        .eq('tenant_id', a.tenant.id).eq('feature_key', MULTI_THERAPIST_FEATURE_KEY)
    : await sb().from('tenant_features').insert({ tenant_id: a.tenant.id, feature_key: MULTI_THERAPIST_FEATURE_KEY, enabled: !!enabled })

  if (error) {
    console.error('panel/multi-therapist POST error:', error)
    return NextResponse.json({ error: 'ذخیره‌ی تغییرات ناموفق بود' }, { status: 500 })
  }
  return NextResponse.json({ success: true, enabled: !!enabled })
}
