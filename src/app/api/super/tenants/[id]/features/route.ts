import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'

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

  const { error } = existing
    ? await sb().from('tenant_features').update({ enabled: !!enabled }).eq('tenant_id', id).eq('feature_key', feature_key)
    : await sb().from('tenant_features').insert({ tenant_id: id, feature_key, enabled: !!enabled })

  if (error) {
    console.error('super/tenants/[id]/features PATCH error:', error)
    return NextResponse.json({ error: 'ذخیره‌ی تغییرات ناموفق بود' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
