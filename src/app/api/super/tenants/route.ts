import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed, normalizePhone } from '@/lib/auth'
import { RESERVED_SLUGS, SLUG_PATTERN } from '@/lib/config'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: tenants } = await sb().from('tenants')
    .select('id, slug, status, plan, owner_phone, created_at, tenant_profiles(display_name)')
    .order('created_at', { ascending: false })
  return NextResponse.json({ tenants: tenants || [] })
}

// ساختِ tenant تازه: {slug, owner_phone, display_name}
export async function POST(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json()

  const slug = String(b.slug || '').trim().toLowerCase()
  if (!SLUG_PATTERN.test(slug)) return NextResponse.json({ error: 'slug نامعتبر است (حروفِ لاتینِ کوچک، عدد، خطِ تیره)' }, { status: 400 })
  if (RESERVED_SLUGS.includes(slug)) return NextResponse.json({ error: 'این slug رزروِ سیستم است' }, { status: 400 })
  const phone = normalizePhone(b.owner_phone)
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایلِ متخصص معتبر نیست' }, { status: 400 })

  const { data: tenant, error } = await sb().from('tenants')
    .insert({ slug, owner_phone: phone }).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این slug قبلاً گرفته شده' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await sb().from('tenant_profiles').insert({
    tenant_id: tenant.id, display_name: String(b.display_name || '').trim().slice(0, 60),
  })
  return NextResponse.json({ tenant })
}

// {id, status: 'active' | 'suspended'}
export async function PATCH(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, status } = await req.json()
  if (!['active', 'suspended'].includes(status))
    return NextResponse.json({ error: 'وضعیت نامعتبر' }, { status: 400 })
  await sb().from('tenants').update({ status }).eq('id', id)
  return NextResponse.json({ success: true })
}
