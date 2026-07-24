'use client'
import { ClinicSettings, SessionMode } from '@/lib/settings'
import { MEET_METHODS, MEET_META, meetHref } from '@/lib/meet'
import { uiAlert } from '@/components/ui/Dialog'
import { Glyph } from '@/components/Glyph'
import ThemeModePicker from '@/components/ThemeModePicker'
import { DEFAULT_SAFE_THEME } from '@/lib/theme'
import { genId, SkeletonRows } from '../shared'
import type { ResourceProfileView, SettingsSub } from './types'

// ── تنظیمات: پروفایل عمومی + ظاهر ────────────────────────────────────────────
//
// سومین برش از تب تنظیمات. شامل: هویت متخصص (نام/عنوان/آواتار/بج‌ها)، نوع
// جلسه (حضوری/آنلاین) و کانال‌های آنلاین، مکان‌های حضوری، و انتخاب تم رنگی.
//
// چرا «پروفایل» و «ظاهر» با هم: هر دو owner-only بخش‌های هویتی/برندی‌اند و
// در سایدبار هم کنار هم می‌نشینند؛ جداکردنشان یعنی دو ماژول با prop تقریبا
// یکسان.
//
// مثل SettingsPayments، بلوک‌ها در والد با هم درهم بودند و اینجا گروه شدند —
// چون هم‌زمان فقط یک زیرتب رندر می‌شود، این هیچ تغییر بصری نمی‌دهد.
export default function SettingsProfile({
 sub, profile, patchProfile, settings, patchSettings,
 themeProfile, patchTheme, saveTheme, themeLoaded, themeSaving, themeSaved,
 avatarInputRef, avatarUploading, handleAvatarFile, isOwner, slug,
}: {
 sub: SettingsSub | null
 profile: ResourceProfileView
 patchProfile: (p: Partial<ResourceProfileView>) => void
 settings: ClinicSettings
 patchSettings: (p: Partial<ClinicSettings>) => void
 themeProfile: any
 patchTheme: (p: any) => void
 saveTheme: () => void
 themeLoaded: boolean
 themeSaving: boolean
 themeSaved: boolean
 avatarInputRef: React.RefObject<HTMLInputElement>
 avatarUploading: boolean
 handleAvatarFile: (f: File | undefined | null) => void
 isOwner: boolean
 slug: string
}) {
 const settingsSubTab = sub
 const me = { isOwner }
 return (
  <>
  {settingsSubTab === 'profile' && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">پروفایل عمومی</h2>
   <p className="text-xs text-soot mb-4">دقیقا همین‌طور بالای صفحه‌ی مصاحبه به مراجع نمایش داده می‌شود — روی هرکدام بزنید تا ویرایش کنید.</p>

   <div className="bg-gray-50 rounded-2xl p-6 text-center">
    <div className="relative w-24 h-24 rounded-full bg-sand border border-sand flex items-center justify-center mx-auto text-3xl overflow-hidden shrink-0 group cursor-pointer"
     onClick={() => !avatarUploading && avatarInputRef.current?.click()}>
     <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
      onChange={e => { handleAvatarFile(e.target.files?.[0]); e.target.value = '' }} />
     {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : ''}
     <div className={`absolute inset-0 bg-black/40 flex items-center justify-center text-white text-[10px] transition-opacity ${avatarUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
      {avatarUploading ? 'در حال آپلود...' : 'تغییر عکس'}
     </div>
    </div>
    <div className="flex items-center justify-center gap-4 mt-2 mb-3">
     <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}
      className="text-xs text-soot hover:text-ink underline underline-offset-4 disabled:opacity-50">
      {profile.avatar_url ? 'تغییر عکس' : 'افزودن عکس'}
     </button>
     {profile.avatar_url && (
      <button type="button" onClick={() => patchProfile({ avatar_url: '' })} disabled={avatarUploading}
       className="text-xs text-red-600 hover:text-red-700 underline underline-offset-4 disabled:opacity-50">
       حذف عکس
      </button>
     )}
    </div>
    <input value={profile.name} onChange={e => patchProfile({ name: e.target.value })} placeholder="نام"
     className="text-lg font-medium text-ink text-center bg-transparent border-b border-dashed border-gray-300 hover:border-gray-400 focus:outline-none focus:border-ink w-full max-w-[260px] mx-auto block py-0.5" />
    <input value={profile.title} onChange={e => patchProfile({ title: e.target.value })} placeholder="عنوان / تخصص"
     className="text-sm text-soot text-center bg-transparent border-b border-dashed border-transparent hover:border-gray-300 focus:outline-none focus:border-ink w-full max-w-[260px] mx-auto block mt-1 py-0.5" />
    <div className="flex gap-2 justify-center mt-3 flex-wrap">
     {profile.badges.map((b, i) => (
      <span key={i} className="text-xs pl-1.5 pr-3 py-1 bg-white border border-sand rounded-lg text-soot flex items-center gap-1">
       <input value={b} size={Math.max(b.length, 3)}
        onChange={e => { const next = [...profile.badges]; next[i] = e.target.value; patchProfile({ badges: next }) }}
        className="bg-transparent focus:outline-none text-soot" />
       <button onClick={() => patchProfile({ badges: profile.badges.filter((_, j) => j !== i) })}
        className="text-gray-300 hover:text-soot leading-none">×</button>
      </span>
     ))}
     <button onClick={() => patchProfile({ badges: [...profile.badges, 'نشان جدید'] })}
      className="text-xs px-3 py-1 border border-dashed border-gray-300 rounded-lg text-soot hover:border-gray-400 hover:text-soot">
      + نشان
     </button>
    </div>
   </div>
  </section>
  )}

  {settingsSubTab === 'profile' && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">نوع جلسات قابل ارائه</h2>
   <p className="text-xs text-soot mb-4">تعیین می‌کند مراجع هنگام رزرو چه گزینه‌هایی ببیند.</p>
   <div className="grid grid-cols-3 gap-2">
    {([
     ['both', '', 'هردو'],
     ['online', '', 'فقط آنلاین'],
     ['offline', '', 'فقط حضوری'],
    ] as [SessionMode, string, string][]).map(([val, icon, label]) => (
     <button key={val} onClick={() => patchProfile({ session_modes: val })}
      className={`p-3 rounded-xl border text-center transition-all ${
       profile.session_modes === val
        ? 'border-ink border-2 bg-sand'
        : 'border-sand hover:border-gray-300'}`}>
      <div className="mb-1 flex justify-center"><Glyph icon={icon} className="w-6 h-6" /></div>
      <div className="text-xs font-medium text-ink">{label}</div>
     </button>
    ))}
   </div>

   <div className="border-t border-sand mt-4 pt-4">
    <h3 className="text-xs font-medium text-ink mb-1">مدت زمان جلسات</h3>
    <p className="text-xs text-soot mb-3">صرفا نمایشی/مرجع است — روی ساعت‌های قابل‌رزرو اثر نمی‌گذارد.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
     <div>
      <label className="text-xs text-soot mb-1 block">مدت جلسه‌ی آنلاین (دقیقه)</label>
      <input type="number" min={1} value={profile.pricing.duration_online}
       onChange={e => patchProfile({ pricing: { ...profile.pricing, duration_online: Math.max(1, Number(e.target.value) || 1) } })}
       className="w-24 text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
     </div>
     <div>
      <label className="text-xs text-soot mb-1 block">مدت جلسه‌ی حضوری (دقیقه)</label>
      <input type="number" min={1} value={profile.pricing.duration_offline}
       onChange={e => patchProfile({ pricing: { ...profile.pricing, duration_offline: Math.max(1, Number(e.target.value) || 1) } })}
       className="w-24 text-sm px-3 py-2 border border-sand rounded-lg tnum focus:outline-none focus:border-ink" />
     </div>
    </div>
   </div>
  </section>
  )}

  {settingsSubTab === 'profile' && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">روند جلسات</h2>
   <p className="text-xs text-soot mb-4">
    سیستم هیچ روند ثابتی به شما تحمیل نمی‌کند. نام اولین جلسه‌ی مراجع جدید و عنوان‌های آماده‌ی جلسات بعدی را خودتان تعیین کنید.
   </p>

   <label className="text-xs text-soot mb-1 block">عنوان اولین جلسه‌ی مراجع جدید</label>
   <p className="text-[11px] text-soot mb-2">وقتی مراجع تازه‌ای فرم را پر می‌کند، اولین جلسه‌اش این عنوان را می‌گیرد (مثلا «مصاحبه»، «ویزیت اول»، «جلسه‌ی آشنایی»).</p>
   <input value={profile.first_stage_label} maxLength={40}
    onChange={e => patchProfile({ first_stage_label: e.target.value })}
    placeholder="مصاحبه"
    className="w-full text-sm px-3 py-2 border border-sand rounded-lg mb-4 focus:outline-none focus:border-ink" />

   <label className="text-xs text-soot mb-1 block">عنوان‌های آماده‌ی جلسات (اختیاری)</label>
   <p className="text-[11px] text-soot mb-2">این‌ها موقع «افزودن جلسه‌ی جدید» برای یک مراجع به‌صورت دکمه‌ی سریع نشان داده می‌شوند تا هر بار تایپ نکنید. هر عنوان یک خط.</p>
   <div className="space-y-2">
    {profile.stage_presets.map((p, i) => (
     <div key={i} className="flex items-center gap-2">
      <input value={p} maxLength={40}
       onChange={e => {
        const next = [...profile.stage_presets]; next[i] = e.target.value
        patchProfile({ stage_presets: next })
       }}
       placeholder="مثلا: جلسه‌ی پیگیری"
       className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
      <button onClick={() => patchProfile({ stage_presets: profile.stage_presets.filter((_, j) => j !== i) })}
       className="text-xs px-2.5 py-2 border border-red-500/30 text-red-600 rounded-lg shrink-0 hover:bg-red-500/5">حذف</button>
     </div>
    ))}
   </div>
   {profile.stage_presets.length < 20 && (
    <button onClick={() => patchProfile({ stage_presets: [...profile.stage_presets, ''] })}
     className="mt-2 text-xs px-3 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand">+ افزودن عنوان</button>
   )}
  </section>
  )}

  {settingsSubTab === 'profile' && profile.session_modes !== 'offline' && (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">جلسه‌ی آنلاین</h2>
   <p className="text-xs text-soot mb-4">
    هر روشی را که می‌خواهید اضافه کنید؛ همه‌ی روش‌های فعال به مراجع نشان داده می‌شوند و او یکی را انتخاب می‌کند.
   </p>

   {/* کانال‌های فعال */}
   <div className="space-y-2.5 mb-3">
    {profile.meet_channels.map((ch, i) => {
     const meta = MEET_META[ch.method]
     const invalid = !!ch.value.trim() && !meetHref(ch.method, ch.value)
     return (
      <div key={ch.method} className="border border-sand rounded-xl p-3">
       <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-ink">{meta.label}</span>
        <button type="button" onClick={() => patchProfile({ meet_channels: profile.meet_channels.filter((_, j) => j !== i) })}
         className="text-xs text-red-600 hover:text-red-700">حذف</button>
       </div>
       <input value={ch.value} dir="ltr" placeholder={meta.placeholder}
        inputMode={meta.kind === 'phone' ? 'tel' : 'url'}
        onChange={e => {
         const next = [...profile.meet_channels]
         next[i] = { ...ch, value: e.target.value }
         patchProfile({ meet_channels: next })
        }}
        className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
       <p className={`text-[11px] mt-1.5 ${invalid ? 'text-amber-700' : 'text-soot'}`}>
        {invalid
         ? (meta.kind === 'phone' ? 'شماره‌ی موبایل معتبر وارد کنید (مثال: 09123456789)' : 'نشانی کامل با https:// وارد کنید')
         : meta.hint}
       </p>
      </div>
     )
    })}
   </div>

   {/* افزودن روش تازه — فقط روش‌هایی که هنوز اضافه نشده‌اند */}
   {MEET_METHODS.filter(m => !profile.meet_channels.some(ch => ch.method === m)).length > 0 && (
    <div>
     <p className="text-xs text-soot mb-2">افزودن روش:</p>
     <div className="flex flex-wrap gap-2">
      {MEET_METHODS.filter(m => !profile.meet_channels.some(ch => ch.method === m)).map(m => (
       <button key={m} type="button"
        onClick={() => patchProfile({ meet_channels: [...profile.meet_channels, { method: m, value: '' }] })}
        className="px-3 py-2 rounded-xl border border-sand text-xs text-soot hover:border-ink hover:text-ink transition-colors">
        + {MEET_META[m].label}
       </button>
      ))}
     </div>
    </div>
   )}

   {profile.meet_channels.length === 0 && (
    <p className="text-[11px] text-soot mt-3">هنوز هیچ روشی اضافه نشده — تا زمانی که روشی اضافه نکنید، مراجع راهی برای پیوستن به جلسه‌ی آنلاین نخواهد داشت.</p>
   )}
  </section>
  )}

  {settingsSubTab === 'profile' && me?.isOwner !== false && (
   <section className="bg-white rounded-2xl border border-sand p-5">
    <div className="flex items-center justify-between mb-1">
     <h2 className="text-sm font-display font-semibold text-ink">مکان‌های جلسه‌ی حضوری</h2>
    </div>
    <p className="text-xs text-soot mb-4">می‌توانید چند مطب/آدرس تعریف کنید؛ بین همه‌ی دکترهای این مجموعه مشترک است.</p>
    <div className="space-y-3">
     {settings.office_locations.map((loc, i) => (
      <div key={loc.id} className="border border-sand rounded-xl p-3 bg-gray-50">
       <div className="flex items-center gap-2 mb-2">
        <input value={loc.title}
         onChange={e => {
          const next = [...settings.office_locations]; next[i] = { ...loc, title: e.target.value }
          patchSettings({ office_locations: next })
         }}
         placeholder="نام مطب (مثلا مطب ولنجک)"
         className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
        <button onClick={() => patchSettings({ office_locations: settings.office_locations.filter((_, j) => j !== i) })}
         className="text-xs px-2.5 py-2 border border-red-500/30 text-red-600 rounded-lg shrink-0 hover:bg-red-500/5">حذف</button>
       </div>
       <input value={loc.address}
        onChange={e => {
         const next = [...settings.office_locations]; next[i] = { ...loc, address: e.target.value }
         patchSettings({ office_locations: next })
        }}
        placeholder="آدرس کامل"
        className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
      </div>
     ))}
    </div>
    <button onClick={() => patchSettings({ office_locations: [...settings.office_locations, { id: genId('loc'), title: '', address: '' }] })}
     className="mt-3 text-xs px-3 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand">+ افزودن مکان</button>
   </section>
  )}

  {settingsSubTab === 'appearance' && me?.isOwner !== false && (
   <section className="bg-white rounded-2xl border border-sand p-5">
    <h2 className="text-sm font-display font-semibold text-ink mb-1">ظاهر و برند</h2>
    <p className="text-xs text-soot mb-4">
     رنگ اصلی صفحه‌ی عمومی و پنل مراجع خودتان را انتخاب کنید — یا از رنگ‌های آماده، یا با آپلود لوگو تا سیستم خودش رنگ برند شما را استخراج کند. برای خوانایی، رنگ نهایی همیشه کنتراست کافی روی زمینه‌ی سفید خواهد داشت.
    </p>
    {!themeLoaded ? (
     <SkeletonRows count={1} height="h-56" />
    ) : (
     <>
      <ThemeModePicker slug={slug} themeMode={themeProfile?.theme_mode || 'preset'} themeColor={themeProfile?.theme_color || DEFAULT_SAFE_THEME}
       logoUrl={themeProfile?.logo_url || null} onChange={patchTheme} uiAlert={uiAlert} />
      <button onClick={saveTheme} disabled={themeSaving}
       className="w-full mt-4 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-50 hover:bg-ink/90 transition-colors">
       {themeSaving ? 'در حال ذخیره...' : themeSaved ? '✓ ذخیره شد' : 'ذخیره‌ی تم'}
      </button>
     </>
    )}
   </section>
  )}
  </>
 )
}
