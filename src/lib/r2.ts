import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ─── Cloudflare R2 (S3-compatible) — برای آپلود عکس پروفایل متخصص‌ها ───────
// R2 دقیقا همان API استاندارد S3 را پیاده می‌کند، پس هیچ SDK مخصوصی لازم
// نیست — فقط endpoint را به آدرس اکانت R2 اشاره می‌کنیم.
//
// این چهار متغیر محیطی باید از Cloudflare Dashboard → R2 → Manage API tokens
// (یا با wrangler) گرفته و در .env.local / تنظیمات Vercel ست شوند:
//   R2_ACCOUNT_ID          — شناسه‌ی اکانت کلادفلر (در آدرس داشبورد هم هست)
//   R2_ACCESS_KEY_ID        — از API token ساخته‌شده برای R2
//   R2_SECRET_ACCESS_KEY    — همراه همان token
//   R2_BUCKET_NAME          — اسم باکتی که ساختی (مثلا nobatlink-uploads)
//   R2_PUBLIC_URL           — دامنه‌ی عمومی سرو فایل‌ها، بدون اسلش آخر
//                             (همان ساب‌دامین سفارشی‌ای که وصل کردی:
//                             https://images.nobatlink.com)
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

// آدرس عمومی نهایی فایل — همان که در avatar_url ذخیره و به مراجع نشان داده می‌شود
export function r2PublicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  return `${base}/${key}`
}

// URL موقت (۵ دقیقه) که مرورگر مستقیم با PUT به آن آپلود می‌کند — بدون این‌که
// بایت‌های فایل از سرور خودمان رد شوند (سریع‌تر و برای این کار درست‌تر است).
export async function createUploadUrl(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType })
  return getSignedUrl(r2Client(), cmd, { expiresIn: 300 })
}

// حذف عکس قبلی وقتی متخصص عکس تازه آپلود می‌کند یا عکس را برمی‌دارد — تمیز
// نگه‌داشتن باکت (رایگان تا ۱۰ گیگ، ولی دلیلی ندارد فایل یتیم جمع شود).
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
