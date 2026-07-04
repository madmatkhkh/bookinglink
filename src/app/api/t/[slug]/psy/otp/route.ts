import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { issueOtp, verifyOtp, normalizePhone } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const body = await req.json()
  const phone = normalizePhone(body.phone || '')

  if (!body.code) {
    const code = await issueOtp(phone)
    return NextResponse.json({ success: true, dev_code: code })
  }

  const ok = await verifyOtp(phone, String(body.code))
  if (!ok) return NextResponse.json({ error: 'کد اشتباه یا منقضی شده' }, { status: 400 })

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
