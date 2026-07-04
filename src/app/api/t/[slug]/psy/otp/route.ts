import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { phone, code } = await req.json()

  if (!code) {
    const otp = Math.floor(1000 + Math.random() * 9000).toString()
    const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    await sb().from('otps').insert({ phone, code: otp, expires_at })
    return NextResponse.json({ success: true, dev_code: otp })
  }

  const { data } = await sb().from('otps').select('*')
    .eq('phone', phone).eq('code', code).eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).single()
  if (!data) return NextResponse.json({ error: 'کد اشتباه یا منقضی شده' }, { status: 400 })
  await sb().from('otps').update({ used: true }).eq('id', data.id)

  let booking = null
  const { data: byFather } = await sb().from('psy_cases').select('*')
    .eq('tenant_id', t.id).eq('father_phone', phone).order('created_at', { ascending: false }).limit(1).single()
  if (byFather) booking = byFather
  else {
    const { data: byMother } = await sb().from('psy_cases').select('*')
      .eq('tenant_id', t.id).eq('mother_phone', phone).order('created_at', { ascending: false }).limit(1).single()
    booking = byMother
  }
  if (!booking) return NextResponse.json({ error: 'پرونده‌ای با این شماره یافت نشد' }, { status: 404 })
  return NextResponse.json({ success: true, booking })
}
