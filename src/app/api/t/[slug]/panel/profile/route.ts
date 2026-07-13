import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanel, isTenantResponse } from '@/lib/tenant'
import { toLatinNum } from '@/lib/calendar'
import { deleteFromR2, keyFromPublicUrl } from '@/lib/r2'
import { parseRgbTriplet, rgbToTriplet, ensureContrastOnWhite, DEFAULT_SAFE_THEME } from '@/lib/theme'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const { data } = await sb().from('tenant_profiles').select('*').eq('tenant_id', t.id).single()
  return NextResponse.json({ profile: data, slug: t.slug })
}

export async function PUT(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await requirePanel(req, params.slug)
  if (isTenantResponse(t)) return t
  const b = await req.json()

  // theme_color: تریپلت «R G B» — صرف‌نظر از این‌که رنگ از grid پیش‌فرض آمده یا
  // از استخراج لوگو، دوباره از فیلتر کنتراست رد می‌شود (دفاع دوم سمت سرور؛
  // فرانت‌اند هم قبل از ارسال همین تضمین را اعمال می‌کند، ولی چون این ستون
  // نهایتا مستقیم در bg-accent/text-accent استفاده می‌شود، هیچ مقداری بدون
  // عبور از این فیلتر ذخیره نمی‌شود).
  const parsedTheme = parseRgbTriplet(String(b.theme_color || ''))
  const theme = parsedTheme ? rgbToTriplet(ensureContrastOnWhite(parsedTheme).rgb) : DEFAULT_SAFE_THEME

  const themeMode = b.theme_mode === 'logo' ? 'logo' : 'preset'
  const logoUrl = String(b.logo_url || '').trim().slice(0, 500) || null

  const patch = {
    display_name: String(b.display_name || '').trim().slice(0, 60),
    title: String(b.title || '').trim().slice(0, 80),
    bio: String(b.bio || '').slice(0, 600),
    avatar_url: String(b.avatar_url || '').slice(0, 500) || null,
    theme_color: theme,
    theme_mode: themeMode,
    logo_url: logoUrl,
    location_text: String(b.location_text || '').trim().slice(0, 80),
    instagram_handle: String(b.instagram_handle || '').trim().replace(/^@/, '').slice(0, 40) || null,
    card_number: toLatinNum(String(b.card_number || '')).replace(/[^0-9]/g, '').slice(0, 16),
    card_holder_name: String(b.card_holder_name || '').trim().slice(0, 60),
  }
  if (!patch.display_name) return NextResponse.json({ error: 'نام نمایشی لازم است' }, { status: 400 })

  // اگر لوگو عوض/حذف شده، آدرس قبلی را قبل از overwrite نگه می‌داریم تا بعد از
  // ذخیره‌ی موفق، فایل یتیم قبلی از R2 پاک شود (همان الگوی avatar_url).
  let prevLogoUrl: string | null = null
  const { data: existing } = await sb().from('tenant_profiles').select('logo_url').eq('tenant_id', t.id).maybeSingle()
  prevLogoUrl = existing?.logo_url || null

  const { error } = await sb().from('tenant_profiles').update(patch).eq('tenant_id', t.id)
  if (error) { console.error('src/app/api/t/[slug]/panel/profile/route.ts error:', error); return NextResponse.json({ error: 'مشکلی پیش آمد. دوباره تلاش کنید.' }, { status: 500 }) }

  if (prevLogoUrl && prevLogoUrl !== patch.logo_url) {
    const oldKey = keyFromPublicUrl(prevLogoUrl)
    if (oldKey) await deleteFromR2(oldKey)
  }

  return NextResponse.json({ success: true })
}
