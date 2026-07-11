import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// پیام‌های فرم «تماس با ما» لندینگ — فقط سوپرادمین. پاسخ‌دادن داخل سیستم نیست؛
// سوپرادمین با ایمیل خودش جواب می‌دهد و این‌جا فقط خوانده/نخوانده را مدیریت می‌کند.
export async function GET(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await sb().from('contact_messages')
    .select('id, email, message, is_read, created_at')
    .order('created_at', { ascending: false }).limit(200)
  if (error) {
    console.error('super/contact-messages GET error (آیا migration 0024 اجرا شده؟):', error)
    return NextResponse.json({ error: 'خطا در بارگذاری' }, { status: 500 })
  }
  return NextResponse.json({ messages: data || [] })
}

export async function PATCH(req: NextRequest) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, is_read } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id لازم است' }, { status: 400 })
  const { error } = await sb().from('contact_messages').update({ is_read: !!is_read }).eq('id', id)
  if (error) return NextResponse.json({ error: 'ذخیره ناموفق بود' }, { status: 500 })
  return NextResponse.json({ success: true })
}
