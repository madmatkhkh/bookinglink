import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { MULTI_THERAPIST_FEATURE_KEY } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// POST { request: true, note? } → owner یک «درخواست تبدیل به کلینیک» ثبت
// می‌کند (فقط ثبت درخواست — enabled واقعی را فقط سوپرادمین از /super/[id]
// می‌تواند روشن کند، طبق تصمیم صریح صاحب پروژه).
// POST { request: false } → لغو درخواست قبلی (تا وقتی تایید نشده).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ error: 'فقط صاحب مجموعه می‌تواند این را تغییر دهد' }, { status: 403 })

  const { request: wantsRequest, note } = await req.json().catch(() => ({}))

  const { data: existing } = await sb().from('tenant_features').select('tenant_id, enabled')
    .eq('tenant_id', a.tenant.id).eq('feature_key', MULTI_THERAPIST_FEATURE_KEY).maybeSingle()

  // اگر از قبل روشن است (سوپرادمین تاییدش کرده)، دیگر چیزی برای درخواست نیست
  if (existing?.enabled) return NextResponse.json({ error: 'حالت کلینیک از قبل برای شما فعال است' }, { status: 400 })

  const config = wantsRequest
    ? { requested: true, requested_at: new Date().toISOString(), note: String(note || '').trim().slice(0, 300) }
    : { requested: false }

  const { error } = existing
    ? await sb().from('tenant_features').update({ config }).eq('tenant_id', a.tenant.id).eq('feature_key', MULTI_THERAPIST_FEATURE_KEY)
    : await sb().from('tenant_features').insert({ tenant_id: a.tenant.id, feature_key: MULTI_THERAPIST_FEATURE_KEY, enabled: false, config })

  if (error) {
    console.error('panel/multi-therapist POST error:', error)
    return NextResponse.json({ error: 'ذخیره‌ی تغییرات ناموفق بود' }, { status: 500 })
  }
  return NextResponse.json({ success: true, requested: !!wantsRequest })
}
