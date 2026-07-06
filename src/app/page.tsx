'use client'
// ─────────────────────────────────────────────────────────────────────────────
// لندینگِ پلتفرم — طراحیِ مونوکروم (سفید/مشکی/خاکستری) به سبکِ Cal.com
// تیترها: Estedad · بدنه: Vazirmatn · اعداد: لاتین · RTL
// کارت‌های نیچ همچنان داینامیک از /api/niches گرفته می‌شوند.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { PLATFORM_NAME } from '@/lib/config'

type NicheCard = {
  key: string; display_name: string; tagline: string
  icon: string; default_theme: string; setup_price: number
}

// آیکون‌های خطیِ مونوکروم (بدونِ ایموجی)
function Icon({ path, className = 'w-5 h-5' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      dangerouslySetInnerHTML={{ __html: path }} />
  )
}

const STEPS = [
  { n: '01', t: 'ثبت‌نام و انتخاب حوزه‌ی کاری', d: 'حساب رایگانت را بساز و حوزه‌ی تخصصت را انتخاب کن. صفحه‌ات بلافاصله آماده می‌شود.' },
  { n: '02', t: 'تنظیم برنامه‌ی هفتگی', d: 'روزها و ساعت‌های در دسترس، مدت هر جلسه و فاصله‌ی بین نوبت‌ها را مشخص کن.' },
  { n: '03', t: 'لینک اختصاصی را به اشتراک بگذار', d: 'لینکِ برندشده‌ات را برای مراجعین بفرست؛ خودشان زمان خالی را انتخاب و رزرو می‌کنند.' },
]

const FEATURES = [
  { icon: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    t: 'لینکِ اختصاصی برای هر متخصص', d: 'هر متخصص یک نشانیِ برندشده‌ی خودش را دارد که به‌راحتی قابلِ اشتراک است.',
    tag: 'nobatlink.com/اسم-تو' },
  { icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    t: 'یادآوریِ خودکار پیامکی', d: 'قبل از هر نوبت، پیامکِ یادآوری برای مراجع ارسال می‌شود تا نرخِ عدم‌حضور کم شود.',
    tag: 'کاهش no-show تا ۴۰٪'.replace('۴۰', '40') },
  { icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    t: 'تقویم و مدیریتِ چند پرسنل', d: 'برنامه‌ی چند متخصص را هم‌زمان مدیریت کن؛ همه‌ی نوبت‌ها در یک تقویمِ واحد.' },
  { icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    t: 'پرداختِ آنلاین + کارت‌به‌کارت', d: 'هزینه‌ی جلسه را هنگامِ رزرو دریافت کن؛ درگاهِ آنلاین یا کارت‌به‌کارت.' },
]

const FAQS = [
  { q: 'قیمتِ استفاده از نوبت‌لینک چقدر است؟', a: 'ثبت‌نام و راه‌اندازی کاملاً رایگان است و بدونِ نیاز به کارت بانکی شروع می‌شود. پلنِ رایگان برای شروع کافی است و پلن‌های حرفه‌ای با امکاناتِ بیشتر بعداً در دسترس خواهد بود.' },
  { q: 'چه تفاوتی با نوبت‌دهیِ دستی و دفترچه دارد؟', a: 'در نوبت‌دهیِ دستی باید پاسخِ تماس‌ها و پیام‌ها را بدهی. با نوبت‌لینک مراجع خودش زمانِ خالی را می‌بیند و رزرو می‌کند، یادآوریِ پیامکیِ خودکار ارسال می‌شود و آمارِ نوبت‌ها همیشه در دسترس است.' },
  { q: 'اطلاعاتِ من و مراجعینم امن است؟', a: 'داده‌ها به‌صورتِ رمزنگاری‌شده نگهداری می‌شوند و دسترسی به اطلاعاتِ هر متخصص فقط برای خودش امکان‌پذیر است. شماره و اطلاعاتِ مراجعین هرگز در اختیارِ شخصِ دیگری قرار نمی‌گیرد.' },
  { q: 'الان از چه حوزه‌هایی پشتیبانی می‌کنید؟', a: 'در حالِ حاضر روی روانشناسی/مشاوره و سالنِ زیبایی تمرکز کرده‌ایم و این بخش‌ها فعال‌اند. حوزه‌های بیشتر به‌زودی اضافه می‌شوند.' },
  { q: 'راه‌اندازی چقدر طول می‌کشد؟', a: 'کمتر از پنج دقیقه. ثبت‌نام کن، حوزه‌ات را انتخاب کن و برنامه‌ی هفتگی‌ات را تنظیم کن؛ بلافاصله لینکِ اختصاصی‌ات آماده‌ی اشتراک‌گذاری است.' },
]

