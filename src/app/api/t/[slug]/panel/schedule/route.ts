import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { toLatinNum, timeKey, minutesToTime } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// نرمال‌سازیِ 'H:MM' ورودی به قالبِ کانونیکِ 'HH:MM' لاتین
function canonTime(t: string): string | null {
  const k = timeKey(toLatinNum(String(t || '')))
  if (k <= 0 || k >= 24 * 60) return null
  return minutesToTime(k)
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const [{ data: weekly }, { data: overrides }] = await Promise.all([
    sb().from('weekly_schedules').select('*').eq('tenant_id', t.id).order('weekday').order('start_time'),
    sb().from('schedule_overrides').select('*').eq('tenant_id', t.id).order('date'),
  ])
  return NextResponse.json({ weekly: weekly || [], overrides: overrides || [] })
}

// PUT: جایگزینیِ کاملِ الگوی هفتگی — { weekly: [{weekday, start_time, end_time, mode}] }
export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { weekly } = await req.json()
  if (!Array.isArray(weekly)) return NextResponse.json({ error: 'weekly لازم است' }, { status: 400 })

  const rows = []
  for (const r of weekly) {
    const weekday = parseInt(toLatinNum(r.weekday))
    const start = canonTime(r.start_time), end = canonTime(r.end_time)
    if (isNaN(weekday) || weekday < 0 || weekday > 6 || !start || !end)
      return NextResponse.json({ error: 'ردیفِ نامعتبر در برنامه‌ی هفتگی' }, { status: 400 })
    if (timeKey(start) >= timeKey(end))
      return NextResponse.json({ error: `بازه‌ی ${start} تا ${end} نامعتبر است` }, { status: 400 })
    rows.push({
      tenant_id: t.id, weekday, start_time: start, end_time: end,
      mode: ['online', 'in_person', 'both'].includes(r.mode) ? r.mode : 'both',
    })
  }

  // جایگزینیِ اتمیک‌نما: اول درجِ ردیف‌های نو، بعد حذفِ قدیمی‌ها — تا شکستِ درج، برنامه را خالی نکند
  const before = await sb().from('weekly_schedules').select('id').eq('tenant_id', t.id)
  const oldIds = (before.data || []).map(r => r.id)
  if (rows.length) {
    const { error } = await sb().from('weekly_schedules').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (oldIds.length) await sb().from('weekly_schedules').delete().in('id', oldIds)
  return NextResponse.json({ success: true })
}

// POST: افزودنِ استثنا — فاز ۱ فقط تعطیلی: { date: 'YYYY/MM/DD' }
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { date } = await req.json()
  const d = toLatinNum(String(date || ''))
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(d)) return NextResponse.json({ error: 'تاریخ نامعتبر' }, { status: 400 })
  const { data, error } = await sb().from('schedule_overrides')
    .insert({ tenant_id: t.id, date: d, type: 'closed' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ override: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { id } = await req.json()
  await sb().from('schedule_overrides').delete().eq('id', id).eq('tenant_id', t.id)
  return NextResponse.json({ success: true })
}
