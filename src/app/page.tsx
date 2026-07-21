'use client'
// ─────────────────────────────────────────────────────────────────────────────
// لندینگ پلتفرم — بازطراحی (جولای ۲۰۲۶)
// هویت برند: مونوکروم (سفید/مشکی/خاکستری) + تایپوگرافی Estedad/Vazirmatn.
// رنگ، عمدا فقط از «تخصص‌ها» می‌آید (~10% صفحه): موکاپ چرخشی hero و کارت نیچ‌ها.
// امضای صفحه: موکاپ زنده‌ی hero — یک صفحه‌ی رزرو که هر چرخه، تخصص/رنگش عوض
// می‌شود و سه مرحله (صفحه → انتخاب زمان → پرداخت و تایید) را نمایش می‌دهد؛
// هم «چطور کار می‌کند» را بی‌کلام می‌رساند هم «برای هر تخصصی است» را.
// لحن همه‌ی متن‌ها: رسمی-روان (شمای جمع، بدون محاوره). اعداد لاتین (قانون پروژه).
// موشن: اسکرول‌ریویل ملایم (کلاس nl-reveal در globals.css) + چرخه‌ی hero —
// هر دو تابع prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { PLATFORM_NAME, SUPPORT_EMAIL, SUPPORT_PHONE, DEMO_SLUG } from '@/lib/config'
import { PLAN_PRICING } from '@/lib/plans'

type NicheCard = {
  key: string; display_name: string; tagline: string
  icon: string; default_theme: string; setup_price: number; is_active: boolean
}

function Icon({ path, className = 'w-5 h-5' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      dangerouslySetInnerHTML={{ __html: path }} />
  )
}

// سال جلالی جاری برای کپی‌رایت فوتر — با اعداد لاتین (قانون پروژه)
function jalaliYear(): string {
  try {
    return new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric' })
      .format(new Date()).replace(/[^0-9]/g, '')
  } catch {
    return '1405'
  }
}

// آیکون کارت هر نیچ — بر اساس فیلد icon خود نیچ در دیتابیس
const NICHE_ICONS: Record<string, string> = {
  brain: '<path d="M12 4a3 3 0 0 0-3 3v10a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3z"/><path d="M9 8H7a3 3 0 0 0 0 6h2"/><path d="M15 8h2a3 3 0 0 1 0 6h-2"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/>',
  default: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>',
}

// ── دیتای موکاپ چرخشی hero — سه تخصص، هرکدام با رنگ خودش ──────────────────
const SHOWCASE = [
  { color: '#7C3AED', label: 'روانشناسی', slug: 'dr-mohammadi', initial: 'س',
    name: 'دکتر سارا محمدی', title: 'روان‌شناس بالینی',
    service: 'جلسه‌ی مشاوره‌ی فردی', dur: '60 دقیقه', price: '800,000' },
  { color: '#EC4899', label: 'سالن زیبایی', slug: 'rose-beauty', initial: 'ر',
    name: 'سالن زیبایی رز', title: 'مراقبت مو و پوست',
    service: 'رنگ و مش', dur: '120 دقیقه', price: '1,200,000' },
  { color: '#0891B2', label: 'کلینیک', slug: 'dr-rezaei', initial: 'ا',
    name: 'دکتر امیر رضایی', title: 'متخصص تغذیه',
    service: 'ویزیت و برنامه‌ی غذایی', dur: '30 دقیقه', price: '500,000' },
]
const SHOWCASE_DAYS = [
  { d: 'شنبه', n: '15' }, { d: 'یک', n: '16' }, { d: 'دو', n: '17', active: true },
  { d: 'سه', n: '18' }, { d: 'چهار', n: '19' },
]
const SHOWCASE_SLOTS = ['09:30', '11:00', '16:30', '18:00']
const SHOWCASE_STEPS = ['صفحه‌ی اختصاصی شما', 'انتخاب زمان توسط مراجع', 'پرداخت و تایید خودکار']

