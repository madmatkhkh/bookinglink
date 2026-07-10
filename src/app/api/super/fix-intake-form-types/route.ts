import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// یک‌بار-اجرا: فرم‌هایی که قبل از اضافه‌شدن نوع‌های «تاریخ» و «شماره‌تماس»
// ذخیره شده بودند، هنوز birth_date/mother_phone را به‌عنوان متن ساده دارند —
// چون تغییر DEFAULT_INTAKE_FORM در کد فقط روی فرم‌های تازه اثر می‌گذارد، نه
// فرم‌هایی که از قبل در دیتابیس ذخیره شده‌اند. این route همه‌شان را یک‌جا اصلاح می‌کند.
export async function POST(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rows, error } = await sb().from('psy_intake_forms').select('resource_id, schema')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  for (const row of rows || []) {
    const schema = row.schema as { sections?: any[] } | null
    if (!schema?.sections) continue
    let changed = false
    for (const section of schema.sections) {
      for (const field of section.fields || []) {
        if (field.id === 'birth_date' && field.type === 'text') { field.type = 'date'; delete field.placeholder; changed = true }
        if (field.id === 'mother_phone' && field.type === 'text') { field.type = 'phone'; delete field.placeholder; changed = true }
      }
    }
    if (changed) {
      await sb().from('psy_intake_forms').update({ schema, updated_at: new Date().toISOString() }).eq('resource_id', row.resource_id)
      updated++
    }
  }

  return NextResponse.json({ success: true, checked: (rows || []).length, updated })
}
