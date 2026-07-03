import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { toLatinNum, timeKey, minutesToTime } from '@/lib/calendar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function canonTime(t: string): string | null {
  const k = timeKey(toLatinNum(String(t || '')))
  if (k <= 0 || k >= 24 * 60) return null
  return minutesToTime(k)
}

// تاییدِ اینکه این منبع مالِ همین tenant است
async function ownsResource(tenantId: string, resourceId: string): Promise<boolean> {
  const { data } = await sb().from('resources').select('id').eq('id', resourceId).eq('tenant_id', tenantId).single()
  return !!data
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

// PUT: جایگزینیِ برنامه‌ی یک منبعِ مشخص — { resource_id, weekly: [...] }
export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { resource_id, weekly } = await req.json()
  if (!resource_id || !await ownsResource(t.id, resource_id))
    return NextResponse.json({ error: 'منبع نامعتبر' }, { status: 400 })
  if (!Array.isArray(weekly)) return NextResponse.json({ error: 'weekly لازم است' }, { status: 400 })

  const rows = []
  for (const r of weekly) {
    const weekday = parseInt(toLatinNum(r.weekday))
    const start = canonTime(r.start_time), end = canonTime(r.end_time)
    if (isNaN(weekday) || weekday < 0 || weekday > 6 || !start || !end)
      return NextResponse.json({ error: 'ردیفِ نامعتبر' }, { status: 400 })
    if (timeKey(start) >= timeKey(end))
      return NextResponse.json({ error: `بازه‌ی ${start} تا ${end} نامعتبر است` }, { status: 400 })
    rows.push({
      tenant_id: t.id, resource_id, weekday, start_time: start, end_time: end,
      mode: ['online', 'in_person', 'both'].includes(r.mode) ? r.mode : 'both',
    })
  }

  // فقط ردیف‌های همین منبع جایگزین می‌شوند
  const before = await sb().from('weekly_schedules').select('id')
    .eq('tenant_id', t.id).eq('resource_id', resource_id)
  const oldIds = (before.data || []).map(r => r.id)
  if (rows.length) {
    const { error } = await sb().from('weekly_schedules').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (oldIds.length) await sb().from('weekly_schedules').delete().in('id', oldIds)
  return NextResponse.json({ success: true })
}

// POST: بستنِ یک روز برای یک منبع — { resource_id, date }
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { resource_id, date } = await req.json()
  if (!resource_id || !await ownsResource(t.id, resource_id))
    return NextResponse.json({ error: 'منبع نامعتبر' }, { status: 400 })
  const d = toLatinNum(String(date || ''))
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(d)) return NextResponse.json({ error: 'تاریخ نامعتبر' }, { status: 400 })
  const { data, error } = await sb().from('schedule_overrides')
    .insert({ tenant_id: t.id, resource_id, date: d, type: 'closed' }).select().single()
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
