// ─────────────────────────────────────────────────────────────────────────────
// صفحه‌ی عمومیِ متخصص — «کارتِ ویزیتِ» او در وب
// Server Component: سریع‌ترین لودِ ممکن برای بازدیدکننده‌ای که از WebView
// اینستاگرام می‌آید. برندِ صفحه مالِ متخصص است؛ پلتفرم فقط یک خطِ ریزِ پایین.
// ─────────────────────────────────────────────────────────────────────────────
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { sb } from '@/lib/supabase'
import { toFarsiNum } from '@/lib/calendar'
import { MODE_LABEL, PLATFORM_NAME } from '@/lib/config'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function loadTenant(slug: string) {
  const { data: tenant } = await sb().from('tenants')
    .select('id, slug, status').eq('slug', slug).single()
  if (!tenant || tenant.status !== 'active') return null
  const [{ data: profile }, { data: services }] = await Promise.all([
    sb().from('tenant_profiles').select('*').eq('tenant_id', tenant.id).single(),
    sb().from('services').select('id, name, duration_minutes, price, mode, description')
      .eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order').order('created_at'),
  ])
  return { tenant, profile, services: services || [] }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await loadTenant(params.slug)
  if (!data?.profile) return { title: 'یافت نشد' }
  return {
    title: `${data.profile.display_name} — رزروِ نوبت`,
    description: data.profile.title || data.profile.bio?.slice(0, 120) || '',
  }
}

export default async function PublicProfile({ params }: { params: { slug: string } }) {
  const data = await loadTenant(params.slug)
  if (!data || !data.profile) notFound()
  const { profile, services } = data

  return (
    <main className="min-h-screen" style={{ ['--brand' as any]: profile.theme_color }}>
      {/* ── نوارِ برند + آواتارِ نشسته رویش (امضای بصریِ صفحه) ── */}
      <div className="h-36 bg-accent" />
      <div className="max-w-md mx-auto px-5 -mt-14 pb-16">
        <div className="w-28 h-28 rounded-3xl border-4 border-paper bg-sand shadow-md overflow-hidden flex items-center justify-center">
          {profile.avatar_url
            ? /* eslint-disable-next-line @next/next/no-img-element */
              <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
            : <span className="text-4xl">👤</span>}
        </div>

        <h1 className="mt-4 text-2xl font-extrabold leading-tight">{profile.display_name}</h1>
        {profile.title && <p className="mt-1 text-sm text-soot">{profile.title}</p>}

        {(profile.location_text || profile.instagram_handle) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {profile.location_text && (
              <span className="px-3 py-1.5 rounded-full bg-sand text-soot">📍 {profile.location_text}</span>
            )}
            {profile.instagram_handle && (
              <a href={`https://instagram.com/${profile.instagram_handle}`} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-full bg-sand text-soot" dir="ltr">
                {profile.instagram_handle}@
              </a>
            )}
          </div>
        )}

        {profile.bio && (
          <p className="mt-4 text-sm leading-relaxed text-ink/80 whitespace-pre-line">{profile.bio}</p>
        )}

        {/* ── سرویس‌ها ── */}
        <h2 className="mt-8 mb-3 text-xs font-bold text-soot tracking-wide">رزروِ نوبت</h2>
        {services.length === 0 ? (
          <div className="rounded-2xl border border-sand bg-white p-6 text-center text-sm text-soot">
            هنوز سرویسی برای رزرو تعریف نشده است.
          </div>
        ) : (
          <div className="space-y-3">
            {services.map(s => (
              <Link key={s.id} href={`/${params.slug}/book/${s.id}`}
                className="block rounded-2xl border border-sand bg-white p-4 active:scale-[0.99] transition-transform">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold">{s.name}</div>
                    <div className="mt-1 text-xs text-soot">
                      {toFarsiNum(s.duration_minutes)} دقیقه · {MODE_LABEL[s.mode] || s.mode}
                    </div>
                    {s.description && <p className="mt-2 text-xs text-soot leading-relaxed">{s.description}</p>}
                  </div>
                  <div className="text-left shrink-0">
                    <div className="font-extrabold tnum">{toFarsiNum(s.price.toLocaleString('en-US'))}</div>
                    <div className="text-[10px] text-soot">تومان</div>
                  </div>
                </div>
                <div className="mt-3 py-2 rounded-xl bg-accent text-white text-center text-sm font-medium">
                  انتخابِ زمان
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── پانوشت — تنها ردِ پای پلتفرم ── */}
        <div className="mt-10 pt-5 border-t border-sand flex items-center justify-between text-[11px] text-soot">
          <Link href={`/${params.slug}/my`} className="underline underline-offset-4">نوبت‌های من</Link>
          <span>ساخته‌شده با {PLATFORM_NAME}</span>
        </div>
      </div>
    </main>
  )
}
