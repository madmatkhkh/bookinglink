import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { toLatinNum } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function cleanService(body: any) {
  return {
    name: String(body.name || '').trim().slice(0, 80),
    duration_minutes: Math.max(10, Math.min(480, parseInt(toLatinNum(body.duration_minutes)) || 60)),
    price: Math.max(0, parseInt(toLatinNum(body.price)) || 0),
    mode: ['online', 'in_person', 'both'].includes(body.mode) ? body.mode : 'online',
    description: String(body.description || '').slice(0, 300),
    is_active: body.is_active !== false,
    sort_order: parseInt(toLatinNum(body.sort_order)) || 0,
  }
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { data } = await sb().from('services').select('*').eq('tenant_id', t.id)
    .order('sort_order').order('created_at')
  return NextResponse.json({ services: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const s = cleanService(await req.json())
  if (!s.name) return NextResponse.json({ error: 'نامِ سرویس لازم است' }, { status: 400 })
  const { data, error } = await sb().from('services').insert({ ...s, tenant_id: t.id }).select().single()
  if (error) { console.error('src/app/api/t/[slug]/panel/services/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }
  return NextResponse.json({ service: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const body = await req.json()
  if (!body.id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })
  const s = cleanService(body)
  if (!s.name) return NextResponse.json({ error: 'نامِ سرویس لازم است' }, { status: 400 })
  const { data, error } = await sb().from('services').update(s)
    .eq('id', body.id).eq('tenant_id', t.id).select().single()
  if (error) { console.error('src/app/api/t/[slug]/panel/services/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }
  return NextResponse.json({ service: data })
}

// حذفِ نرم: غیرفعال می‌کنیم تا رزروهای قدیمی که به سرویس ارجاع دارند نشکنند
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { id } = await req.json()
  await sb().from('services').update({ is_active: false }).eq('id', id).eq('tenant_id', t.id)
  return NextResponse.json({ success: true })
}
