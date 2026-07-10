import { NextResponse } from 'next/server'
import { listNiches } from '@/lib/niche'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// عمومی: تمپلیت‌های موجود برای نمایش در لندینگ — شامل غیرفعال‌ها هم (برای
// نشان‌دادن «به‌زودی»)؛ انتخاب/ثبت‌نام واقعی سمت فرانت‌اند برای is_active=false
// غیرفعال می‌شود.
export async function GET() {
  const niches = await listNiches()
  // فقط فیلدهای لازم لندینگ (نه record_fields و جزئیات داخلی)
  return NextResponse.json({
    niches: niches.map(n => ({
      key: n.key, display_name: n.display_name, tagline: n.tagline,
      icon: n.icon, default_theme: n.default_theme, setup_price: n.setup_price,
      is_active: n.is_active,
    })),
  })
}
