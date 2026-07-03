import { NextRequest, NextResponse } from 'next/server'
import { getActiveTenant } from '@/lib/tenant'
import { sb } from '@/lib/supabase'
import { issueOtp, verifyOtp, createPanelSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  if (!body.code) {
    const code = await issueOtp(t.owner_phone)
    return NextResponse.json({ success: true, dev_code: code })
  }

  const ok = await verifyOtp(t.owner_phone, String(body.code))
  if (!ok) return NextResponse.json({ error: 'کد نادرست یا منقضی است' }, { status: 400 })

  // تضمین: هر tenant حداقل یک منبع دارد (تک‌نفره‌ها یک منبعِ «خودم»)
  const { data: existing } = await sb().from('resources').select('id').eq('tenant_id', t.id).limit(1)
  if (!existing || existing.length === 0) {
    const { data: prof } = await sb().from('tenant_profiles').select('display_name').eq('tenant_id', t.id).single()
    await sb().from('resources').insert({
      tenant_id: t.id, name: prof?.display_name || 'خودم', is_selectable: true, sort_order: 0,
    })
  }

  const res = NextResponse.json({ success: true })
  await createPanelSession(res, t.id)
  return res
}
