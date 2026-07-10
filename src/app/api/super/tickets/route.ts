import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// همه‌ی تیکت‌ها، جدیدترین اول — به‌همراه نام/slug tenant برای نمایش
export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const status = req.nextUrl.searchParams.get('status')
  let q = sb().from('support_tickets')
    .select('*, tenants(slug, tenant_profiles(display_name))')
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data } = await q
  const tickets = (data || []).map((t: any) => {
    const tenant = Array.isArray(t.tenants) ? t.tenants[0] : t.tenants
    const profile = tenant ? (Array.isArray(tenant.tenant_profiles) ? tenant.tenant_profiles[0] : tenant.tenant_profiles) : null
    const { tenants: _drop, ...rest } = t
    return { ...rest, tenant_slug: tenant?.slug || null, tenant_display_name: profile?.display_name || null }
  })
  return NextResponse.json({ tickets })
}

// PATCH {id, status?, admin_reply?}
export async function PATCH(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  if (!b.id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  if (b.status !== undefined) {
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(b.status))
      return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
    patch.status = b.status
  }
  if (b.admin_reply !== undefined) patch.admin_reply = String(b.admin_reply || '').trim().slice(0, 4000)

  const { error } = await sb().from('support_tickets').update(patch).eq('id', b.id)
  if (error) {
    console.error('super/tickets PATCH error:', error)
    return NextResponse.json({ error: 'ذخیره‌ی تغییرات ناموفق بود', detail: `${error.code || ''} ${error.message || ''}`.trim() }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
