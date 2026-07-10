// ─────────────────────────────────────────────────────────────────────────────
// میدل‌ور دامنه‌ی اختصاصی — تا امروز getTenantByDomain و مدیریت custom_domain
// در پنل super وجود داشت ولی هیچ‌چیزی درخواست‌های دامنه‌ی اختصاصی را به مسیر
// /{slug} نگاشت نمی‌کرد؛ یعنی قابلیت عملا مرده بود. این میدل‌ور آن حلقه‌ی گم‌شده است:
//
//   clinic-x.com/…  →  rewrite به  nobatlink.com/{slug}/…  (URL کاربر عوض نمی‌شود)
//
// نکات:
//   • فقط برای هاست‌هایی غیر از دامنه‌ی خود پلتفرم (PLATFORM_DOMAIN) و *.vercel.app
//     فعال می‌شود — روی دامنه‌ی اصلی هیچ سرباری ندارد.
//   • فقط domain_verified=true و tenant active نگاشت می‌شود (همان قواعد getTenantByDomain).
//   • lookup با یک fetch سبک به REST خود Supabase انجام می‌شود (کلاینت کامل
//     supabase-js در edge لازم نیست) + کش درون-نمونه‌ای ۶۰ثانیه‌ای تا هر
//     درخواست یک رفت‌وبرگشت دیتابیس نخورد.
//   • مسیرهای /api و /_next دست نمی‌خورند تا API ها همان قرارداد /api/t/{slug}
//     را نگه دارند (صفحات خودشان با همان slug صدا می‌زنند).
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'

const CACHE_TTL_MS = 60 * 1000
const domainCache = new Map<string, { slug: string | null; at: number }>()

function platformHosts(): string[] {
  const d = (process.env.PLATFORM_DOMAIN || 'nobatlink.com').trim().toLowerCase()
  const hosts = ['localhost']
  if (d) { hosts.push(d, `www.${d}`) }
  return hosts
}

async function lookupSlug(host: string): Promise<string | null> {
  const cached = domainCache.get(host)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.slug

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) return null
  try {
    const url = `${base}/rest/v1/tenants?select=slug&custom_domain=eq.${encodeURIComponent(host)}&domain_verified=is.true&status=eq.active&limit=1`
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    const rows = res.ok ? await res.json() : []
    const slug: string | null = Array.isArray(rows) && rows[0]?.slug ? rows[0].slug : null
    domainCache.set(host, { slug, at: Date.now() })
    return slug
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase()
  if (!host || platformHosts().includes(host) || host.endsWith('.vercel.app'))
    return NextResponse.next()

  const slug = await lookupSlug(host)
  if (!slug) return NextResponse.next()

  const url = req.nextUrl.clone()
  // اگر مسیر از قبل با همان slug شروع می‌شود (مثلا لینک‌های داخلی خود اپ)، دوباره پیشوند نزن
  if (url.pathname === `/${slug}` || url.pathname.startsWith(`/${slug}/`))
    return NextResponse.next()
  url.pathname = `/${slug}${url.pathname === '/' ? '' : url.pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  // api و فایل‌های استاتیک از میدل‌ور رد نمی‌شوند
  matcher: ['/((?!api|_next/static|_next/image|fonts|favicon.ico|icon.svg|og.png|robots.txt).*)'],
}
