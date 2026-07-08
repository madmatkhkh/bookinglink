import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const KEY_PATTERN = /^[a-z][a-z0-9_]{1,29}$/

type RecordFieldInput = { key: string; label: string; type: string; options?: string[] }
type SampleServiceInput = { name: string; duration_minutes: number; price: number; mode: string }

function cleanRecordFields(raw: unknown): RecordFieldInput[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((f: any) => ({
      key: String(f?.key || '').trim(),
      label: String(f?.label || '').trim(),
      type: ['text', 'textarea', 'number', 'select'].includes(f?.type) ? f.type : 'text',
      options: f?.type === 'select' && Array.isArray(f?.options) ? f.options.map((o: any) => String(o).trim()).filter(Boolean) : undefined,
    }))
    .filter(f => f.key && f.label)
}

function cleanFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((k: any) => String(k).trim()).filter(Boolean)
}

function cleanSampleServices(raw: unknown): SampleServiceInput[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s: any) => ({
      name: String(s?.name || '').trim(),
      duration_minutes: Math.max(10, Math.min(480, Number(s?.duration_minutes) || 60)),
      price: Math.max(0, Number(s?.price) || 0),
      mode: ['online', 'in_person', 'both'].includes(s?.mode) ? s.mode : 'both',
    }))
    .filter(s => s.name)
}

// لیستِ کاملِ نیچ‌ها (شاملِ غیرفعال‌ها) + تعدادِ tenantِ هرکدام — برایِ پنلِ مدیریت
export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: niches } = await sb().from('niches').select('*').order('sort_order')
  const { data: tenants } = await sb().from('tenants').select('niche_key')
  const counts = new Map<string, number>()
  for (const t of tenants || []) counts.set(t.niche_key, (counts.get(t.niche_key) || 0) + 1)
  return NextResponse.json({
    niches: (niches || []).map(n => ({ ...n, tenant_count: counts.get(n.key) || 0 })),
  })
}

// ساختِ نیچِ تازه — دیتاییِ کامل: {key, display_name, tagline, icon, client_label,
// resource_label, booking_label, default_theme, record_fields, default_features,
// sample_services, setup_price, sort_order}
export async function POST(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))

  const key = String(b.key || '').trim().toLowerCase()
  if (!KEY_PATTERN.test(key)) return NextResponse.json({ error: 'کلید نامعتبر است (حروفِ لاتینِ کوچک/عدد/آندرلاین، با حرف شروع شود)' }, { status: 400 })
  const displayName = String(b.display_name || '').trim()
  if (!displayName) return NextResponse.json({ error: 'نامِ نمایشی لازم است' }, { status: 400 })

  const row = {
    key,
    display_name: displayName,
    tagline: String(b.tagline || '').trim().slice(0, 200),
    icon: String(b.icon || '').trim().slice(0, 10),
    client_label: String(b.client_label || 'مراجع').trim().slice(0, 30),
    resource_label: String(b.resource_label || 'ارائه‌دهنده').trim().slice(0, 30),
    booking_label: String(b.booking_label || 'نوبت').trim().slice(0, 30),
    default_theme: /^\d{1,3} \d{1,3} \d{1,3}$/.test(String(b.default_theme || '').trim()) ? b.default_theme.trim() : '13 148 136',
    record_fields: cleanRecordFields(b.record_fields),
    default_features: cleanFeatures(b.default_features),
    sample_services: cleanSampleServices(b.sample_services),
    setup_price: Math.max(0, Number(b.setup_price) || 0),
    sort_order: Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : 99,
  }

  const { data: niche, error } = await sb().from('niches').insert(row).select().single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'این کلید قبلاً وجود دارد' }, { status: 409 })
    console.error('super/niches POST error:', error)
    return NextResponse.json({ error: 'ساختِ نیچ ناموفق بود', detail: `${error.code || ''} ${error.message || ''}`.trim() }, { status: 500 })
  }
  return NextResponse.json({ niche })
}

// ویرایشِ نیچِ موجود — {key, ...فیلدهایِ تغییرکرده}. خودِ key قابلِ‌تغییر نیست
// (primary key و مرجعِ tenants.niche_key — تغییرش نیازِ یک مهاجرتِ دستی دارد).
export async function PATCH(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const key = String(b.key || '').trim()
  if (!key) return NextResponse.json({ error: 'key لازم است' }, { status: 400 })

  const patch: Record<string, any> = {}
  if (b.display_name !== undefined) {
    const v = String(b.display_name || '').trim()
    if (!v) return NextResponse.json({ error: 'نامِ نمایشی نمی‌تواند خالی باشد' }, { status: 400 })
    patch.display_name = v
  }
  if (b.tagline !== undefined) patch.tagline = String(b.tagline || '').trim().slice(0, 200)
  if (b.icon !== undefined) patch.icon = String(b.icon || '').trim().slice(0, 10)
  if (b.client_label !== undefined) patch.client_label = String(b.client_label || 'مراجع').trim().slice(0, 30)
  if (b.resource_label !== undefined) patch.resource_label = String(b.resource_label || 'ارائه‌دهنده').trim().slice(0, 30)
  if (b.booking_label !== undefined) patch.booking_label = String(b.booking_label || 'نوبت').trim().slice(0, 30)
  if (b.default_theme !== undefined) {
    if (!/^\d{1,3} \d{1,3} \d{1,3}$/.test(String(b.default_theme || '').trim()))
      return NextResponse.json({ error: 'فرمتِ رنگ درست نیست (سه عددِ R G B با فاصله)' }, { status: 400 })
    patch.default_theme = b.default_theme.trim()
  }
  if (b.record_fields !== undefined) patch.record_fields = cleanRecordFields(b.record_fields)
  if (b.default_features !== undefined) patch.default_features = cleanFeatures(b.default_features)
  if (b.sample_services !== undefined) patch.sample_services = cleanSampleServices(b.sample_services)
  if (b.setup_price !== undefined) patch.setup_price = Math.max(0, Number(b.setup_price) || 0)
  if (b.sort_order !== undefined) patch.sort_order = Number(b.sort_order) || 0
  if (b.is_active !== undefined) patch.is_active = !!b.is_active

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'چیزی برای تغییر نیست' }, { status: 400 })

  const { error } = await sb().from('niches').update(patch).eq('key', key)
  if (error) {
    console.error('super/niches PATCH error:', error)
    return NextResponse.json({ error: 'ذخیره‌ی تغییرات ناموفق بود', detail: `${error.code || ''} ${error.message || ''}`.trim() }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// حذفِ یک نیچ — فقط اگر هیچ tenantی به آن وصل نباشد (وگرنه FK رد می‌کند)
export async function DELETE(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const key = req.nextUrl.searchParams.get('key') || ''
  if (!key) return NextResponse.json({ error: 'key لازم است' }, { status: 400 })

  const { count } = await sb().from('tenants').select('id', { count: 'exact', head: true }).eq('niche_key', key)
  if ((count || 0) > 0) return NextResponse.json({ error: `${count} متخصص از این نیچ استفاده می‌کنند — اول باید غیرفعالش کنی، نه حذف` }, { status: 409 })

  const { error } = await sb().from('niches').delete().eq('key', key)
  if (error) {
    console.error('super/niches DELETE error:', error)
    return NextResponse.json({ error: 'حذف ناموفق بود', detail: `${error.code || ''} ${error.message || ''}`.trim() }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