// موکاپ زنده — هر تیک یک مرحله جلو می‌رود؛ هر ۳ مرحله، تخصص (و رنگ) عوض می‌شود
function HeroShowcase() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setTick(t => t + 1), 2100)
    return () => clearInterval(id)
  }, [])
  const step = tick % 3
  const niche = SHOWCASE[Math.floor(tick / 3) % SHOWCASE.length]
  const c = niche.color

  return (
    <div>
      <div className="rounded-2xl border border-sand bg-white shadow-[0_20px_55px_-25px_rgba(0,0,0,0.28)] overflow-hidden">
        {/* نوار مرورگر */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-sand">
          <span className="w-2.5 h-2.5 rounded-full bg-sand" />
          <span className="w-2.5 h-2.5 rounded-full bg-sand" />
          <span className="w-2.5 h-2.5 rounded-full bg-sand" />
          <span className="mr-2 text-xs text-soot" dir="ltr">nobatlink.com/{niche.slug}</span>
        </div>

        <div className="p-5">
          {/* هویت متخصص — با هر چرخه، رنگ و محتوا عوض می‌شود */}
          <div className="flex items-center gap-3 mb-4">
            <span className="w-11 h-11 rounded-full text-white flex items-center justify-center font-display font-bold text-lg transition-colors duration-700"
              style={{ background: c }}>{niche.initial}</span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-[15px] truncate">{niche.name}</div>
              <div className="text-xs text-soot">{niche.title}</div>
            </div>
            <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 transition-colors duration-700"
              style={{ background: `${c}1a`, color: c }}>{niche.label}</span>
          </div>

          {/* صحنه‌ی مراحل — ارتفاع ثابت تا صفحه نپرد */}
          <div className="relative h-[218px]">
            {/* مرحله‌ی ۱: صفحه و خدمت */}
            <div className={`absolute inset-0 transition-all duration-500 ${step === 0 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
              <div className="border border-sand rounded-xl p-4 mb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display font-bold text-sm">{niche.service}</div>
                    <div className="text-xs text-soot mt-1">{niche.dur} · حضوری یا آنلاین</div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="font-display font-extrabold tnum">{niche.price}</div>
                    <div className="text-[10px] text-soot">تومان</div>
                  </div>
                </div>
              </div>
              <button className="w-full py-3 rounded-xl text-white font-display font-bold text-sm transition-colors duration-700" style={{ background: c }}>
                رزرو نوبت
              </button>
              <p className="text-[11px] text-soot text-center mt-3">صفحه‌ی عمومی شما — با نشانی و رنگ اختصاصی</p>
            </div>

            {/* مرحله‌ی ۲: انتخاب روز و ساعت */}
            <div className={`absolute inset-0 transition-all duration-500 ${step === 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
              <div className="flex gap-1.5 mb-3">
                {SHOWCASE_DAYS.map(day => (
                  <div key={day.n} className="flex-1 text-center py-2 rounded-lg border transition-colors duration-700"
                    style={day.active ? { background: c, borderColor: c, color: '#fff' } : { borderColor: '#ECECEC', color: '#737373' }}>
                    <div className="text-[10px] opacity-80">{day.d}</div>
                    <div className="font-display font-bold text-sm tnum">{day.n}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-soot mb-2">زمان‌های خالی</div>
              <div className="grid grid-cols-2 gap-2">
                {SHOWCASE_SLOTS.map((s, i) => (
                  <div key={s} className="py-2.5 rounded-lg border text-sm font-semibold text-center tnum transition-colors duration-700"
                    style={i === 2 ? { background: c, borderColor: c, color: '#fff' } : { borderColor: '#ECECEC' }}>
                    {s}
                  </div>
                ))}
              </div>
            </div>

            {/* مرحله‌ی ۳: پرداخت و تایید */}
            <div className={`absolute inset-0 transition-all duration-500 ${step === 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
              <div className="h-full flex flex-col items-center justify-center text-center">
                <span className="w-14 h-14 rounded-full text-white flex items-center justify-center text-2xl mb-3 transition-colors duration-700" style={{ background: c }}>✓</span>
                <div className="font-display font-extrabold text-lg">نوبت قطعی شد</div>
                <div className="text-xs text-soot mt-1.5">پرداخت آنلاین انجام و پیامک تایید ارسال شد</div>
                <div className="mt-4 flex items-center gap-2 text-[11px] text-soot border border-sand rounded-lg px-3 py-2">
                  <span className="tnum">{niche.price} تومان</span>
                  <span className="w-px h-3 bg-sand" />
                  <span>درگاه پرداخت امن نوبت‌لینک</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* راهنمای مراحل — با انیمیشن هم‌گام است؛ خودش «چطور کار می‌کند» فوری است */}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {SHOWCASE_STEPS.map((label, i) => (
          <div key={label} className="text-center">
            <div className="h-1 rounded-full mb-2 transition-colors duration-500"
              style={{ background: i === step ? c : '#ECECEC' }} />
            <div className={`text-[11px] leading-tight transition-colors ${i === step ? 'text-ink font-semibold' : 'text-soot'}`}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── «سفر یک نوبت» — روایت مرکزی لندینگ (بازطراحی ادامه‌ی 29) ────────────────
// الگوی oryzo: یک شیء قهرمان (گوشی) sticky می‌ماند و اسکرول کاربر پرده‌های
// داستان را داخلش عوض می‌کند — بدون WebGL و کتابخانه‌ی جدید؛ فقط sticky +
// IntersectionObserver (همان الگوی nl-reveal). ارقام لاتین، تابع reduced-motion.
const STORY_BEATS = [
  { n: '1', t: 'ساعت 23:41 است', d: 'هر نوبت، ده پیام. هر پرداخت، یک اسکرین‌شات رسید. هر کنسلی، یک صندلی خالی که دیر خبرش می‌رسد. تقویم شما در دایرکت دیگران زندگی می‌کند.' },
  { n: '2', t: 'همه‌اش جمع می‌شود در یک خط', d: 'nobatlink.com/نام-شما — صفحه‌ای با رنگ و هویت خودتان. از این‌جا به بعد، مراجع با صفحه‌ی شما طرف است، نه با گوشی شما.' },
  { n: '3', t: 'مراجع خودش رزرو می‌کند', d: 'زمان‌های خالی را می‌بیند، انتخاب می‌کند و همان‌جا آنلاین پرداخت می‌کند. بدون پیام، بدون هماهنگی دستی — حتی وقتی خواب هستید.' },
  { n: '4', t: 'بقیه‌اش خودکار است', d: 'تایید لحظه‌ای برای مراجع، یادآور پیامکی خودکار پیش از جلسه، و پول در مسیر تسویه. شما فقط سر جلسه حاضر می‌شوید.' },
]

// صحنه‌های داخل گوشی — همان زبان بصری موکاپ hero (absolute + opacity/translate)
function StoryPhone({ scene }: { scene: number }) {
  const S = (i: number) =>
    `absolute inset-0 p-4 transition-all duration-500 motion-reduce:transition-none ${scene === i ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="rounded-[2rem] border border-sand bg-white shadow-[0_24px_60px_-28px_rgba(0,0,0,0.3)] overflow-hidden">
        {/* نوار وضعیت گوشی */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[10px] text-soot">
          <span className="tnum">{scene === 0 ? '23:41' : '10:05'}</span>
          <span className="w-16 h-4 rounded-full bg-sand" />
          <span className="tnum" dir="ltr">100%</span>
        </div>
        <div className="relative h-[320px] sm:h-[360px] border-t border-sand">

          {/* پرده‌ی 1: آشوب دایرکت */}
          <div className={S(0)}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-semibold text-ink">دایرکت‌ها</span>
              <span className="text-[10px] font-bold text-white bg-ink rounded-full px-2 py-0.5 tnum">9+</span>
            </div>
            <div className="space-y-2">
              <div className="bg-sand rounded-2xl rounded-tr-md px-3 py-2 text-[11px] text-ink w-fit max-w-[85%]">سلام، وقت مشاوره دارید؟</div>
              <div className="bg-sand rounded-2xl rounded-tr-md px-3 py-2 text-[11px] text-ink w-fit max-w-[85%]">برای پنجشنبه جا هست؟</div>
              <div className="bg-sand rounded-2xl rounded-tr-md px-3 py-2 w-fit max-w-[85%]">
                <div className="w-28 h-14 rounded-lg bg-white border border-soot/20 flex items-center justify-center text-[9px] text-soot">رسید کارت‌به‌کارت.jpg</div>
              </div>
              <div className="bg-sand rounded-2xl rounded-tr-md px-3 py-2 text-[11px] text-ink w-fit max-w-[85%]">ببخشید فردا نمی‌توانم بیایم</div>
              <div className="bg-sand rounded-2xl rounded-tr-md px-3 py-2 text-[11px] text-soot w-fit">…</div>
            </div>
            <p className="absolute bottom-3 inset-x-4 text-center text-[10px] text-soot">پاسخ‌دادن، هماهنگی، چک‌کردن رسید — همه با شما</p>
          </div>

          {/* پرده‌ی 2: یک لینک */}
          <div className={S(1)}>
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border-2 border-trust bg-trust-wash px-4 py-2.5 text-[13px] font-semibold text-trust-deep" dir="ltr">
                nobatlink.com/shirin
              </span>
              <p className="text-[11px] text-soot text-center leading-relaxed">همین. یک نشانی —<br />به‌جای همه‌ی آن پیام‌ها.</p>
            </div>
          </div>

          {/* پرده‌ی 3: رزرو توسط مراجع */}
          <div className={S(2)}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-full bg-trust text-white flex items-center justify-center font-display font-bold">ش</span>
              <div>
                <div className="font-display font-bold text-[13px]">دکتر شیرین احمدی</div>
                <div className="text-[10px] text-soot">روانشناس کودک</div>
              </div>
            </div>
            <div className="border border-sand rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-ink">جلسه‌ی مشاوره</span>
                <span className="text-[11px] font-bold tnum">1,200,000</span>
              </div>
              <div className="text-[10px] text-soot mt-0.5">45 دقیقه · حضوری یا آنلاین</div>
            </div>
            <div className="text-[10px] text-soot mb-1.5">پنجشنبه، زمان‌های خالی:</div>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {['16:00', '17:00', '18:00'].map(t => (
                <span key={t} className={`text-center text-[11px] rounded-lg py-1.5 tnum ${t === '17:00' ? 'bg-trust text-white font-bold' : 'border border-sand text-soot'}`}>{t}</span>
              ))}
            </div>
            <button className="w-full py-2.5 rounded-xl bg-ink text-white font-display font-bold text-[12px]">پرداخت آنلاین</button>
            <p className="absolute bottom-3 inset-x-4 text-center text-[10px] text-soot">مراجع خودش انتخاب و پرداخت می‌کند</p>
          </div>

          {/* پرده‌ی 4: قطعی و خودکار */}
          <div className={S(3)}>
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <span className="w-12 h-12 rounded-full bg-trust text-white flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <div className="text-center">
                <div className="font-display font-bold text-[14px]">نوبت قطعی شد</div>
                <div className="text-[11px] text-soot mt-0.5 tnum">پنجشنبه · 17:00</div>
              </div>
              <div className="w-full space-y-1.5 mt-2">
                <div className="flex items-center justify-between rounded-lg bg-trust-wash px-3 py-2 text-[10px]">
                  <span className="text-trust-deep font-semibold">یادآور پیامکی</span><span className="text-soot">خودکار، پیش از جلسه</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-trust-wash px-3 py-2 text-[10px]">
                  <span className="text-trust-deep font-semibold">پرداخت</span><span className="text-soot">در مسیر تسویه با شما</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// چیدمان sticky + تشخیص پرده‌ی فعال با IntersectionObserver (نوار میانی viewport)
function StorySection() {
  const [scene, setScene] = useState(0)
  const beatsRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)

  // دسکتاپ: پرده‌ی فعال از اسکرول عمودی بلوک‌های متن (sticky دوستونه)
  useEffect(() => {
    const root = beatsRef.current
    if (!root) return
    const blocks = Array.from(root.querySelectorAll('[data-beat]'))
    const obs = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          const i = Number((e.target as HTMLElement).dataset.beat)
          if (!Number.isNaN(i)) setScene(i)
        }
      }
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 })
    blocks.forEach(b => obs.observe(b))
    return () => obs.disconnect()
  }, [])

  // موبایل: پرده‌ی فعال از اسکرول افقی ریل کپشن‌ها (scroll-snap) — گوشی و متن
  // هرگز روی هم نمی‌افتند چون هر کدام ناحیه‌ی خودش را دارد.
  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const i = Math.round(rail.scrollLeft / rail.clientWidth)
        // RTL: scrollLeft منفی/برعکس است در برخی مرورگرها — با abs نرمال می‌کنیم
        const idx = Math.min(STORY_BEATS.length - 1, Math.max(0, Math.abs(i)))
        setScene(idx)
      })
    }
    rail.addEventListener('scroll', onScroll, { passive: true })
    return () => { rail.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  return (
    <section id="how" className="border-y border-sand bg-trust-wash/50 overflow-hidden">
      <div className="max-w-5xl mx-auto px-6 py-14 md:py-20">
        <div className="text-center max-w-xl mx-auto mb-10 md:mb-16 nl-reveal">
          <div className="text-sm font-semibold text-trust mb-3">سفر یک نوبت</div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">از آشوب دایرکت، تا نوبت قطعی</h2>
        </div>

        {/* ── موبایل: گوشی بالا + ریل افقی کپشن‌ها زیرش (بدون هیچ همپوشانی) ── */}
        <div className="md:hidden">
          <div className="flex justify-center mb-6">
            <StoryPhone scene={scene} />
          </div>
          {/* نقطه‌های پیشرفت */}
          <div className="flex justify-center gap-2 mb-4">
            {STORY_BEATS.map((_, i) => (
              <button
                key={i}
                aria-label={`پرده‌ی ${i + 1}`}
                onClick={() => railRef.current?.scrollTo({ left: railRef.current.clientWidth * i * (document.dir === 'rtl' ? -1 : 1), behavior: 'smooth' })}
                className={`h-1.5 rounded-full transition-all ${scene === i ? 'w-6 bg-trust' : 'w-1.5 bg-trust/30'}`}
              />
            ))}
          </div>
          {/* ریل افقی — snap؛ هر کپشن یک صفحه‌ی کامل */}
          <div ref={railRef} className="flex overflow-x-auto snap-x snap-mandatory -mx-6 px-6 gap-4 scrollbar-none">
            {STORY_BEATS.map((b, i) => (
              <div key={b.n} className="snap-center shrink-0 w-full text-center">
                <div className="font-display font-extrabold text-xs text-trust tracking-widest mb-3 tnum">{b.n} / 4</div>
                <h3 className="font-display font-bold text-xl mb-2 tracking-tightest">{b.t}</h3>
                <p className="text-sm text-soot leading-relaxed max-w-xs mx-auto">{b.d}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-soot/70 mt-4">← برای دیدن مراحل، بکشید</p>
        </div>

        {/* ── دسکتاپ: گوشی sticky + بلوک‌های بلند متن (scroll-scrubbed) ── */}
        <div className="hidden md:grid md:grid-cols-2 md:gap-12">
          <div className="sticky top-24 z-10 self-start">
            <StoryPhone scene={scene} />
          </div>
          <div ref={beatsRef}>
            {STORY_BEATS.map((b, i) => (
              <div key={b.n} data-beat={i} className="min-h-[70vh] flex items-center">
                <div className={`transition-opacity duration-300 motion-reduce:transition-none ${scene === i ? 'opacity-100' : 'opacity-40'}`}>
                  <div className="font-display font-extrabold text-sm text-trust tracking-widest mb-4 tnum">{b.n} / 4</div>
                  <h3 className="font-display font-bold text-3xl mb-3 tracking-tightest">{b.t}</h3>
                  <p className="text-base text-soot leading-relaxed max-w-sm">{b.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  { icon: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    t: 'نشانی اختصاصی برای هر متخصص', d: 'هر متخصص نشانی برندشده‌ی خود را دارد که به‌سادگی قابل اشتراک‌گذاری است.',
    tag: 'nobatlink.com/برند-شما' },
  { icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    t: 'یادآوری خودکار پیامکی', d: 'پیش از هر نوبت، پیامک یادآوری برای مراجع ارسال می‌شود تا نرخ عدم‌حضور به حداقل برسد.' },
  { icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    t: 'تقویم واحد برای چند پرسنل', d: 'برنامه‌ی چند متخصص را هم‌زمان مدیریت کنید؛ همه‌ی نوبت‌ها در یک تقویم یکپارچه.' },
  { icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    t: 'پرداخت آنلاین امن', d: 'بهای خدمت هنگام رزرو از درگاه پرداخت نوبت‌لینک (دارای مجوز رسمی) دریافت و نوبت به‌صورت خودکار قطعی می‌شود.' },
  { icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    t: 'لیست انتظار هوشمند', d: 'وقتی همه‌ی ساعت‌ها پر است، مراجع در لیست انتظار می‌ماند و به‌محض خالی‌شدن زمانی، با یک کلیک به او اطلاع می‌دهید.' },
  { icon: '<path d="M3 3v18h18"/><path d="M7 13l3-3 4 4 5-6"/>',
    t: 'گزارش مالی و آمار کسب‌وکار', d: 'درآمد، تعداد نوبت‌ها و روند رشد را در گزارش‌های شفاف و قابل‌فیلتر دنبال کنید.' },
]

const FAQS = [
  { q: 'هزینه‌ی استفاده از نوبت‌لینک چقدر است؟', a: `سه پلن ماهانه دارد — پایه ${PLAN_PRICING.base.monthly.toLocaleString('en-US')}، حرفه‌ای ${PLAN_PRICING.pro.monthly.toLocaleString('en-US')} و تیم ${PLAN_PRICING.team.monthly.toLocaleString('en-US')} تومان — به‌علاوه کارمزد کوچک سقف‌دار روی هر تراکنش آنلاین (${PLAN_PRICING.team.feePct}% تا ${PLAN_PRICING.base.feePct}% بسته به پلن). 14 روز اول همه‌ی امکانات حرفه‌ای برای همه رایگان است. جزئیات در بخش «تعرفه‌ها» همین صفحه.` },
  { q: 'چه تفاوتی با نوبت‌دهی تلفنی و دفترچه‌ای دارد؟', a: 'در روش دستی، پاسخ‌گویی به تماس‌ها و پیام‌ها بر عهده‌ی شماست. در نوبت‌لینک، مراجع خودش زمان خالی را می‌بیند و رزرو می‌کند، یادآوری پیامکی به‌صورت خودکار ارسال می‌شود و آمار نوبت‌ها همیشه در دسترس شماست.' },
  { q: 'اطلاعات من و مراجعانم محفوظ است؟', a: 'داده‌ها به‌صورت رمزنگاری‌شده نگهداری می‌شوند و دسترسی به اطلاعات هر متخصص تنها برای خود او امکان‌پذیر است. شماره و اطلاعات مراجعان در اختیار هیچ شخص دیگری قرار نمی‌گیرد.' },
  { q: 'در حال حاضر از چه حوزه‌هایی پشتیبانی می‌کنید؟', a: 'تمرکز فعلی بر حوزه‌ی روانشناسی و مشاوره است که به‌طور کامل فعال است. سالن زیبایی و حوزه‌های دیگر در مرحله‌ی آماده‌سازی نهایی‌اند و به‌زودی در دسترس قرار می‌گیرند.' },
  { q: 'راه‌اندازی چقدر زمان می‌برد؟', a: 'کمتر از پنج دقیقه. ثبت‌نام کنید، حوزه‌ی کاری را انتخاب و برنامه‌ی هفتگی را تنظیم کنید؛ نشانی اختصاصی شما بلافاصله آماده‌ی اشتراک‌گذاری است.' },
]

export default function Landing() {
  const [niches, setNiches] = useState<NicheCard[]>([])
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState(true)
  const [faq, setFaq] = useState<number>(0)

  // فرم «تماس با ما» — ارسال به /api/contact (پیام‌ها در پنل سوپرادمین دیده می‌شوند)
  const [contactEmail, setContactEmail] = useState('')
  const [contactMsg, setContactMsg] = useState('')
  const [contactBusy, setContactBusy] = useState(false)
  const [contactSent, setContactSent] = useState(false)
  const [contactErr, setContactErr] = useState('')

  async function sendContact() {
    setContactErr('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail.trim())) { setContactErr('نشانی ایمیل معتبر وارد کنید'); return }
    if (contactMsg.trim().length < 10) { setContactErr('متن پیام کوتاه‌تر از حد لازم است'); return }
    setContactBusy(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contactEmail.trim(), message: contactMsg.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setContactErr(d.error || 'ارسال پیام ناموفق بود — لطفا دوباره تلاش کنید'); return }
      setContactSent(true)
    } catch {
      setContactErr('ارسال پیام ناموفق بود — اتصال اینترنت را بررسی کنید')
    } finally {
      setContactBusy(false)
    }
  }

  useEffect(() => {
    fetch('/api/niches').then(r => r.json()).then(d => {
      setNiches(d.niches || []); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // اسکرول‌ریویل — همه‌ی .nl-reveal ها موقع ورود به دید، کلاس nl-in می‌گیرند
  // (CSS و fallback حرکت‌کاهیده در globals.css)
  useEffect(() => {
    const els = document.querySelectorAll('.nl-reveal')
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('nl-in'); obs.unobserve(e.target) } })
    }, { threshold: 0.12 })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [loading])

  return (
    <main className="min-h-screen bg-paper text-ink">
      {/* ── هدر ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-paper/80 backdrop-blur border-b border-sand">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt={`لوگوی ${PLATFORM_NAME}`} className="w-9 h-9" />
            <span className="font-display font-extrabold text-lg tracking-tightest">{PLATFORM_NAME}</span>
          </div>
          <nav className="hidden sm:flex items-center gap-7 text-sm text-soot">
            <a href="#how" className="hover:text-ink">سفر یک نوبت</a>
            <a href="#features" className="hover:text-ink">امکانات</a>
            <a href="#niches" className="hover:text-ink">تخصص‌ها</a>
            <a href="#pricing" className="hover:text-ink">تعرفه‌ها</a>
            <a href="#faq" className="hover:text-ink">پرسش‌های پرتکرار</a>
            <a href="#contact" className="hover:text-ink">تماس</a>
          </nav>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-sm text-soot hover:text-ink">ورود</a>
            <a href="/signup" className="text-sm font-semibold text-white bg-ink px-4 py-2 rounded-lg hover:opacity-90">شروع رایگان</a>
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-12 sm:pt-16 pb-12">
        <div className="grid md:grid-cols-2 gap-12 md:gap-14 items-center">
          <div className="animate-nl-up">
            <div className="inline-flex items-center gap-2 text-xs text-trust-deep bg-trust-wash rounded-full px-3 py-1.5 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-trust" style={{ animation: 'nlPulse 2s infinite' }} />
              پلتفرم نوبت‌دهی آنلاین برای متخصصان
            </div>
            <h1 className="font-display font-extrabold text-4xl sm:text-5xl leading-[1.12] tracking-tightest">
              تقویم‌تان را از<br />دایرکت بیرون بیاورید
            </h1>
            <p className="mt-5 text-base sm:text-lg text-soot leading-relaxed max-w-md">
              یک صفحه‌ی رزرو با رنگ و نشانی خودتان: مراجع زمان خالی را می‌بیند، رزرو و آنلاین پرداخت می‌کند،
              یادآورش خودکار می‌رود. شما فقط سر جلسه حاضر می‌شوید.
            </p>
            <div className="mt-8 flex items-center gap-4 flex-wrap">
              <a href="/signup" className="font-display font-bold text-white bg-ink px-7 py-3.5 rounded-xl shadow-sm hover:-translate-y-0.5 hover:shadow-lg transition">شروع رایگان</a>
              <a href="#how" className="text-sm font-medium text-trust hover:text-trust-deep">سفر یک نوبت را ببینید ←</a>
              {DEMO_SLUG && (
                <a href={`/${DEMO_SLUG}`} target="_blank" className="text-sm font-medium text-soot underline underline-offset-4 hover:text-ink">مشاهده‌ی صفحه‌ی نمونه</a>
              )}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-soot">
              <span className="inline-flex items-center gap-1.5"><Icon path='<path d="M20 6 9 17l-5-5"/>' className="w-4 h-4 text-trust" /> 14 روز اول رایگان</span>
              <span className="inline-flex items-center gap-1.5"><Icon path='<path d="M20 6 9 17l-5-5"/>' className="w-4 h-4 text-trust" /> بدون کارت بانکی</span>
              <span className="inline-flex items-center gap-1.5"><Icon path='<path d="M20 6 9 17l-5-5"/>' className="w-4 h-4 text-trust" /> راه‌اندازی زیر 5 دقیقه</span>
            </div>
          </div>

          {/* موکاپ زنده‌ی چندتخصصی — امضای صفحه */}
          <div className="animate-nl-up">
            <HeroShowcase />
          </div>
        </div>
      </section>

      {/* ── سفر یک نوبت — روایت مرکزی (جایگزین سه‌گام قدیمی، anchor #how حفظ) ── */}
      <StorySection />

      {/* ── امکانات ─────────────────────────────────────────────────────── */}
      <section id="features" className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="text-center max-w-xl mx-auto mb-12 nl-reveal">
          <div className="text-sm font-semibold text-trust mb-3">امکانات</div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">هرچه برای مدیریت نوبت‌ها لازم دارید</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {FEATURES.map((f, i) => (
            <div key={f.t} className="rounded-2xl border border-sand bg-white p-7 transition hover:-translate-y-1.5 hover:shadow-[0_22px_44px_-20px_rgba(0,0,0,0.32)] nl-reveal" style={{ transitionDelay: `${(i % 2) * 90}ms` }}>
              <div className="w-11 h-11 rounded-xl bg-trust-wash text-trust-deep flex items-center justify-center mb-5">
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

      {/* ── تخصص‌ها — رنگ هر نیچ فقط همین‌جا و در موکاپ hero ظاهر می‌شود ── */}
      <section id="niches" className="border-y border-sand bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center max-w-xl mx-auto mb-12 nl-reveal">
            <div className="text-sm font-semibold text-trust mb-3">تخصص‌ها</div>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">برای هر تخصص، با رنگ و هویت خودش</h2>
            <p className="mt-4 text-sm text-soot leading-relaxed">صفحه‌ی هر متخصص با رنگ حوزه‌ی خودش شخصی‌سازی می‌شود؛ حوزه‌های تازه به‌تدریج اضافه خواهند شد.</p>
          </div>
          {loading ? (
            <div className="grid sm:grid-cols-3 gap-4">
              {[0, 1, 2].map(i => <div key={i} className="h-44 rounded-2xl border border-sand bg-paper animate-pulse" />)}
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-4">
              {niches.map((n, i) => {
                const c = `rgb(${n.default_theme})`
                return (
                  <div key={n.key}
                    className={`relative rounded-2xl border p-6 transition nl-reveal ${n.is_active ? 'border-sand bg-paper hover:-translate-y-1 hover:shadow-lg' : 'border-sand bg-paper opacity-60'}`}
                    style={{ transitionDelay: `${i * 90}ms` }}>
                    {!n.is_active && (
                      <span className="absolute top-4 left-4 text-[11px] font-semibold text-soot bg-sand px-2 py-0.5 rounded-full">به‌زودی</span>
                    )}
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                      style={{ background: `rgba(${n.default_theme.split(' ').join(',')},0.12)`, color: c }}>
                      <Icon path={NICHE_ICONS[n.icon] || NICHE_ICONS.default} />
                    </div>
                    <h3 className="font-display font-bold">{n.display_name}</h3>
                    <p className="mt-2 text-xs text-soot leading-relaxed min-h-[32px]">{n.tagline}</p>
                    <div className="mt-4 h-1 w-9 rounded-full" style={{ background: c, opacity: n.is_active ? 1 : 0.35 }} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── تعرفه‌ها — الزام شاپرک: قیمت خدمات باید روی سایت قابل احراز باشد ──
         سه پلن پلتفرمی (MODULES.md بخش 9) — اعداد نمایشی از PLAN_PRICING؛
         منبع عملیاتی platform_settings است و باید هم‌زمان تغییر کنند. */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="text-center mb-4 nl-reveal">
          <div className="text-sm font-semibold text-trust mb-3">تعرفه‌ها</div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">قیمت‌گذاری شفاف، بدون هزینه‌ی پنهان</h2>
        </div>
        <p className="text-center text-sm text-soot mb-6 nl-reveal">
          14 روز اول، همه‌ی امکانات «حرفه‌ای» برای همه رایگان است — بدون نیاز به کارت بانکی.
        </p>
        <div className="flex justify-center mb-8 nl-reveal">
          <div className="inline-flex rounded-full border border-sand bg-white p-1">
            <button type="button" onClick={() => setBilling('monthly')}
              className={`text-[13px] font-semibold px-4 py-1.5 rounded-full transition ${billing === 'monthly' ? 'bg-ink text-white' : 'text-soot hover:text-ink'}`}>
              ماهانه
            </button>
            <button type="button" onClick={() => setBilling('annual')}
              className={`text-[13px] font-semibold px-4 py-1.5 rounded-full transition tnum ${billing === 'annual' ? 'bg-ink text-white' : 'text-soot hover:text-ink'}`}>
              سالانه (2 ماه رایگان)
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">

          {/* پایه */}
          <div className="rounded-2xl border border-sand bg-white p-6 flex flex-col nl-reveal">
            <div className="font-display font-bold text-lg">پایه</div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display font-extrabold text-3xl tnum">{(billing === 'annual' ? PLAN_PRICING.base.annual : PLAN_PRICING.base.monthly).toLocaleString('en-US')}</span>
              <span className="text-xs text-soot">{billing === 'annual' ? 'تومان / سال' : 'تومان / ماه'}</span>
            </div>
            {billing === 'annual' && (
              <p className="mt-0.5 text-[11px] text-emerald-700 tnum">معادل {Math.round(PLAN_PRICING.base.annual / 12 / 1000).toLocaleString('en-US')} هزار تومان در ماه — 2 ماه رایگان</p>
            )}
            <p className="mt-1 text-[11px] text-soot tnum">+ کارمزد {PLAN_PRICING.base.feePct}% هر تراکنش آنلاین (حداقل {PLAN_PRICING.base.feeFloor.toLocaleString('en-US')} ت)</p>
            <ul className="mt-5 space-y-2.5 text-[13px] text-soot leading-relaxed flex-1">
              <li>✓ صفحه‌ی رزرو اختصاصی با نشانی برندشده</li>
              <li>✓ رزرو و مدیریت نوبت‌ها بدون محدودیت</li>
              <li>✓ درگاه پرداخت آنلاین نوبت‌لینک</li>
              <li>✓ فرم‌ساز رزرو با سوال‌های دلخواه</li>
              <li>✓ کنسل نوبت توسط خود مشتری</li>
              <li>✓ پنل مدیریت، پرونده‌ها و گزارش مالی</li>
              <li className="tnum">✓ {PLAN_PRICING.base.sms} پیامک در ماه</li>
              <li>✓ تسویه‌ی {PLAN_PRICING.base.settlement}</li>
            </ul>
            <a href="/signup" className="mt-6 text-center font-display font-bold text-ink border border-ink px-6 py-3 rounded-xl hover:bg-ink hover:text-white transition">شروع رایگان</a>
          </div>

          {/* حرفه‌ای — پیشنهاد ما */}
          <div className="rounded-2xl border-2 border-ink bg-white p-6 flex flex-col relative nl-reveal" style={{ transitionDelay: '90ms' }}>
            <span className="absolute -top-3 right-6 text-[11px] font-bold text-white bg-ink px-3 py-1 rounded-full">پیشنهاد ما</span>
            <div className="font-display font-bold text-lg">حرفه‌ای</div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display font-extrabold text-3xl tnum">{(billing === 'annual' ? PLAN_PRICING.pro.annual : PLAN_PRICING.pro.monthly).toLocaleString('en-US')}</span>
              <span className="text-xs text-soot">{billing === 'annual' ? 'تومان / سال' : 'تومان / ماه'}</span>
            </div>
            {billing === 'annual' && (
              <p className="mt-0.5 text-[11px] text-emerald-700 tnum">معادل {Math.round(PLAN_PRICING.pro.annual / 12 / 1000).toLocaleString('en-US')} هزار تومان در ماه — 2 ماه رایگان</p>
            )}
            <p className="mt-1 text-[11px] text-soot tnum">+ کارمزد {PLAN_PRICING.pro.feePct}% هر تراکنش آنلاین (حداقل {PLAN_PRICING.pro.feeFloor.toLocaleString('en-US')} ت)</p>
            <ul className="mt-5 space-y-2.5 text-[13px] text-soot leading-relaxed flex-1">
              <li className="text-ink font-medium">✓ همه‌ی امکانات «پایه»</li>
              <li>✓ یادآوری پیامکی خودکار نوبت‌ها</li>
              <li>✓ لیست انتظار هوشمند</li>
              <li>✓ نظرات و امتیاز مشتریان</li>
              <li>✓ آمار و تحلیل کسب‌وکار</li>
              <li>✓ کدهای تخفیف</li>
              <li>✓ جلسه‌ی آنلاین (Meet/واتساپ/…)</li>
              <li className="tnum">✓ {PLAN_PRICING.pro.sms} پیامک در ماه</li>
              <li>✓ تسویه‌ی {PLAN_PRICING.pro.settlement}</li>
            </ul>
            <a href="/signup" className="mt-6 text-center font-display font-bold text-white bg-ink px-6 py-3 rounded-xl hover:opacity-90 transition">شروع با 14 روز رایگان</a>
          </div>

          {/* تیم */}
          <div className="rounded-2xl border border-sand bg-white p-6 flex flex-col nl-reveal" style={{ transitionDelay: '180ms' }}>
            <div className="font-display font-bold text-lg">تیم</div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display font-extrabold text-3xl tnum">{(billing === 'annual' ? PLAN_PRICING.team.annual : PLAN_PRICING.team.monthly).toLocaleString('en-US')}</span>
              <span className="text-xs text-soot">{billing === 'annual' ? 'تومان / سال' : 'تومان / ماه'}</span>
            </div>
            {billing === 'annual' && (
              <p className="mt-0.5 text-[11px] text-emerald-700 tnum">معادل {Math.round(PLAN_PRICING.team.annual / 12 / 1000).toLocaleString('en-US')} هزار تومان در ماه — 2 ماه رایگان</p>
            )}
            <p className="mt-1 text-[11px] text-soot tnum">+ کارمزد {PLAN_PRICING.team.feePct}% هر تراکنش آنلاین (حداقل {PLAN_PRICING.team.feeFloor.toLocaleString('en-US')} ت)</p>
            <ul className="mt-5 space-y-2.5 text-[13px] text-soot leading-relaxed flex-1">
              <li className="text-ink font-medium">✓ همه‌ی امکانات «حرفه‌ای»</li>
              <li className="tnum">✓ چندپرسنلی — تا {PLAN_PRICING.team.includedStaff} نفر (هر نفر اضافه {PLAN_PRICING.team.extraStaff.toLocaleString('en-US')} ت)</li>
              <li>✓ ورود مستقل هر پرسنل به پنل خودش</li>
              <li>✓ پیام گروهی به مشتریان (کمپین)</li>
              <li className="tnum">✓ {PLAN_PRICING.team.sms} پیامک در ماه</li>
              <li>✓ تسویه‌ی {PLAN_PRICING.team.settlement}</li>
            </ul>
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('فعال‌سازی پلن تیم')}`} className="mt-6 text-center font-display font-bold text-ink border border-ink px-6 py-3 rounded-xl hover:bg-ink hover:text-white transition">هماهنگی با پشتیبانی</a>
          </div>
        </div>

        <p className="text-center text-[12px] text-soot mt-5 nl-reveal tnum">
          قیمت‌ها بدون احتساب {PLAN_PRICING.vatPercent}% مالیات بر ارزش افزوده · پیامک بیشتر با بسته‌ی شارژ
        </p>

        <div className="max-w-3xl mx-auto mt-6 text-[13px] text-soot leading-relaxed bg-white border border-sand rounded-2xl p-5 nl-reveal">
          <p>
            <strong className="text-ink">بهای خدمات هر متخصص چگونه تعیین می‌شود؟</strong> بهای هر خدمت (برای نمونه، جلسه‌ی مشاوره) را خود متخصص تعیین می‌کند و
            پیش از پرداخت، به‌صورت شفاف روی صفحه‌ی رزرو او نمایش داده می‌شود. پرداخت آنلاین از طریق درگاه پرداخت نوبت‌لینک (دارای مجوز رسمی پرداخت کشور) انجام می‌شود؛ کارمزد {PLATFORM_NAME} طبق پلن انتخابی متخصص (<span className="tnum">{PLAN_PRICING.team.feePct}% تا {PLAN_PRICING.base.feePct}%</span>، با حداقل مشخص) هنگام تسویه از سهم او کسر می‌شود؛ مابقی به‌صورت دوره‌ای با متخصص تسویه و به حساب او واریز می‌گردد. مراجع همان قیمت اعلام‌شده را می‌پردازد و هیچ مبلغ اضافه‌ای از او دریافت نمی‌شود.
            {DEMO_SLUG && <> برای مشاهده‌ی فرایند کامل رزرو و پرداخت، <a href={`/${DEMO_SLUG}`} target="_blank" className="text-ink underline underline-offset-4">صفحه‌ی نمونه</a> را ببینید.</>}
          </p>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="border-y border-sand bg-white">
        <div className="max-w-2xl mx-auto px-6 py-16">
          <div className="text-center mb-10 nl-reveal">
            <div className="text-sm font-semibold text-trust mb-3">پرسش‌های پرتکرار</div>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">پاسخ پرسش‌های شما</h2>
          </div>
          <div className="space-y-2.5 nl-reveal">
            {FAQS.map((f, i) => (
              <div key={f.q} className="rounded-xl border border-sand bg-paper overflow-hidden">
                <button onClick={() => setFaq(faq === i ? -1 : i)}
                  className="w-full text-right px-5 py-4 flex items-center justify-between gap-4">
                  <span className="font-display font-bold text-[15px]">{f.q}</span>
                  <span className={`text-soot transition-transform ${faq === i ? 'rotate-45' : ''}`}>+</span>
                </button>
                {faq === i && <p className="px-5 pb-4 text-sm text-soot leading-relaxed">{f.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA پایانی ──────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-6">
        <div className="rounded-3xl bg-ink text-white p-10 sm:p-14 text-center nl-reveal">
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">صفحه‌ی نوبت‌دهی شما، امروز آماده می‌شود</h2>
          <p className="mt-4 text-white/70 max-w-md mx-auto leading-relaxed">ثبت‌نام رایگان است و راه‌اندازی کمتر از پنج دقیقه زمان می‌برد.</p>
          <a href="/signup" className="inline-block mt-8 font-display font-bold text-ink bg-white px-8 py-3.5 rounded-xl hover:-translate-y-0.5 hover:shadow-xl transition">شروع رایگان</a>
        </div>
      </section>

      {/* ── تماس با ما — لازم برای احراز شاپرک/اینماد ───────────────────── */}
      <section id="contact" className="max-w-5xl mx-auto px-6 pt-10 pb-16">
        <div className="rounded-2xl border border-sand bg-white p-8 max-w-2xl mx-auto nl-reveal">
          <h2 className="font-display font-extrabold text-2xl tracking-tightest text-center">تماس با ما</h2>
          <p className="mt-2 text-sm text-soot max-w-md mx-auto leading-relaxed text-center">
            پرسش خود را همین‌جا مطرح کنید؛ پاسخ به نشانی ایمیل شما ارسال می‌شود. کاربران {PLATFORM_NAME} از داخل پنل خود نیز می‌توانند تیکت پشتیبانی ثبت کنند.
          </p>

          {contactSent ? (
            <div className="mt-6 text-center bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
              <div className="font-display font-bold text-emerald-700">پیام شما دریافت شد ✓</div>
              <p className="mt-1 text-sm text-soot">در نخستین فرصت از طریق ایمیل پاسخ خواهیم داد.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                placeholder="نشانی ایمیل شما (پاسخ به همین نشانی ارسال می‌شود)" dir="ltr"
                className="w-full text-sm px-4 py-3 border border-sand rounded-xl focus:outline-none focus:border-ink placeholder:text-right" />
              <textarea value={contactMsg} onChange={e => setContactMsg(e.target.value)} rows={4}
                placeholder="متن پیام یا پرسش خود را بنویسید…"
                className="w-full text-sm px-4 py-3 border border-sand rounded-xl resize-none focus:outline-none focus:border-ink" />
              {contactErr && <p className="text-xs text-red-600">{contactErr}</p>}
              <button onClick={sendContact} disabled={contactBusy}
                className="w-full font-display font-bold text-white bg-ink px-6 py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50">
                {contactBusy ? 'در حال ارسال…' : 'ارسال پیام'}
              </button>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-sand flex items-center justify-center gap-6 flex-wrap text-sm">
            <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="flex items-center gap-2 text-ink font-medium hover:underline underline-offset-4">
              <Icon path='<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>' className="w-4 h-4" />
              {SUPPORT_EMAIL}
            </a>
            {SUPPORT_PHONE && (
              <a href={`tel:${SUPPORT_PHONE}`} dir="ltr" className="flex items-center gap-2 text-ink font-medium hover:underline underline-offset-4 tnum">
                <Icon path='<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>' className="w-4 h-4" />
                {SUPPORT_PHONE}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ── فوتر ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-sand bg-white">
        <div className="max-w-5xl mx-auto px-6 py-12 grid gap-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt={`لوگوی ${PLATFORM_NAME}`} className="w-8 h-8" />
              <span className="font-display font-extrabold text-lg tracking-tightest">{PLATFORM_NAME}</span>
            </div>
            <p className="mt-3 text-xs text-soot leading-relaxed max-w-[220px]">
              پلتفرم نوبت‌دهی آنلاین برای متخصصان و کسب‌وکارهای خدماتی — صفحه‌ی رزرو اختصاصی، پرداخت آنلاین و یادآوری خودکار.
            </p>
          </div>

          <div>
            <div className="font-display font-bold text-sm mb-3">دسترسی سریع</div>
            <nav className="flex flex-col gap-2.5 text-xs text-soot">
              <a href="#how" className="hover:text-ink w-fit">نحوه‌ی کار</a>
              <a href="#pricing" className="hover:text-ink w-fit">تعرفه‌ها</a>
              <a href="#faq" className="hover:text-ink w-fit">پرسش‌های پرتکرار</a>
              <a href="/terms" className="hover:text-ink w-fit">قوانین و شرایط استفاده</a>
              <a href="/privacy" className="hover:text-ink w-fit">حریم خصوصی</a>
            </nav>
          </div>

          <div>
            <div className="font-display font-bold text-sm mb-3">ارتباط با ما</div>
            <div className="flex flex-col gap-2.5 text-xs text-soot">
              <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="hover:text-ink w-fit">{SUPPORT_EMAIL}</a>
              {SUPPORT_PHONE && <a href={`tel:${SUPPORT_PHONE}`} dir="ltr" className="hover:text-ink w-fit tnum">{SUPPORT_PHONE}</a>}
              <a href="#contact" className="hover:text-ink w-fit">فرم تماس با ما</a>
            </div>
            {/* نماد اعتماد الکترونیکی (اینماد) — بدون rel="noopener noreferrer" طبق دستور اینماد */}
            <a referrerPolicy="origin" target="_blank" className="inline-block mt-4"
              href="https://trustseal.enamad.ir/?id=753950&Code=AcwMyu4tgps3IUpdr2taP5QYaQkTCSyp">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img referrerPolicy="origin"
                src="https://trustseal.enamad.ir/logo.aspx?id=753950&Code=AcwMyu4tgps3IUpdr2taP5QYaQkTCSyp"
                alt="نماد اعتماد الکترونیکی" style={{ cursor: 'pointer' }} data-code="AcwMyu4tgps3IUpdr2taP5QYaQkTCSyp"
                className="h-16 w-auto" />
            </a>
          </div>
        </div>

        <div className="border-t border-sand">
          <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-soot">
            <span className="tnum">© {jalaliYear()} {PLATFORM_NAME} — همه‌ی حقوق محفوظ است.</span>
            <span>ساخته‌شده برای متخصصان ایرانی</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
