import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getDefaultResourceId } from '@/lib/psy'
import { timeKey } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0, must-revalidate' }

// روزی که در آن ساعتی از قبل رزرو شده (توسطِ همین یا هر مراجعِ دیگر) → آن ساعت
// از available_times حذف می‌شود، نه فقط علامت‌گذاری. قاعده‌ی کلیِ حریمِ خصوصی:
// تقویمِ مراجع هرگز نباید نشان بدهد کدام ساعت‌ها را «کسِ دیگری» گرفته — نه با
// نام، نه حتی بدونِ نام (وگرنه صرفِ تلاش‌وخطا برایِ پیداکردنِ ساعتِ خالی هم
// می‌توانست الگویِ رزروهایِ دیگران را لو بدهد). پس ساعتِ گرفته‌شده اصلاً در لیست
// نمی‌آید — از نظرِ مراجع، انگار هیچ‌وقت وجود نداشته.
async function bookedSlotKeys(tenantId: string, resourceId: string, year: string, month: string): Promise<Set<string>> {
  const padded = month.padStart(2, '0'), unpadded = String(parseInt(month))
  const db = sb()
  const [{ data: sessions }, { data: stages }] = await Promise.all([
    db.from('psy_sessions').select('session_date, session_time')
      .eq('tenant_id', tenantId).eq('resource_id', resourceId).eq('status', 'confirmed')
      .or(`session_date.like.${year}/${padded}/%,session_date.like.${year}/${unpadded}/%`),
    db.from('psy_stages').select('session_date, session_time')
      .eq('tenant_id', tenantId).eq('resource_id', resourceId).eq('status', 'booked')
      .or(`session_date.like.${year}/${padded}/%,session_date.like.${year}/${unpadded}/%`),
  ])
  const keys = new Set<string>()
  for (const row of [...(sessions || []), ...(stages || [])]) {
    if (!row.session_date || !row.session_time) continue
    const day = row.session_date.split('/')[2]
    if (!day) continue
    keys.add(`${parseInt(day)}|${timeKey(row.session_time)}`)
  }
  return keys
}

// برنامه‌ی عمومیِ ماه (روزهای باز و ساعت‌هایشان) برای انتخابِ مراجع — حالا per-resource.
// اگر resource_id داده نشود (UIِ فعلی نمی‌دهد)، پیش‌فرض همان تنها/اولین دکترِ tenant است.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const q = req.nextUrl.searchParams
  const year = q.get('year'), month = q.get('month')
  const resourceId = q.get('resource_id') || await getDefaultResourceId(t.id)
  if (!resourceId) return NextResponse.json({ schedules: [] }, { headers: NO_STORE })
  const db = sb()
  if (year && month) {
    const padded = month.padStart(2, '0'), unpadded = String(parseInt(month))
    const { data } = await db.from('psy_schedules').select('date, available_times, is_off, slot_types, slot_locs')
      .eq('tenant_id', t.id).eq('resource_id', resourceId)
      .or(`date.like.${year}/${padded}/%,date.like.${year}/${unpadded}/%`).order('date')
    const booked = await bookedSlotKeys(t.id, resourceId, year, month)
    const schedules = (data || []).map(s => {
      if (!s.available_times?.length || !booked.size) return s
      const day = parseInt(s.date.split('/')[2])
      return { ...s, available_times: s.available_times.filter((tm: string) => !booked.has(`${day}|${timeKey(tm)}`)) }
    })
    return NextResponse.json({ schedules }, { headers: NO_STORE })
  }
  const { data } = await db.from('psy_schedules').select('date, available_times, is_off, slot_types, slot_locs')
    .eq('tenant_id', t.id).eq('resource_id', resourceId).order('date')
  return NextResponse.json({ schedules: data || [] }, { headers: NO_STORE })
}
