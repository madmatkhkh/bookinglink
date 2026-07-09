import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeName(s: string): string {
  return String(s || '').trim().replace(/\s+/g, ' ')
}
function normalizePhone(s: string): string {
  return String(s || '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim()
}

// چک می‌کند آیا پرونده‌ای با همین «نامِ مراجع + شماره‌تماس» از قبل ثبت شده — تا
// مراجع قبل از پرکردنِ کلِ فرم بفهمد، نه بعدِ زدنِ دکمه‌ی نهایی.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  const { clientName, phone } = await req.json()
  const name = normalizeName(clientName)
  const ph = normalizePhone(phone)
  if (!name || !ph) return NextResponse.json({ exists: false })

  const { data } = await sb().from('psy_cases').select('id')
    .eq('tenant_id', t.id).eq('client_name', name).eq('contact_phone', ph).maybeSingle()
  return NextResponse.json({ exists: !!data })
}
