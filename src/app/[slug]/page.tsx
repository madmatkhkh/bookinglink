// ─────────────────────────────────────────────────────────────────────────────
// صفحه‌ی عمومی متخصص — بر اساس نیچ شاخه می‌زند:
//  • روانشناسی → کارت ورود به مصاحبه‌ی اولیه + پنل مراجع (سبک psych-booking)
//  • بقیه‌ی نیچ‌ها → لیست سرویس‌ها برای رزرو مستقیم
// Server Component برای سریع‌ترین لود از WebView اینستاگرام.
// ─────────────────────────────────────────────────────────────────────────────
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { sb } from '@/lib/supabase'
import { toFarsiNum } from '@/lib/calendar'
import { MODE_LABEL, PLATFORM_NAME } from '@/lib/config'
import { getClinicSettings, listPublicDoctors } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function loadTenant(slug: string) {
 const { data: tenant } = await sb().from('tenants')
  .select('id, slug, status, niche_key, plan').eq('slug', slug).single()
 if (!tenant || tenant.status !== 'active') return null
 return tenant
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
 const tenant = await loadTenant(params.slug)
 if (!tenant) return { title: 'یافت نشد' }
 if (tenant.niche_key === 'psychology') {
  const [doctors] = await Promise.all([listPublicDoctors(tenant.id, tenant.plan)])
  const primary = doctors[0]
  const title = `${primary?.name || 'رزرو نوبت'} — نوبت‌دهی`
  const description = primary?.title || ''
  // og: وقتی دکتر لینکش را در واتساپ/تلگرام/اینستاگرام می‌فرستد، کارت preview تمیز نشان داده شود
  return { title, description, openGraph: { title, description, type: 'website', locale: 'fa_IR' } }
 }
 const { data: profile } = await sb().from('tenant_profiles').select('display_name, title, bio').eq('tenant_id', tenant.id).single()
 return {
    title: `${profile?.display_name || 'رزرو نوبت'} — رزرو نوبت`,
    description: profile?.title || profile?.bio?.slice(0, 120) || '',
    openGraph: {
      title: `${profile?.display_name || 'رزرو نوبت'} — رزرو نوبت`,
      description: profile?.title || profile?.bio?.slice(0, 120) || '',
      type: 'website', locale: 'fa_IR',
    },
  }
}

export default async function PublicProfile({ params }: { params: { slug: string } }) {
 const tenant = await loadTenant(params.slug)
 if (!tenant) notFound()

 // ── نیچ روانشناسی: تجربه‌ی مصاحبه/پنل مراجع ──
 if (tenant.niche_key === 'psychology') {
  const [clinic, doctors] = await Promise.all([getClinicSettings(tenant.id), listPublicDoctors(tenant.id, tenant.plan)])
  const primary = doctors[0]
  const c = {
   office_locations: clinic.office_locations,
   doctor_name: primary?.name || '', doctor_title: primary?.title || '',
   avatar_url: primary?.avatar_url || '', badges: primary?.badges || [],
   rating_avg: primary?.rating_avg || 0, rating_count: primary?.rating_count || 0,
  }
  return <PsychologyLanding slug={params.slug} c={c} />
 }

 // ── بقیه‌ی نیچ‌ها: لیست سرویس‌ها ──
 const [{ data: profile }, { data: services }] = await Promise.all([
  sb().from('tenant_profiles').select('*').eq('tenant_id', tenant.id).single(),
  sb().from('services').select('id, name, duration_minutes, price, mode, description')
   .eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order').order('created_at'),
 ])
 if (!profile) notFound()
 return <GenericLanding slug={params.slug} profile={profile} services={services || []} />
}