const DAYS = [
  { d: 'شنبه', n: '15' }, { d: 'یک‌شنبه', n: '16', active: true }, { d: 'دوشنبه', n: '17' },
  { d: 'سه‌شنبه', n: '18' }, { d: 'چهارشنبه', n: '19' },
]
const SLOTS = ['09:30', '10:00', '10:30', '11:00', '11:30', '12:00']

export default function Landing() {
  const [niches, setNiches] = useState<NicheCard[]>([])
  const [loading, setLoading] = useState(true)
  const [slot, setSlot] = useState(3)
  const [faq, setFaq] = useState<number>(0)

  useEffect(() => {
    fetch('/api/niches').then(r => r.json()).then(d => {
      setNiches(d.niches || []); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <main className="min-h-screen bg-paper text-ink">
      {/* ── هدر ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-paper/80 backdrop-blur border-b border-sand">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center">
              <Icon path='<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>' className="w-3.5 h-3.5 text-white" />
            </span>
            <span className="font-display font-extrabold text-lg tracking-tightest">{PLATFORM_NAME}</span>
          </div>
          <nav className="hidden sm:flex items-center gap-7 text-sm text-soot">
            <a href="#how" className="hover:text-ink">چطور کار می‌کند</a>
            <a href="#features" className="hover:text-ink">امکانات</a>
            <a href="#niches" className="hover:text-ink">کسب‌وکارها</a>
            <a href="#faq" className="hover:text-ink">سوالات</a>
          </nav>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-sm text-soot hover:text-ink">ورود</a>
            <a href="/signup" className="text-sm font-semibold text-white bg-ink px-4 py-2 rounded-lg hover:opacity-90">ثبت‌نام رایگان</a>
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="grid md:grid-cols-2 gap-14 items-center">
          <div className="animate-nl-up">
            <div className="inline-flex items-center gap-2 text-xs text-soot border border-sand rounded-full px-3 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-ink" style={{ animation: 'nlPulse 2s infinite' }} />
              پلتفرمِ نوبت‌دهیِ آنلاین
            </div>
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl leading-[1.12] tracking-tightest">
              روش بهتری برای<br />نوبت‌دهیِ کسب‌وکارت
            </h1>
            <p className="mt-5 text-base sm:text-lg text-soot leading-relaxed max-w-md">
              یک صفحه‌ی رزروِ اختصاصی و برندشده بساز؛ مراجعینت خودشان زمانِ خالی را انتخاب و رزرو می‌کنند — بدونِ تماس، بدونِ هماهنگیِ دستی.
            </p>
            <div className="mt-8 flex items-center gap-4 flex-wrap">
              <a href="/signup" className="font-display font-bold text-white bg-ink px-7 py-3.5 rounded-xl shadow-sm hover:-translate-y-0.5 hover:shadow-lg transition">ثبت‌نام رایگان</a>
              <a href="#how" className="text-sm font-medium text-ink">ببین چطور کار می‌کند ←</a>
            </div>
            <p className="mt-4 text-[13px] text-soot/80">بدونِ نیاز به کارت بانکی · راه‌اندازی در کمتر از 5 دقیقه</p>
          </div>

          {/* پیش‌نمایشِ تقویمِ رزرو */}
          <div className="animate-nl-up relative">
            <div className="rounded-2xl border border-sand bg-white shadow-[0_20px_55px_-25px_rgba(0,0,0,0.28)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-sand">
                <span className="w-2.5 h-2.5 rounded-full bg-sand" />
                <span className="w-2.5 h-2.5 rounded-full bg-sand" />
                <span className="w-2.5 h-2.5 rounded-full bg-sand" />
                <span className="mr-2 text-xs text-soot" dir="ltr">nobatlink.com/dr-parsa</span>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center font-display font-bold">پ.ر</span>
                  <div>
                    <div className="font-display font-bold text-[15px]">دکتر پریسا رستمی</div>
                    <div className="text-xs text-soot">جلسه‌ی مشاوره · 45 دقیقه</div>
                  </div>
                </div>
                <div className="flex gap-1.5 mb-4">
                  {DAYS.map(day => (
                    <div key={day.n} className={`flex-1 text-center py-2 rounded-lg border ${day.active ? 'bg-ink text-white border-ink' : 'border-sand text-soot'}`}>
                      <div className="text-[11px] opacity-70">{day.d}</div>
                      <div className="font-display font-bold">{day.n}</div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-soot mb-2.5">زمان‌های خالی — یک‌شنبه 16</div>
                <div className="grid grid-cols-2 gap-2">
                  {SLOTS.map((s, i) => (
                    <button key={s} onClick={() => setSlot(i)}
                      className={`py-2.5 rounded-lg border text-sm font-semibold transition ${i === slot ? 'bg-ink text-white border-ink' : 'border-sand text-ink hover:border-ink hover:bg-paper'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-5 -right-4 bg-white border border-sand rounded-xl px-4 py-3 shadow-lg flex items-center gap-2.5" style={{ animation: 'nlFloat 4.5s ease-in-out infinite' }}>
              <span className="w-7 h-7 rounded-full bg-ink text-white flex items-center justify-center text-sm">✓</span>
              <div>
                <div className="font-display font-bold text-[13px]">رزرو تأیید شد</div>
                <div className="text-[11px] text-soot">همین الان توسط سارا م.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── چطور کار می‌کند ─────────────────────────────────────────────── */}
      <section id="how" className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="text-center max-w-xl mx-auto mb-12">
          <div className="text-sm font-semibold text-soot mb-3">چطور کار می‌کند</div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">از ثبت‌نام تا اولین رزرو، سه قدم</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {STEPS.map(s => (
            <div key={s.n} className="rounded-2xl border border-sand bg-white p-6">
              <div className="font-display font-extrabold text-sm text-soot/60 tracking-widest mb-5">{s.n}</div>
              <h3 className="font-display font-bold text-lg mb-2">{s.t}</h3>
              <p className="text-sm text-soot leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── امکانات ─────────────────────────────────────────────────────── */}
      <section id="features" className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="text-center max-w-xl mx-auto mb-12">
          <div className="text-sm font-semibold text-soot mb-3">امکانات</div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">هرچه برای مدیریتِ نوبت‌ها لازم داری</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map(f => (
            <div key={f.t} className="rounded-2xl border border-sand bg-white p-7 transition hover:-translate-y-1.5 hover:shadow-[0_22px_44px_-20px_rgba(0,0,0,0.32)]">
              <div className="w-11 h-11 rounded-xl bg-ink text-white flex items-center justify-center mb-5">
                <Icon path={f.icon} />
              </div>
              <h3 className="font-display font-bold text-xl mb-2.5">{f.t}</h3>
              <p className="text-sm text-soot leading-relaxed mb-3.5">{f.d}</p>
              {f.tag && (
                <span dir="ltr" className="inline-block text-[13px] font-semibold text-ink bg-paper border border-sand rounded-lg px-3 py-2">{f.tag}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── مناسبِ چه کسب‌وکارهایی (داینامیک) ───────────────────────────── */}
      <section id="niches" className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="text-center max-w-xl mx-auto mb-12">
          <div className="text-sm font-semibold text-soot mb-3">مناسبِ چه کسب‌وکارهایی</div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">برای هر حوزه‌ی خدماتی</h2>
          <p className="mt-3 text-sm text-soot">تمپلیت‌های تازه مدام اضافه می‌شوند.</p>
        </div>
        {loading ? (
          <div className="grid sm:grid-cols-3 gap-4">
            {[0, 1, 2].map(i => <div key={i} className="h-36 rounded-2xl bg-sand animate-pulse" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            {niches.map(n => (
              <div key={n.key} className="rounded-2xl border border-ink bg-white p-6 transition hover:-translate-y-1 hover:shadow-lg">
                <div className="w-10 h-10 rounded-xl border border-ink flex items-center justify-center mb-4">
                  <Icon path='<path d="M12 2a7 7 0 0 0-7 7c0 3 2 4 2 7h10c0-3 2-4 2-7a7 7 0 0 0-7-7z"/><path d="M9 22h6"/>' />
                </div>
                <h3 className="font-display font-bold">{n.display_name}</h3>
                <p className="mt-2 text-xs text-soot leading-relaxed min-h-[32px]">{n.tagline}</p>
              </div>
            ))}
            <div className="rounded-2xl border-2 border-dashed border-sand p-6 flex flex-col justify-center items-center text-center">
              <h3 className="font-display font-bold text-sm">حرفه‌ی شما اینجا نیست؟</h3>
              <p className="mt-2 text-xs text-soot leading-relaxed">بگویید چه کاری می‌کنید تا برایتان تمپلیت بسازیم.</p>
            </div>
          </div>
        )}
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="max-w-2xl mx-auto px-6 pt-16 pb-10">
        <div className="text-center mb-10">
          <div className="text-sm font-semibold text-soot mb-3">سوالاتِ پرتکرار</div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">پاسخِ سوال‌هایت اینجاست</h2>
        </div>
        <div className="flex flex-col gap-3">
          {FAQS.map((f, i) => {
            const open = i === faq
            return (
              <div key={i} className="rounded-xl border border-sand bg-white overflow-hidden">
                <button onClick={() => setFaq(open ? -1 : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-right font-display font-bold text-[16px]">
                  <span>{f.q}</span>
                  <span className={`shrink-0 text-2xl text-soot transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
                </button>
                <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: open ? 260 : 0 }}>
                  <p className="px-5 pb-5 text-sm text-soot leading-loose">{f.a}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── CTA نهایی ───────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-10 pb-16">
        <div className="rounded-3xl bg-ink text-white px-10 py-16 text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.06) 1px, transparent 0)', backgroundSize: '26px 26px' }} />
          <h2 className="relative font-display font-extrabold text-4xl sm:text-[46px] tracking-tightest">نوبت‌دهیِ هوشمندتر، ساده‌تر</h2>
          <p className="relative mt-4 text-white/70 max-w-md mx-auto leading-relaxed">همین امروز صفحه‌ی رزروِ اختصاصی‌ات را بساز و اولین نوبت را دریافت کن.</p>
          <a href="/signup" className="relative inline-block mt-8 font-display font-bold text-ink bg-white px-8 py-3.5 rounded-xl hover:-translate-y-0.5 transition">شروع رایگان</a>
          <p className="relative mt-4 text-xs text-white/50">بدونِ نیاز به کارت بانکی</p>
        </div>
      </section>

      {/* ── فوتر ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-sand">
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-soot">
          <span className="font-display font-bold">{PLATFORM_NAME}</span>
          {/* نمادِ اعتماد الکترونیکی (اینماد) — بدونِ rel="noopener noreferrer" طبقِ دستورِ اینماد */}
          <a referrerPolicy="origin" target="_blank"
            href="https://trustseal.enamad.ir/?id=753950&Code=AcwMyu4tgps3IUpdr2taP5QYaQkTCSyp">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img referrerPolicy="origin"
              src="https://trustseal.enamad.ir/logo.aspx?id=753950&Code=AcwMyu4tgps3IUpdr2taP5QYaQkTCSyp"
              alt="نمادِ اعتماد الکترونیکی" style={{ cursor: 'pointer' }} data-code="AcwMyu4tgps3IUpdr2taP5QYaQkTCSyp" />
          </a>
          <span>© 1404</span>
        </div>
      </footer>
    </main>
  )
}
