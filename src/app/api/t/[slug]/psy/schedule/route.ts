import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// برنامه‌ی عمومیِ ماه (روزهای باز و ساعت‌هایشان) برای انتخابِ مراجع
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const q = req.nextUrl.searchParams
  const year = q.get('year'), month = q.get('month')
  const db = sb()
  if (year && month) {
    const padded = month.padStart(2, '0'), unpadded = String(parseInt(month))
    const { data } = await db.from('psy_schedules').select('date, available_times, is_off, slot_types, slot_locs')
      .eq('tenant_id', t.id)
      .or(`date.like.${year}/${padded}/%,date.like.${year}/${unpadded}/%`).order('date')
    return NextResponse.json({ schedules: data || [] }, { headers: NO_STORE })
  }
  const { data } = await db.from('psy_schedules').select('date, available_times, is_off, slot_types, slot_locs')
    .eq('tenant_id', t.id).order('date')
  return NextResponse.json({ schedules: data || [] }, { headers: NO_STORE })
}
