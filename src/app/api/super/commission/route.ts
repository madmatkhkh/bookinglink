import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'
import { getGlobalCommissionPercent } from '@/lib/commission'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// تنظیمات کمیسیون — فقط super-admin.
// GET → درصد سراسری فعلی + لیست متخصص‌هایی که override دارند.
// PATCH { global_percent } → تغییر درصد سراسری.
// PATCH { resource_id, override } → تنظیم/حذف (override=null) کمیسیون یک متخصص.

export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [globalPercent, { data: overrides }] = await Promise.all([
    getGlobalCommissionPercent(),
    sb().from('psy_resource_profiles')
      .select('resource_id, commission_percent_override, resources(name, tenant_id)')
      .not('commission_percent_override', 'is', null),
  ])
  const list = (overrides || []).map(o => {
    const r = Array.isArray(o.resources) ? o.resources[0] : o.resources
    return { resource_id: o.resource_id, override: o.commission_percent_override, resource_name: (r as any)?.name || null }
  })
  return NextResponse.json({ global_percent: globalPercent, overrides: list }, { headers: NO_STORE })
}

export async function PATCH(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))

  // تغییر درصد سراسری
  if (b.global_percent !== undefined) {
    const pct = Number(b.global_percent)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ error: 'درصد نامعتبر است (۰ تا ۱۰۰)' }, { status: 400 })
    const { error } = await sb().from('platform_settings')
      .upsert({ key: 'commission_percent', value: pct, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) { console.error('commission PATCH global error:', error); return NextResponse.json({ error: 'ثبت ناموفق بود' }, { status: 500 }) }
    return NextResponse.json({ success: true })
  }

  // تنظیم/حذف override یک متخصص
  if (b.resource_id) {
    // override می‌تواند عدد باشد یا null (حذف override → بازگشت به سراسری)
    let override: number | null = null
    if (b.override !== null && b.override !== undefined && b.override !== '') {
      const o = Number(b.override)
      if (!Number.isFinite(o) || o < 0 || o > 100) return NextResponse.json({ error: 'درصد نامعتبر است (۰ تا ۱۰۰)' }, { status: 400 })
      override = o
    }
    // psy_resource_profiles ممکن است هنوز ردیف این متخصص را نداشته باشد
    const { error } = await sb().from('psy_resource_profiles')
      .upsert({ resource_id: b.resource_id, commission_percent_override: override }, { onConflict: 'resource_id' })
    if (error) { console.error('commission PATCH override error:', error); return NextResponse.json({ error: 'ثبت ناموفق بود' }, { status: 500 }) }
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'چیزی برای تغییر نیست' }, { status: 400 })
}
