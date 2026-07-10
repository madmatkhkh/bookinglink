import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CATEGORIES = ['bug', 'feature', 'billing', 'other'] as const

// GET → تیکت‌های همین tenant (owner همه را می‌بیند، درمانگر فقط تیکت‌های خودش را)
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  let q = sb().from('support_tickets').select('*').eq('tenant_id', a.tenant.id).order('created_at', { ascending: false })
  if (!a.isOwner) q = q.eq('resource_id', a.resourceId)
  const { data } = await q
  return NextResponse.json({ tickets: data || [] })
}

// POST {subject, message, category} → ثبت تیکت تازه
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  const b = await req.json().catch(() => ({}))

  const subject = String(b.subject || '').trim().slice(0, 150)
  const message = String(b.message || '').trim().slice(0, 4000)
  if (!subject || !message) return NextResponse.json({ error: 'موضوع و متن پیام لازم است' }, { status: 400 })
  const category = CATEGORIES.includes(b.category) ? b.category : 'other'

  let submittedByName = ''
  if (a.isOwner) {
    const { data: profile } = await sb().from('tenant_profiles').select('display_name').eq('tenant_id', a.tenant.id).maybeSingle()
    submittedByName = profile?.display_name || a.tenant.slug
  } else {
    const { data: r } = await sb().from('resources').select('name').eq('id', a.resourceId).maybeSingle()
    submittedByName = r?.name || 'درمانگر'
  }

  const { data, error } = await sb().from('support_tickets').insert({
    tenant_id: a.tenant.id, resource_id: a.isOwner ? null : a.resourceId,
    submitted_by_name: submittedByName, category, subject, message,
  }).select().single()
  if (error) {
    console.error('panel/tickets POST error:', error)
    return NextResponse.json({ error: 'ثبت تیکت ناموفق بود', detail: `${error.code || ''} ${error.message || ''}`.trim() }, { status: 500 })
  }
  return NextResponse.json({ ticket: data })
}
