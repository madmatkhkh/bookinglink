import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { createUploadUrl, r2PublicUrl } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
}
const MAX_BYTES = 4 * 1024 * 1024 // 4MB — کافی برای عکس پروفایل؛ فرانت‌اند هم قبل از آپلود ریسایز می‌کند

// همان منطق resolveTargetId در panel/psy/profile — owner می‌تواند برای هر
// منبعی آپلود کند (با resource_id در بادی)، کارمند همیشه فقط برای خودش.
async function resolveTargetId(req: NextRequest, body: any, tenantId: string, isOwner: boolean, ownResourceId: string | null): Promise<string | null> {
  if (!isOwner) return ownResourceId
  if (body.resource_id) return body.resource_id
  const { data } = await sb().from('resources').select('id').eq('tenant_id', tenantId)
    .order('sort_order').order('created_at').limit(1).maybeSingle()
  return data?.id || null
}

// POST { fileType, fileSize, resource_id? } → { upload_url, public_url }
// فرانت‌اند با PUT مستقیم فایل را به upload_url می‌فرستد (بدون رد شدن از سرور
// ما)، بعد public_url را با patchProfile روی avatar_url ذخیره می‌کند.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_URL) {
    console.error('upload-url: متغیرهای محیطی R2 تنظیم نشده‌اند (R2_ACCOUNT_ID/R2_BUCKET_NAME/R2_PUBLIC_URL/...)')
    return NextResponse.json({ error: 'آپلود عکس هنوز راه‌اندازی نشده — بعدا امتحان کن' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const ext = ALLOWED_TYPES[body.fileType]
  if (!ext) return NextResponse.json({ error: 'فقط عکس JPG، PNG یا WebP مجاز است' }, { status: 400 })
  const fileSize = Number(body.fileSize) || 0
  if (fileSize <= 0 || fileSize > MAX_BYTES) return NextResponse.json({ error: 'حجم عکس باید کمتر از 4 مگابایت باشد' }, { status: 400 })

  const targetId = await resolveTargetId(req, body, a.tenant.id, a.isOwner, a.resourceId)
  if (!targetId) return NextResponse.json({ error: 'منبعی یافت نشد' }, { status: 404 })
  // اگر owner برای کارمند دیگری آپلود می‌کند، مطمئن شویم آن منبع واقعا مال همین tenant است
  if (a.isOwner) {
    const { data: r } = await sb().from('resources').select('id').eq('id', targetId).eq('tenant_id', a.tenant.id).maybeSingle()
    if (!r) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })
  }

  // کلید یکتا و پایدار به ازای هر منبع — timestamp باعث می‌شود مرورگرها/CDN
  // نسخه‌ی قبلی را کش نکنند. عکس قبلی وقتی واقعا حذف می‌شود که avatar_url تازه
  // با موفقیت در پروفایل ذخیره شود (پایین‌تر در panel/psy/profile) — نه این‌جا،
  // چون این مرحله فقط لینک آپلود می‌سازد و معلوم نیست آپلود واقعا موفق شود.
  const key = `avatars/${a.tenant.id}/${targetId}-${Date.now()}.${ext}`

  try {
    const uploadUrl = await createUploadUrl(key, body.fileType)
    return NextResponse.json({ upload_url: uploadUrl, public_url: r2PublicUrl(key) })
  } catch (e) {
    console.error('upload-url presign error:', e)
    return NextResponse.json({ error: 'ساخت لینک آپلود ناموفق بود' }, { status: 500 })
  }
}
