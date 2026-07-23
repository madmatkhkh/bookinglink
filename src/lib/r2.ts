import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

// ─── Cloudflare R2 (S3-compatible) — برای آپلود عکس پروفایل متخصص‌ها ───────
// R2 دقیقا همان API استاندارد S3 را پیاده می‌کند، پس هیچ SDK مخصوصی لازم
// نیست — فقط endpoint را به آدرس اکانت R2 اشاره می‌کنیم.
//
// آپلود از سرور خودمان انجام می‌شود (نه مستقیم از مرورگر با presigned URL) —
// چون: (1) آپلود مستقیم مرورگر نیازمند تنظیم CORS policy روی خود bucket است
// (پیچیدگی راه‌اندازی اضافه که در عمل اولین چیزی بود که خطا داد)، و (2) عکس‌ها
// قبل از ارسال سمت مرورگر crop/فشرده می‌شوند (معمولا زیر ~100KB)، پس رد شدن
// از سرور هیچ هزینه‌ی قابل‌توجهی ندارد و خطاهایش هم قابل‌کنترل‌تر است.
//
// این متغیرهای محیطی باید از Cloudflare Dashboard → R2 → Manage API tokens
// گرفته و در .env.local / تنظیمات Vercel ست شوند:
//   R2_ACCOUNT_ID          — شناسه‌ی اکانت کلادفلر (در صفحه‌ی Overview R2 هست)
//   R2_ACCESS_KEY_ID        — از API token ساخته‌شده برای R2
//   R2_SECRET_ACCESS_KEY    — همراه همان token (فقط یک‌بار نمایش داده می‌شود)
//   R2_BUCKET_NAME          — اسم باکت
//   R2_PUBLIC_URL           — دامنه‌ی عمومی سرو فایل‌ها، بدون اسلش آخر
//                             (https://images.nobatlink.com)
function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

const BUCKET = () => process.env.R2_BUCKET_NAME!

export function r2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_URL)
}

// آدرس عمومی نهایی فایل — همان که در avatar_url ذخیره و به مراجع نشان داده می‌شود
export function r2PublicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  return `${base}/${key}`
}

// آپلود بایت‌ها از سمت سرور
export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<void> {
  await r2Client().send(new PutObjectCommand({
    Bucket: BUCKET(), Key: key, Body: body, ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable', // کلید هر آپلود یکتاست (timestamp دارد)، پس کش بلندمدت امن است
  }))
}

// حذف عکس قبلی وقتی متخصص عکس تازه آپلود می‌کند یا عکس را برمی‌دارد — تمیز
// نگه‌داشتن باکت (رایگان تا 10 گیگ، ولی دلیلی ندارد فایل یتیم جمع شود).
export async function deleteFromR2(key: string): Promise<void> {
  try {
    await r2Client().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }))
  } catch (e) {
    console.error('deleteFromR2 error:', e)
  }
}

// از یک avatar_url ذخیره‌شده، کلید داخل باکت را استخراج می‌کند (برای حذف)؛
// اگر آدرس اصلا مال R2 ما نبود (مثلا لینک قدیمی دستی)، null برمی‌گرداند تا
// اشتباهی چیز دیگری حذف نشود.
export function keyFromPublicUrl(url: string): string | null {
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  if (!base || !url.startsWith(base + '/')) return null
  return url.slice(base.length + 1)
}
