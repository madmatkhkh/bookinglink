import { NextRequest, NextResponse } from 'next/server'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { uploadToR2, r2PublicUrl, r2Configured } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_BYTES = 4 * 1024 * 1024

// POST (multipart/form-data: file) → { public_url }
// آپلود لوگو/برند در سطح tenant (نه resource) — فقط owner، برای استخراج رنگ تم
// در حالت «logo» و نمایش در تنظیمات ظاهر. حذف فایل قبلی این‌جا انجام نمی‌شود؛
// وقتی logo_url تازه واقعا در panel/profile ذخیره شود، همان‌جا فایل یتیم قبلی
// پاک می‌شود (دقیقا همان الگوی upload-avatar).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t

  if (!r2Configured()) {
    console.error('upload-logo: متغیرهای محیطی R2 تنظیم نشده‌اند')
    return NextResponse.json({ error: 'آپلود عکس هنوز راه‌اندازی نشده — بعدا امتحان کن' }, { status: 500 })
  }

  const fd = await req.formData().catch(() => null)
  const file = fd?.get('file')
  if (!fd || !(file instanceof File)) return NextResponse.json({ error: 'فایلی دریافت نشد' }, { status: 400 })

  const ext = ALLOWED_TYPES[file.type]
  if (!ext) return NextResponse.json({ error: 'فقط عکس JPG، PNG یا WebP مجاز است' }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'حجم عکس باید کمتر از 4 مگابایت باشد' }, { status: 400 })

  const key = `logos/${t.id}-${Date.now()}.${ext}`

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    await uploadToR2(key, buf, file.type)
    return NextResponse.json({ public_url: r2PublicUrl(key) })
  } catch (e) {
    console.error('upload-logo R2 error:', e)
    return NextResponse.json({ error: 'آپلود به فضای ذخیره‌سازی ناموفق بود — دوباره امتحان کن' }, { status: 500 })
  }
}