// ═══ لندینگ روانشناسی (سبک psych-booking، ریسپانسیو) ═══════════════
function PsychologyLanding({ slug, c }: { slug: string; c: any }) {
 return (
  <div className="min-h-screen bg-paper flex items-center justify-center p-4">
   <div className="max-w-sm w-full">
    <div className="text-center mb-8">
     <div className="w-20 h-20 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-3 text-3xl overflow-hidden">
      {c.avatar_url
       ? /* eslint-disable-next-line @next/next/no-img-element */
        <img src={c.avatar_url} alt={c.doctor_name} className="w-full h-full object-cover" />
       : ''}
     </div>
     <h1 className="text-xl font-display font-bold text-ink mb-1">{c.doctor_name || 'پنل نوبت‌دهی'}</h1>
     {c.doctor_title && <p className="text-sm text-soot">{c.doctor_title}</p>}
     {c.rating_count > 0 && (
      <p className="text-xs text-amber-600 mt-1.5">★ {c.rating_avg.toFixed(1)} <span className="text-soot">({toFarsiNum(c.rating_count)} نظر)</span></p>
     )}
     {c.badges?.length > 0 && (
      <div className="flex gap-2 justify-center mt-3 flex-wrap">
       {c.badges.map((b: string, i: number) => (
        <span key={i} className="text-xs px-3 py-1 bg-white border border-sand rounded-lg text-soot">{b}</span>
       ))}
      </div>
     )}
    </div>

    <div className="space-y-3">
     <Link href={`/${slug}/interview`}
      className="block bg-white rounded-2xl border border-sand p-5 hover:border-accent transition-colors">
      <div className="flex items-center gap-4">
       <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl shrink-0"></div>
       <div className="flex-1">
        <div className="font-medium text-ink text-sm mb-0.5">مصاحبه‌ی اولیه</div>
        <div className="text-xs text-soot">مراجع جدید؟ فرم را پر کنید و وقت مصاحبه بگیرید</div>
       </div>
       <div className="text-sand text-lg">←</div>
      </div>
     </Link>

     <Link href={`/${slug}/my`}
      className="block bg-white rounded-2xl border border-sand p-5 hover:border-accent transition-colors">
      <div className="flex items-center gap-4">
       <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl shrink-0"></div>
       <div className="flex-1">
        <div className="font-medium text-ink text-sm mb-0.5">ورود به پنل مراجع</div>
        <div className="text-xs text-soot">قبلا پرونده دارید؟ با شماره‌ی موبایل وارد شوید</div>
       </div>
       <div className="text-sand text-lg">←</div>
      </div>
     </Link>
    </div>

    <p className="text-center text-xs text-soot/70 mt-6">برای شروع درمان، ابتدا مصاحبه‌ی اولیه انجام می‌شود.</p>
    <p className="text-center text-[11px] text-soot/50 mt-4">ساخته‌شده با {PLATFORM_NAME}</p>
   </div>
  </div>
 )
}

// ═══ لندینگ جنریک (سرویس‌محور) ══════════════════════════════════════
function GenericLanding({ slug, profile, services }: { slug: string; profile: any; services: any[] }) {
 return (
  <main className="min-h-screen" style={{ ['--brand' as any]: profile.theme_color }}>
   <div className="h-36 bg-accent" />
   <div className="max-w-md mx-auto px-5 -mt-14 pb-16">
    <div className="w-28 h-28 rounded-3xl border-4 border-paper bg-sand shadow-md overflow-hidden flex items-center justify-center">
     {profile.avatar_url
      ? /* eslint-disable-next-line @next/next/no-img-element */
       <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
      : <span className="text-4xl"></span>}
    </div>

    <h1 className="mt-4 text-2xl font-display font-extrabold leading-tight">{profile.display_name}</h1>
    {profile.title && <p className="mt-1 text-sm text-soot">{profile.title}</p>}

    {(profile.location_text || profile.instagram_handle) && (
     <div className="mt-3 flex flex-wrap gap-2 text-xs">
      {profile.location_text && (
       <span className="px-3 py-1.5 rounded-full bg-sand text-soot">{profile.location_text}</span>
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

    <h2 className="mt-8 mb-3 text-xs font-bold text-soot tracking-wide">رزرو نوبت</h2>
    {services.length === 0 ? (
     <div className="rounded-2xl border border-sand bg-white p-6 text-center text-sm text-soot">
      هنوز سرویسی برای رزرو تعریف نشده است.
     </div>
    ) : (
     <div className="space-y-3">
      {services.map(s => (
       <Link key={s.id} href={`/${slug}/book/${s.id}`}
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
         انتخاب زمان
        </div>
       </Link>
      ))}
     </div>
    )}

    <div className="mt-10 pt-5 border-t border-sand flex items-center justify-between text-[11px] text-soot">
     <Link href={`/${slug}/my`} className="underline underline-offset-4">نوبت‌های من</Link>
     <span>ساخته‌شده با {PLATFORM_NAME}</span>
    </div>
   </div>
  </main>
 )
}
