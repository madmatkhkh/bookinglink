import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// تنظیمات سطح tenant/برند — چیزی که بین همه‌ی دکترهای این مجموعه مشترک است.
// (نام/عنوان/آواتار/بج/کارت/نوع جلسه دیگر اینجا نیست؛ per-resource‌اند → /panel/psy/profile)
const ALLOWED = ['office_locations'] as const

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const { data } = await sb().from('psy_clinic_settings').select('*').eq('tenant_id', a.tenant.id).maybeSingle()
  return NextResponse.json({ settings: data || null }, { headers: NO_STORE })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  // آدرس‌های مطب مشترک کل مجموعه‌اند — فقط صاحب مجموعه ویرایش می‌کند
  if (!a.isOwner) return NextResponse.json({ error: 'فقط صاحب مجموعه می‌تواند این را تغییر دهد' }, { status: 403 })
  const body = await req.json()
  const patch: Record<string, unknown> = { tenant_id: a.tenant.id, updated_at: new Date().toISOString() }
  for (const k of ALLOWED) if (k in body) patch[k] = body[k]

  const { data: existing } = await sb().from('psy_clinic_settings').select('tenant_id').eq('tenant_id', a.tenant.id).maybeSingle()
  let saveError = null
  if (existing) {
    saveError = (await sb().from('psy_clinic_settings').update(patch).eq('tenant_id', a.tenant.id)).error
  } else {
    saveError = (await sb().from('psy_clinic_settings').insert(patch)).error
  }
  if (saveError) {
    console.error('panel/psy/settings POST error:', saveError)
    return NextResponse.json({ error: 'مشکلی در ذخیره‌ی تنظیمات پیش آمد.', detail: `${saveError.code || ''} ${saveError.message || ''}`.trim() }, { status: 500 })
  }
  return NextResponse.json({ success: true }, { headers: NO_STORE })
}
