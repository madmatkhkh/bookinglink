import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { uploadToR2, r2PublicUrl, r2Configured } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MAX_BYTES = 4 * 1024 * 1024 // 4MB — فرانت‌اند قبل از ارسال crop/فشرده می‌کند (معمولا <100KB)

// POST (multipart/form-data: file, resource_id?) → { public_url }
// آپلود از سرور رد می‌شود (نه presigned URL مستقیم مرورگر) — دلیلش در lib/r2.ts.
// owner می‌تواند برای هر منبع خودش آپلود کند (resource_id)، کارمند فقط برای خودش.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a

  if (!r2Configured()) {
    console.error('upload-avatar: متغیرهای محیطی R2 تنظیم نشده‌اند (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME/R2_PUBLIC_URL)')
    return NextResponse.json({ error: 'آپلود عکس هنوز راه‌اندازی نشده — بعدا امتحان کن' }, { status: 500 })
  }

  const fd = await req.formData().catch(() => null)
  const file = fd?.get('file')
  if (!fd || !(file instanceof File)) return NextResponse.json({ error: 'فایلی دریافت نشد' }, { status: 400 })

  const ext = ALLOWED_TYPES[file.type]
  if (!ext) return NextResponse.json({ error: 'فقط عکس JPG، PNG یا WebP مجاز است' }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'حجم عکس باید کمتر از 4 مگابایت باشد' }, { status: 400 })

  // تعیین منبع هدف — همان منطق panel/psy/profile
  let targetId: string | null = null
  if (a.isOwner) {
    const requested = String(fd.get('resource_id') || '')
    if (requested) {
      const { data: r } = await sb().from('resources').select('id').eq('id', requested).eq('tenant_id', a.tenant.id).maybeSingle()
      if (!r) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
      targetId = r.id
    } else {
      const { data } = await sb().from('resources').select('id').eq('tenant_id', a.tenant.id)
        .order('sort_order').order('created_at').limit(1).maybeSingle()
      targetId = data?.id || null
    }
  } else {
    targetId = a.resourceId
  }
  if (!targetId) return NextResponse.json({ error: 'منبعی یافت نشد' }, { status: 404 })

  // کلید یکتا به‌ازای هر آپلود (timestamp) → کش مرورگر/CDN هیچ‌وقت نسخه‌ی کهنه
  // نشان نمی‌دهد. حذف فایل قبلی وقتی انجام می‌شود که avatar_url تازه واقعا در
  // پروفایل ذخیره شود (panel/psy/profile POST)، نه این‌جا.
  const key = `avatars/${a.tenant.id}/${targetId}-${Date.now()}.${ext}`

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    await uploadToR2(key, buf, file.type)
    return NextResponse.json({ public_url: r2PublicUrl(key) })
  } catch (e) {
    console.error('upload-avatar R2 error:', e)
    return NextResponse.json({ error: 'آپلود به فضای ذخیره‌سازی ناموفق بود — دوباره امتحان کن' }, { status: 500 })
  }
}
