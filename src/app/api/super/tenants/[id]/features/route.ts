import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'
import { MULTI_THERAPIST_FEATURE_KEY, CARD_TO_CARD_FEATURE_KEY } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// PATCH { feature_key, enabled } → سوپرادمین هر کلید tenant_features‌ای را
// برای این tenant روشن/خاموش می‌کند (ماژول‌های پنل مراجع، «حالت کلینیک»، ...).
// ⚠️ این روت قبلا از فرانت‌اند صدا زده می‌شد ولی اصلا وجود نداشت (404 بی‌صدا)
// — یعنی سوییچ‌های تب «ماژول‌ها» در /super/[id] عملا کار نمی‌کردند.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = params.id
  const { feature_key, enabled } = await req.json().catch(() => ({}))
  if (!feature_key || typeof feature_key !== 'string')
    return NextResponse.json({ error: 'feature_key لازم است' }, { status: 400 })

  const { data: tenant } = await sb().from('tenants').select('id').eq('id', id).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const { data: existing } = await sb().from('tenant_features').select('tenant_id')
    .eq('tenant_id', id).eq('feature_key', feature_key).maybeSingle()

  // برای «حالت کلینیک»: تصمیم سوپرادمین (چه تایید چه رد دستی) همیشه هر
  // درخواست معلقی را هم پاک می‌کند — دیگر چیزی برای نمایش «در انتظار» نمی‌ماند.
  const patch: Record<string, any> = { enabled: !!enabled }
  if (feature_key === MULTI_THERAPIST_FEATURE_KEY) patch.config = { requested: false }

  const { error } = existing
    ? await sb().from('tenant_features').update(patch).eq('tenant_id', id).eq('feature_key', feature_key)
    : await sb().from('tenant_features').insert({ tenant_id: id, feature_key, ...patch })

  if (error) {
    console.error('super/tenants/[id]/features PATCH error:', error)
    return NextResponse.json({ error: 'ذخیره‌ی تغییرات ناموفق بود' }, { status: 500 })
  }

  // خاموش‌شدن کارت‌به‌کارت: دیتای ذخیره‌شده‌ی درمانگرها هم به فقط-آنلاین برگردانده
  // می‌شود (پاکیزگی) — دفاع واقعی همچنان effectivePaymentMethods در لحظه‌ی مصرف است.
  if (feature_key === CARD_TO_CARD_FEATURE_KEY && !enabled) {
    const { data: resources } = await sb().from('resources').select('id').eq('tenant_id', id)
    const ids = (resources || []).map(r => r.id)
    if (ids.length) {
      const { data: profiles } = await sb().from('psy_resource_profiles')
        .select('resource_id, payment_methods').in('resource_id', ids)
      const needsFixIds = (profiles || [])
        .filter(p => (p.payment_methods as any)?.card_to_card || !(p.payment_methods as any)?.online)
        .map(p => p.resource_id)
      if (needsFixIds.length) {
        await sb().from('psy_resource_profiles')
          .update({ payment_methods: { card_to_card: false, online: true }, updated_at: new Date().toISOString() })
          .in('resource_id', needsFixIds)
      }
    }
  }

  return NextResponse.json({ success: true })
}
