import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { FLOW } from '@/lib/flow'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function genCase(): string {
  return `PRV-${Math.floor(1000 + Math.random() * 9000)}`
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { data, error } = await sb().from('psy_cases').select('*')
    .eq('tenant_id', t.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookings: data })
}

// افزودنِ پرونده‌ی دستی توسطِ دکتر
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const b = await req.json()
  if (!b.child_name?.trim()) return NextResponse.json({ error: 'نام لازم است' }, { status: 400 })
  if (!(b.father_phone?.trim() || b.mother_phone?.trim() || b.phone?.trim()))
    return NextResponse.json({ error: 'حداقل یک شماره تماس لازم است' }, { status: 400 })

  let caseNumber = genCase()
  for (let i = 0; i < 6; i++) {
    const { data } = await sb().from('psy_cases').select('id')
      .eq('tenant_id', t.id).eq('case_number', caseNumber).maybeSingle()
    if (!data) break
    caseNumber = genCase()
  }

  const details = b.details && typeof b.details === 'object' ? b.details : {}
  const row: Record<string, any> = {
    tenant_id: t.id,
    case_number: caseNumber,
    child_name: b.child_name.trim(),
    birth_date: b.birth_date || '',
    reason: b.reason || 'افزوده‌شده به‌صورت دستی',
    father_name: b.father_name || '',
    father_phone: b.father_phone || '',
    mother_name: b.mother_name || '',
    mother_phone: b.mother_phone || '',
    parent_name: b.father_name || b.mother_name || '',
    phone: b.father_phone || b.mother_phone || b.phone || '',
    details: { ...details, grade: b.grade || '', home_address: b.home_address || '', extra_notes: b.extra_notes || '' },
    flow_status: FLOW.PACKAGE_ASSIGNED,
    status: 'confirmed',
    session_type: b.session_type || 'offline',
    booking_date: '', booking_time: '',
  }
  const { data, error } = await sb().from('psy_cases').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, booking: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  // ستون‌های واقعیِ psy_cases که مستقیم قابلِ ویرایش‌اند
  const ALLOWED = [
    'status', 'doctor_notes', 'flow_status', 'reject_reason',
    'interview_paid', 'assessment_paid', 'assessment_price', 'interview_price',
    'interview_date', 'interview_time', 'assessment_date', 'assessment_time',
    'interview_notes', 'assessment_notes', 'interview_held', 'assessment_held',
    'child_name', 'child_name_en', 'birth_date', 'reason',
    'father_name', 'father_phone', 'mother_name', 'mother_phone',
    'parent_name', 'phone', 'session_type', 'office_location',
  ]
  const patch: Record<string, any> = {}
  for (const k of ALLOWED) if (body[k] !== undefined) patch[k] = body[k]
  // فیلدهای تفصیلی داخلِ details (jsonb) — ادغام با موجود
  if (body.details && typeof body.details === 'object') {
    const { data: cur } = await sb().from('psy_cases').select('details')
      .eq('id', id).eq('tenant_id', t.id).single()
    patch.details = { ...(cur?.details || {}), ...body.details }
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'چیزی برای بروزرسانی نیست' }, { status: 400 })

  const { error } = await sb().from('psy_cases').update(patch).eq('id', id).eq('tenant_id', t.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// حذفِ کاملِ پرونده + جلسه‌ها و پکیج‌ها
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })

  const { data: c } = await sb().from('psy_cases').select('case_number')
    .eq('id', id).eq('tenant_id', t.id).single()
  if (c?.case_number) {
    await sb().from('psy_sessions').delete().eq('tenant_id', t.id).eq('case_number', c.case_number)
    await sb().from('psy_packages').delete().eq('tenant_id', t.id).eq('case_number', c.case_number)
  }
  const { error } = await sb().from('psy_cases').delete().eq('id', id).eq('tenant_id', t.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
