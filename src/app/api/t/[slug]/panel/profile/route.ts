import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { toLatinNum } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { data } = await sb().from('tenant_profiles').select('*').eq('tenant_id', t.id).single()
  return NextResponse.json({ profile: data, slug: t.slug })
}

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const b = await req.json()

  // theme_color: تریپلت «R G B»
  let theme = String(b.theme_color || '').trim()
  if (!/^\d{1,3} \d{1,3} \d{1,3}$/.test(theme)) theme = '13 148 136'

  const patch = {
    display_name: String(b.display_name || '').trim().slice(0, 60),
    title: String(b.title || '').trim().slice(0, 80),
    bio: String(b.bio || '').slice(0, 600),
    avatar_url: String(b.avatar_url || '').slice(0, 500) || null,
    theme_color: theme,
    location_text: String(b.location_text || '').trim().slice(0, 80),
    instagram_handle: String(b.instagram_handle || '').trim().replace(/^@/, '').slice(0, 40) || null,
    card_number: toLatinNum(String(b.card_number || '')).replace(/[^0-9]/g, '').slice(0, 16),
    card_holder_name: String(b.card_holder_name || '').trim().slice(0, 60),
  }
  if (!patch.display_name) return NextResponse.json({ error: 'نام نمایشی لازم است' }, { status: 400 })

  const { error } = await sb().from('tenant_profiles').update(patch).eq('tenant_id', t.id)
  if (error) { console.error('src/app/api/t/[slug]/panel/profile/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }
  return NextResponse.json({ success: true })
}
