import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { issueOtp, verifyOtp, normalizePhone, createStaffSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ورودِ کارمند: برخلافِ ورودِ صاحبِ مجموعه (که شماره از قبل روی tenant است)،
// اینجا کاربر شماره‌ی خودش را می‌دهد — چون در یک مجموعه چند نفر پرسنل با
// شماره‌های جدا وجود دارد. کدِ OTP همیشه صادر می‌شود (تا فاش نشود کدام شماره
// عضوِ مجموعه است)؛ فقط در verify مشخص می‌شود آیا resourceی با این شماره هست.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const phone = normalizePhone(body.phone || '')
  if (!/^09\d{9}$/.test(phone)) return NextResponse.json({ error: 'شماره‌ی موبایل معتبر نیست' }, { status: 400 })

  if (!body.code) {
    const code = await issueOtp(phone)
    return NextResponse.json({ success: true, dev_code: code })
  }

  const ok = await verifyOtp(phone, String(body.code))
  if (!ok) return NextResponse.json({ error: 'کد نادرست یا منقضی است' }, { status: 400 })

  const { data: resource } = await sb().from('resources').select('id, is_active')
    .eq('tenant_id', t.id).eq('phone', phone).maybeSingle()
  if (!resource || !resource.is_active)
    return NextResponse.json({ error: 'کارمندی با این شماره در این مجموعه یافت نشد' }, { status: 404 })

  const res = NextResponse.json({ success: true })
  await createStaffSession(res, t.id, resource.id)
  return res
}
