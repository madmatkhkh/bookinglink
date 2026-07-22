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
import { useScrollFX } from './useScrollFX'

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

// نوار پیشرفت اسکرول — باریک، بالای صفحه، با رنگ اعتماد. سبک و بدون کتابخانه.
function ScrollProgress() {
  const [p, setP] = useState(0)
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const h = document.documentElement
        const max = h.scrollHeight - h.clientHeight
        setP(max > 0 ? (h.scrollTop / max) * 100 : 0)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])
  return (
    <div className="fixed top-0 inset-x-0 z-[60] h-0.5 bg-transparent" aria-hidden="true">
      <div className="h-full bg-trust transition-[width] duration-150 ease-out" style={{ width: `${p}%` }} />
    </div>
  )
}

// ── «داشبورد» — روایت ساخته‌شدن مرکز فرماندهی کسب‌وکار ─────────────────────
// چهار ماژول یکی‌یکی با اسکرول سرجایشان می‌نشینند (تقویم → پرداخت → پرونده →
// گزارش) و کنارشان یک جمله‌ی روایت عوض می‌شود. همان مکانیزم pin/scrub story.
const DASH_STEPS = [
  { n: '1', t: 'همه‌ی نوبت‌ها، یک‌جا', d: 'تقویم زنده‌ی همه‌ی مراجعان و پرسنل — بدون دفتر کاغذی، بدون دابل‌بوکینگ. هر تغییری آنی همه‌جا اعمال می‌شود.' },
  { n: '2', t: 'پول، خودکار و شفاف', d: 'هر پرداخت آنلاین ثبت، کارمزد و سهم شما جدا، و تسویه‌ی دوره‌ای به حسابتان. دیگر خبری از رسید کارت‌به‌کارت و حساب‌وکتاب دستی نیست.' },
  { n: '3', t: 'پرونده‌ی هر مراجع', d: 'سابقه‌ی جلسات، یادداشت‌ها و مراحل درمان هر مراجع کنار هم. همه‌چیز محرمانه و همیشه در دسترس.' },
  { n: '4', t: 'گزارشی که تصمیم می‌سازد', d: 'درآمد، نرخ حضور، پرمخاطب‌ترین ساعت‌ها — تصویر کاملی از کسب‌وکارتان که کمک می‌کند بهتر تصمیم بگیرید.' },
]

function DashboardMock({ step }: { step: number }) {
  // هر ماژول تا وقتی نوبتش نرسیده کم‌رنگ و کمی پایین است؛ با رسیدن step فعال می‌شود
  const M = (i: number) =>
    `rounded-xl border bg-white p-2.5 sm:p-3.5 transition-all duration-500 motion-reduce:transition-none ${step >= i ? 'opacity-100 translate-y-0 border-sand' : 'opacity-30 translate-y-2 border-sand/50'}`
  const active = (i: number) => step === i ? 'ring-2 ring-trust/40' : ''
  return (
    <div className="w-full max-w-[330px] sm:max-w-[440px] mx-auto">
      <div className="rounded-2xl border border-sand bg-canvas shadow-[0_30px_70px_-30px_rgba(0,0,0,0.35)] overflow-hidden">
        {/* نوار بالای داشبورد */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-sand bg-white">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-ink text-white flex items-center justify-center font-display font-bold text-xs">ن</span>
            <span className="font-display font-bold text-[13px]">داشبورد</span>
          </div>
          <span className="text-[10px] text-soot">دکتر شیرین احمدی</span>
        </div>
        <div className="p-2.5 sm:p-3.5 grid grid-cols-2 gap-2 sm:gap-3">
          {/* ماژول 1: تقویم */}
          <div className={`${M(0)} ${active(0)} col-span-2`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-ink">تقویم امروز</span>
              <span className="text-[9px] text-soot tnum">پنجشنبه · 6 نوبت</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {['09:00', '10:30', '12:00', '14:00', '15:30', '17:00', '18:00', '19:30'].map((t, k) => (
                <span key={t} className={`text-center text-[9px] rounded-md py-1 tnum ${k < 6 ? 'bg-trust text-white' : 'bg-sand text-soot'}`}>{t}</span>
              ))}
            </div>
          </div>
          {/* ماژول 2: پرداخت/مالی */}
          <div className={`${M(1)} ${active(1)}`}>
            <div className="text-[10px] text-soot mb-1">درآمد این ماه</div>
            <div className="font-display font-extrabold text-lg tnum">42,600,000</div>
            <div className="mt-2 flex items-end gap-1 h-8">
              {[40, 55, 45, 70, 60, 85, 75].map((h, k) => (
                <span key={k} className="flex-1 rounded-sm bg-trust/70" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          {/* ماژول 3: پرونده‌ی مراجع */}
          <div className={`${M(2)} ${active(2)}`}>
            <div className="text-[10px] text-soot mb-2">پرونده‌ها</div>
            <div className="space-y-1.5">
              {['علی رضایی', 'مریم کریمی', 'سارا محمدی'].map((nm, k) => (
                <div key={nm} className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-sand text-[8px] flex items-center justify-center text-soot">{nm[0]}</span>
                  <span className="text-[10px] text-ink flex-1">{nm}</span>
                  <span className="text-[8px] text-soot tnum">جلسه {k + 2}</span>
                </div>
              ))}
            </div>
          </div>
          {/* ماژول 4: گزارش/تسویه */}
          <div className={`${M(3)} ${active(3)} col-span-2`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-ink">تسویه‌ی آماده</span>
              <span className="text-[11px] font-bold text-trust-deep tnum">38,340,000 تومان</span>
            </div>
            <div className="flex items-center gap-3 text-[9px] text-soot">
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-trust" /> نرخ حضور 94%</span>
              <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ink" /> پرمخاطب: عصرها</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DashboardStory() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const root = rootRef.current
    if (!root) return

    if (reduced) {
      // حرکت‌کاهیده: همه‌ی ماژول‌ها روشن، تشخیص متن با IntersectionObserver
      setStep(DASH_STEPS.length - 1)
      const blocks = Array.from(root.querySelectorAll('[data-dstep]'))
      const obs = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.dstep)) })
      }, { rootMargin: '-45% 0px -45% 0px' })
      blocks.forEach(b => obs.observe(b))
      return () => obs.disconnect()
    }

    let ctx: any, killed = false
    ;(async () => {
      const gsapMod = await import('gsap')
      const stMod = await import('gsap/ScrollTrigger')
      if (killed) return
      const gsap = (gsapMod as any).default || gsapMod
      const ScrollTrigger = (stMod as any).ScrollTrigger || (stMod as any).default
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        const n = DASH_STEPS.length
        const per = window.innerWidth < 768 ? 0.7 : 1
        ScrollTrigger.create({
          trigger: root,
          start: 'top top',
          end: () => '+=' + window.innerHeight * n * per,
          pin: root.querySelector('[data-pin]') as Element,
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self: any) => setStep(Math.min(n - 1, Math.floor(self.progress * n))),
        })
      }, root)
    })()
    return () => { killed = true; if (ctx) ctx.revert() }
  }, [])

  return (
    <section id="features" ref={rootRef} className="relative bg-white">
      <div data-pin className="min-h-screen flex items-center overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 w-full py-6 md:py-12">
          <div className="text-center max-w-xl mx-auto mb-4 md:mb-12">
            <div className="text-xs sm:text-sm font-semibold text-trust mb-2 md:mb-3">یک پلتفرم، نه یک ابزار</div>
            <h2 className="font-display font-extrabold text-2xl sm:text-4xl tracking-tightest">همه‌ی کسب‌وکارتان، از یک داشبورد</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3 md:gap-12 items-center">
            <div className="order-2 md:order-none">
              <DashboardMock step={step} />
            </div>
            <div className="relative min-h-[118px] md:min-h-[240px] order-1 md:order-none">
              {DASH_STEPS.map((b, i) => (
                <div key={b.n} data-dstep={i}
                  className={`absolute inset-0 flex flex-col justify-center text-center md:text-right transition-all duration-500 motion-reduce:transition-none ${step === i ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}>
                  <h3 className="font-display font-bold text-xl sm:text-3xl mb-2 md:mb-3 tracking-tightest">{b.t}</h3>
                  <p className="text-[13px] sm:text-base text-soot leading-relaxed max-w-sm mx-auto md:mx-0">{b.d}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 md:mt-8 flex gap-1.5 justify-center">
            {DASH_STEPS.map((_, i) => (
              <span key={i} className={`h-1 rounded-full transition-all duration-300 ${step === i ? 'w-8 bg-trust' : 'w-3 bg-trust/25'}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
// الگوی oryzo: یک شیء قهرمان (گوشی) sticky می‌ماند و اسکرول کاربر پرده‌های
// داستان را داخلش عوض می‌کند — بدون WebGL و کتابخانه‌ی جدید؛ فقط sticky +
// IntersectionObserver (همان الگوی nl-reveal). ارقام لاتین، تابع reduced-motion.
const STORY_BEATS = [
  { n: '1', t: 'ساعت 23:41 است', d: 'هر نوبت، ده پیام. هر پرداخت، یک اسکرین‌شات رسید. هر کنسلی، یک صندلی خالی که دیر خبرش می‌رسد. تقویم شما در دایرکت دیگران زندگی می‌کند.' },
  { n: '2', t: 'همه‌اش جمع می‌شود در یک خط', d: 'nobatlink.com/نام-شما — صفحه‌ای با رنگ و هویت خودتان. از این‌جا به بعد، مراجع با صفحه‌ی شما طرف است، نه با گوشی شما.' },
  { n: '3', t: 'مراجع خودش رزرو می‌کند', d: 'زمان‌های خالی را می‌بیند، انتخاب می‌کند و همان‌جا آنلاین پرداخت می‌کند. بدون پیام، بدون هماهنگی دستی — حتی وقتی خواب هستید.' },
  { n: '4', t: 'شما فقط مدیریت می‌کنید', d: 'تایید لحظه‌ای، یادآور خودکار، پول در مسیر تسویه، و همه‌ی پرونده‌ها و گزارش‌های مالی یک‌جا. کسب‌وکارتان خودش می‌چرخد؛ شما تصمیم می‌گیرید.' },
]

// صحنه‌های داخل گوشی — همان زبان بصری موکاپ hero (absolute + opacity/translate)
function StoryPhone({ scene }: { scene: number }) {
  const S = (i: number) =>
    `absolute inset-0 p-4 transition-all duration-500 motion-reduce:transition-none ${scene === i ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`
  return (
    <div className="mx-auto w-full max-w-[250px] sm:max-w-[280px]">
      <div className="rounded-[2rem] border border-sand bg-white shadow-[0_24px_60px_-28px_rgba(0,0,0,0.3)] overflow-hidden">
        {/* نوار وضعیت گوشی */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[10px] text-soot">
          <span className="tnum">{scene === 0 ? '23:41' : '10:05'}</span>
          <span className="w-16 h-4 rounded-full bg-sand" />
          <span className="tnum" dir="ltr">100%</span>
        </div>
        <div className="relative h-[290px] sm:h-[360px] border-t border-sand">

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
  const rootRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const root = rootRef.current
    if (!root) return

    // حرکت‌کاهیده: پین نمی‌کنیم؛ پرده‌ها با IntersectionObserver ساده عوض می‌شوند
    if (reduced) {
      const blocks = Array.from(root.querySelectorAll('[data-beat]'))
      const obs = new IntersectionObserver(es => {
        es.forEach(e => { if (e.isIntersecting) setScene(Number((e.target as HTMLElement).dataset.beat)) })
      }, { rootMargin: '-45% 0px -45% 0px' })
      blocks.forEach(b => obs.observe(b))
      return () => obs.disconnect()
    }

    let ctx: any, killed = false
    ;(async () => {
      const gsapMod = await import('gsap')
      const stMod = await import('gsap/ScrollTrigger')
      if (killed) return
      const gsap = (gsapMod as any).default || gsapMod
      const ScrollTrigger = (stMod as any).ScrollTrigger || (stMod as any).default
      gsap.registerPlugin(ScrollTrigger)

      ctx = gsap.context(() => {
        const n = STORY_BEATS.length
        const isMobile = window.innerWidth < 768
        // بخش پین می‌شود و گوشی + متن‌ها ثابت می‌مانند؛ با پیشرفت اسکرول scene
        // عوض می‌شود (سینمایی، بدون اسکرول‌هایجک). روی موبایل طول پین کوتاه‌تر
        // است تا سنگین و کند حس نشود (توصیه‌ی اسکیل: شدت کمتر روی موبایل).
        const per = isMobile ? 0.7 : 1
        ScrollTrigger.create({
          trigger: root,
          start: 'top top',
          end: () => '+=' + window.innerHeight * n * per,
          pin: root.querySelector('[data-pin]') as Element,
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self: any) => {
            const idx = Math.min(n - 1, Math.floor(self.progress * n))
            setScene(idx)
          },
        })
      }, root)
    })()
    return () => { killed = true; if (ctx) ctx.revert() }
  }, [])

  return (
    <section id="how" ref={rootRef} className="relative border-y border-sand bg-trust-wash/40">
      {/* ناحیه‌ی پین‌شونده — یک صفحه‌ی کامل که گوشی و متن کنارش ثابت می‌ماند */}
      <div data-pin className="min-h-screen flex items-center overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 w-full py-6 md:py-12">
          <div className="text-center max-w-xl mx-auto mb-4 md:mb-12">
            <div className="text-xs sm:text-sm font-semibold text-trust mb-2 md:mb-3">از آشوب تا آرامش</div>
            <h2 className="font-display font-extrabold text-2xl sm:text-4xl tracking-tightest">کل کسب‌وکارتان، در یک نقطه</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3 md:gap-12 items-center">
            {/* گوشی — امضای بصری، ثابت در مرکز صحنه */}
            <div className="flex justify-center">
              <StoryPhone scene={scene} />
            </div>
            {/* متن پرده‌ی فعال — cross-fade نرم؛ فقط یکی هم‌زمان دیده می‌شود */}
            <div className="relative min-h-[124px] md:min-h-[240px]">
              {STORY_BEATS.map((b, i) => (
                <div key={b.n} data-beat={i}
                  className={`absolute inset-0 flex flex-col justify-center text-center md:text-right transition-all duration-500 motion-reduce:transition-none ${scene === i ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}>
                  <h3 className="font-display font-bold text-xl sm:text-3xl mb-2 md:mb-3 tracking-tightest">{b.t}</h3>
                  <p className="text-[13px] sm:text-base text-soot leading-relaxed max-w-sm mx-auto md:mx-0">{b.d}</p>
                </div>
              ))}
            </div>
          </div>
          {/* نوار پیشرفت پرده‌ها */}
          <div className="mt-4 md:mt-8 flex gap-1.5 justify-center">
            {STORY_BEATS.map((_, i) => (
              <span key={i} className={`h-1 rounded-full transition-all duration-300 ${scene === i ? 'w-8 bg-trust' : 'w-3 bg-trust/25'}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}


// قابلیت‌های «مکمل» روایت داشبورد (تقویم/پرداخت/پرونده/گزارش آنجا نشان داده
// شده‌اند؛ این‌ها چیزهای دیگری‌اند تا تکرار نشود).
const FEATURES = [
  { icon: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    t: 'نشانی اختصاصی برندشده', d: 'صفحه‌ی رزرو با رنگ و هویت خودتان و نشانی کوتاه و به‌یادماندنی — کارت ویزیت دیجیتال شما.',
    tag: 'nobatlink.com/برند-شما' },
  { icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    t: 'یادآوری خودکار پیامکی', d: 'پیش از هر نوبت، پیامک یادآوری برای مراجع می‌رود تا نرخ عدم‌حضور به حداقل برسد.' },
  { icon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    t: 'لیست انتظار هوشمند', d: 'وقتی همه‌ی ساعت‌ها پر است، مراجع در صف می‌ماند و با خالی‌شدن هر زمان، با یک کلیک خبردار می‌شود.' },
  { icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    t: 'فرم رزرو دلخواه', d: 'سوال‌های اختصاصی خودتان را به فرم رزرو اضافه کنید؛ اطلاعات لازم پیش از جلسه در پرونده می‌نشیند.' },
  { icon: '<path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/><path d="M14 3h7v7"/><path d="M10 14 21 3"/>',
    t: 'جلسه‌ی آنلاین یک‌پارچه', d: 'برای جلسات آنلاین، لینک گوگل‌میت یا واتساپ همراه تایید نوبت به مراجع می‌رسد — بدون هماهنگی جداگانه.' },
  { icon: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M9 5v14"/>',
    t: 'کدهای تخفیف', d: 'کمپین‌های تخفیف بسازید و برای جذب مراجع تازه یا قدردانی از مراجعان قدیمی از آن‌ها استفاده کنید.' },
]

const FAQS = [
  { q: 'هزینه‌ی استفاده از نوبت‌لینک چقدر است؟', a: `سه پلن ماهانه دارد — پایه ${PLAN_PRICING.base.monthly.toLocaleString('en-US')}، حرفه‌ای ${PLAN_PRICING.pro.monthly.toLocaleString('en-US')} و تیم ${PLAN_PRICING.team.monthly.toLocaleString('en-US')} تومان — به‌علاوه کارمزد کوچک سقف‌دار روی هر تراکنش آنلاین (${PLAN_PRICING.team.feePct}% تا ${PLAN_PRICING.base.feePct}% بسته به پلن). 14 روز اول همه‌ی امکانات حرفه‌ای برای همه رایگان است. جزئیات در بخش «تعرفه‌ها» همین صفحه.` },
  { q: 'چه تفاوتی با نوبت‌دهی تلفنی و دفترچه‌ای دارد؟', a: 'در روش دستی، پاسخ‌گویی به تماس‌ها و پیام‌ها بر عهده‌ی شماست. در نوبت‌لینک، مراجع خودش زمان خالی را می‌بیند و رزرو می‌کند، یادآوری پیامکی به‌صورت خودکار ارسال می‌شود و آمار نوبت‌ها همیشه در دسترس شماست.' },
  { q: 'اطلاعات من و مراجعانم محفوظ است؟', a: 'داده‌ها به‌صورت رمزنگاری‌شده نگهداری می‌شوند و دسترسی به اطلاعات هر متخصص تنها برای خود او امکان‌پذیر است. شماره و اطلاعات مراجعان در اختیار هیچ شخص دیگری قرار نمی‌گیرد.' },
  { q: 'در حال حاضر از چه حوزه‌هایی پشتیبانی می‌کنید؟', a: 'تمرکز فعلی بر حوزه‌ی روانشناسی و مشاوره است که به‌طور کامل فعال است. سالن زیبایی و حوزه‌های دیگر در مرحله‌ی آماده‌سازی نهایی‌اند و به‌زودی در دسترس قرار می‌گیرند.' },
  { q: 'راه‌اندازی چقدر زمان می‌برد؟', a: 'کمتر از پنج دقیقه. ثبت‌نام کنید، حوزه‌ی کاری را انتخاب و برنامه‌ی هفتگی را تنظیم کنید؛ نشانی اختصاصی شما بلافاصله آماده‌ی اشتراک‌گذاری است.' },
]

// ── «هر چیزی که برای رشد لازم دارید» — روایت با مکانیزم متفاوت از دو بخش pinی
// قبلی تا یکنواخت نشود: مسیر افقی که با اسکرول عمودی حرکت می‌کند (کارت‌ها مثل
// نوار فیلم از کنار رد می‌شوند). RTL: کارت‌ها از راست به چپ می‌آیند.
// حرکت‌کاهیده: به‌جای نوار افقی، گرید عمودی عادی نشان داده می‌شود.
function FeatureTrack() {
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setReduced(true); return }
    const root = rootRef.current
    const track = trackRef.current
    if (!root || !track) return

    let ctx: any, killed = false
    ;(async () => {
      const gsapMod = await import('gsap')
      const stMod = await import('gsap/ScrollTrigger')
      if (killed) return
      const gsap = (gsapMod as any).default || gsapMod
      const ScrollTrigger = (stMod as any).ScrollTrigger || (stMod as any).default
      gsap.registerPlugin(ScrollTrigger)

      ctx = gsap.context(() => {
        const getShift = () => Math.max(0, track.scrollWidth - window.innerWidth + 48)
        gsap.to(track, {
          x: () => getShift(), // RTL: مثبت = حرکت به سمت چپ دید
          ease: 'none',
          scrollTrigger: {
            trigger: root,
            start: 'top top',
            end: () => '+=' + getShift(),
            pin: true,
            scrub: 0.5,
            invalidateOnRefresh: true,
          },
        })
      }, root)
    })()
    return () => { killed = true; if (ctx) ctx.revert() }
  }, [])

  // حالت حرکت‌کاهیده: گرید عمودی ساده (بدون افق/pin)
  if (reduced) {
    return (
      <section id="grow" className="max-w-5xl mx-auto px-6 pt-16 pb-10">
        <div className="text-center max-w-xl mx-auto mb-12">
          <div className="text-sm font-semibold text-trust mb-3">و خیلی چیزهای دیگر</div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">هر چیزی که برای رشد لازم دارید</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(f => (
            <div key={f.t} className="rounded-2xl border border-sand bg-white p-6">
              <div className="w-11 h-11 rounded-xl bg-trust-wash text-trust-deep flex items-center justify-center mb-5">
                <Icon path={f.icon} />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">{f.t}</h3>
              <p className="text-[13px] text-soot leading-relaxed mb-3">{f.d}</p>
              {f.tag && (
                <span dir="ltr" className="inline-block text-[12px] font-semibold text-trust-deep bg-trust-wash rounded-lg px-3 py-1.5">{f.tag}</span>
              )}
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section id="grow" ref={rootRef} className="relative bg-canvas border-y border-sand overflow-hidden">
      <div className="min-h-screen flex flex-col justify-center py-12">
        <div className="max-w-5xl mx-auto px-6 w-full mb-8 md:mb-12">
          <div className="text-sm font-semibold text-trust mb-3">و خیلی چیزهای دیگر</div>
          <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">هر چیزی که برای رشد لازم دارید</h2>
          <p className="mt-3 text-sm text-soot max-w-md hidden md:block">نوبت‌دهی و مدیریت فقط بخشی از کار است — این‌ها ابزارهایی‌اند که کسب‌وکارتان را جلو می‌برند.</p>
        </div>
        {/* نوار افقی — با اسکرول عمودی از راست به چپ حرکت می‌کند */}
        <div ref={trackRef} className="flex gap-5 px-6 md:px-[max(1.5rem,calc((100vw-64rem)/2))] will-change-transform" style={{ direction: 'rtl' }}>
          {FEATURES.map((f, i) => (
            <div key={f.t}
              className="shrink-0 w-[80vw] sm:w-[360px] rounded-2xl border border-sand bg-white p-7 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-11 h-11 rounded-xl bg-trust-wash text-trust-deep flex items-center justify-center shrink-0">
                  <Icon path={f.icon} />
                </span>
                <span dir="ltr" className="font-display font-extrabold text-2xl text-trust/40 tnum">{String(i + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="font-display font-bold text-xl mb-2.5">{f.t}</h3>
              <p className="text-sm text-soot leading-relaxed mb-3.5">{f.d}</p>
              {f.tag && (
                <span dir="ltr" className="inline-block text-[12px] font-semibold text-trust-deep bg-trust-wash rounded-lg px-3 py-1.5">{f.tag}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

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

  // GSAP ScrollTrigger — reveal/stagger/parallax/scrub روی [data-fx] ها.
  // بعد از لود دیتا اجرا می‌شود تا ارتفاع‌ها نهایی باشند. تابع reduced-motion
  // (داخل خود هوک) و در unmount پاک می‌شود.
  useScrollFX(!loading)

  // تغییر تاگل ماهانه/سالانه ارتفاع کارت‌ها را عوض می‌کند → موقعیت تریگرها را
  // تازه کن تا پین/ریویل بخش‌های پایین‌تر جابه‌جا نشوند.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let killed = false
    import('gsap/ScrollTrigger').then(m => {
      if (killed) return
      const ST = (m as any).ScrollTrigger || (m as any).default
      ST && ST.refresh()
    })
    return () => { killed = true }
  }, [billing, faq])

  // fallback سبک برای .nl-reveal (بخش‌های بدون data-fx و حالت بدون GSAP)
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
      {/* نوار پیشرفت اسکرول کل صفحه — حس تجربه‌ی پیوسته */}
      <ScrollProgress />
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

          {/* موکاپ زنده‌ی چندتخصصی — امضای صفحه (پارالاکس ملایم) */}
          <div className="animate-nl-up" data-fx="parallax" data-speed="0.12">
            <HeroShowcase />
          </div>
        </div>
      </section>

      {/* ── سفر یک نوبت — روایت مرکزی (جایگزین سه‌گام قدیمی، anchor #how حفظ) ── */}
      <StorySection />

      {/* ── داشبورد — روایت مرکز فرماندهی کسب‌وکار (pin/scrub) ── */}
      <DashboardStory />

      {/* ── هر چیزی که برای رشد لازم دارید — روایت افقی (مکانیزم متفاوت) ── */}
      <FeatureTrack />

      {/* ── تخصص‌ها — رنگ هر نیچ فقط همین‌جا و در موکاپ hero ظاهر می‌شود ── */}
      <section id="niches" className="border-y border-sand bg-white">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center max-w-xl mx-auto mb-12" data-fx="reveal">
            <div className="text-sm font-semibold text-trust mb-3">تخصص‌ها</div>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">برای هر تخصص، با رنگ و هویت خودش</h2>
            <p className="mt-4 text-sm text-soot leading-relaxed">صفحه‌ی هر متخصص با رنگ حوزه‌ی خودش شخصی‌سازی می‌شود؛ حوزه‌های تازه به‌تدریج اضافه خواهند شد.</p>
          </div>
          {loading ? (
            <div className="grid sm:grid-cols-3 gap-4">
              {[0, 1, 2].map(i => <div key={i} className="h-44 rounded-2xl border border-sand bg-paper animate-pulse" />)}
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-4" data-fx="stagger">
              {niches.map((n, i) => {
                const c = `rgb(${n.default_theme})`
                return (
                  <div key={n.key}
                    className={`relative rounded-2xl border p-6 transition ${n.is_active ? 'border-sand bg-paper hover:-translate-y-1 hover:shadow-lg' : 'border-sand bg-paper opacity-60'}`}
                    >
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
        <div className="text-center mb-4" data-fx="reveal">
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
        <div className="grid sm:grid-cols-3 gap-4" data-fx="stagger">

          {/* پایه */}
          <div className="rounded-2xl border border-sand bg-white p-6 flex flex-col overflow-hidden relative">
            <span className="absolute top-0 inset-x-0 h-1 bg-trust/40" />
            <div className="font-display font-bold text-lg">پایه</div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display font-extrabold text-3xl tnum">{(billing === 'annual' ? PLAN_PRICING.base.annual : PLAN_PRICING.base.monthly).toLocaleString('en-US')}</span>
              <span className="text-xs text-soot">{billing === 'annual' ? 'تومان / سال' : 'تومان / ماه'}</span>
            </div>
            {billing === 'annual' && (
              <p className="mt-0.5 text-[11px] text-trust-deep font-medium tnum">معادل {Math.round(PLAN_PRICING.base.annual / 12 / 1000).toLocaleString('en-US')} هزار تومان در ماه — 2 ماه رایگان</p>
            )}
            <p className="mt-1 text-[11px] text-soot tnum">+ کارمزد {PLAN_PRICING.base.feePct}% هر تراکنش آنلاین (حداقل {PLAN_PRICING.base.feeFloor.toLocaleString('en-US')} ت)</p>
            <ul className="mt-5 space-y-2.5 text-[13px] text-soot leading-relaxed flex-1 [&>li]:before:content-['✓'] [&>li]:before:text-trust [&>li]:before:font-bold [&>li]:before:ml-1.5">
              <li>صفحه‌ی رزرو اختصاصی با نشانی برندشده</li>
              <li>رزرو و مدیریت نوبت‌ها بدون محدودیت</li>
              <li>درگاه پرداخت آنلاین نوبت‌لینک</li>
              <li>فرم‌ساز رزرو با سوال‌های دلخواه</li>
              <li>کنسل نوبت توسط خود مشتری</li>
              <li>پنل مدیریت، پرونده‌ها و گزارش مالی</li>
              <li className="tnum">{PLAN_PRICING.base.sms} پیامک در ماه</li>
              <li>تسویه‌ی {PLAN_PRICING.base.settlement}</li>
            </ul>
            <a href="/signup" className="mt-6 text-center font-display font-bold text-ink border border-ink px-6 py-3 rounded-xl hover:bg-ink hover:text-white transition">شروع رایگان</a>
          </div>

          {/* حرفه‌ای — پیشنهاد ما (کارت قهرمان: پس‌زمینه‌ی آبی deep، متن سفید) */}
          <div className="rounded-2xl bg-trust-deep text-white p-6 flex flex-col relative shadow-[0_28px_60px_-24px_rgba(61,88,117,0.6)] md:-my-2 md:scale-[1.02]">
            <span className="absolute -top-3 right-6 text-[11px] font-bold text-trust-deep bg-white px-3 py-1 rounded-full shadow">پیشنهاد ما</span>
            <div className="font-display font-bold text-lg">حرفه‌ای</div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display font-extrabold text-3xl tnum">{(billing === 'annual' ? PLAN_PRICING.pro.annual : PLAN_PRICING.pro.monthly).toLocaleString('en-US')}</span>
              <span className="text-xs text-white/70">{billing === 'annual' ? 'تومان / سال' : 'تومان / ماه'}</span>
            </div>
            {billing === 'annual' && (
              <p className="mt-0.5 text-[11px] text-white/90 tnum">معادل {Math.round(PLAN_PRICING.pro.annual / 12 / 1000).toLocaleString('en-US')} هزار تومان در ماه — 2 ماه رایگان</p>
            )}
            <p className="mt-1 text-[11px] text-white/70 tnum">+ کارمزد {PLAN_PRICING.pro.feePct}% هر تراکنش آنلاین (حداقل {PLAN_PRICING.pro.feeFloor.toLocaleString('en-US')} ت)</p>
            <ul className="mt-5 space-y-2.5 text-[13px] text-white/85 leading-relaxed flex-1">
              <li className="text-white font-medium">✓ همه‌ی امکانات «پایه»</li>
              <li>✓ یادآوری پیامکی خودکار نوبت‌ها</li>
              <li>✓ لیست انتظار هوشمند</li>
              <li>✓ نظرات و امتیاز مشتریان</li>
              <li>✓ آمار و تحلیل کسب‌وکار</li>
              <li>✓ کدهای تخفیف</li>
              <li>✓ جلسه‌ی آنلاین (Meet/واتساپ/…)</li>
              <li className="tnum">✓ {PLAN_PRICING.pro.sms} پیامک در ماه</li>
              <li>✓ تسویه‌ی {PLAN_PRICING.pro.settlement}</li>
            </ul>
            <a href="/signup" className="mt-6 text-center font-display font-bold text-trust-deep bg-white px-6 py-3 rounded-xl hover:bg-trust-wash transition">شروع با 14 روز رایگان</a>
          </div>

          {/* تیم */}
          <div className="rounded-2xl border border-sand bg-white p-6 flex flex-col overflow-hidden relative">
            <span className="absolute top-0 inset-x-0 h-1 bg-ink/70" />
            <div className="font-display font-bold text-lg">تیم</div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display font-extrabold text-3xl tnum">{(billing === 'annual' ? PLAN_PRICING.team.annual : PLAN_PRICING.team.monthly).toLocaleString('en-US')}</span>
              <span className="text-xs text-soot">{billing === 'annual' ? 'تومان / سال' : 'تومان / ماه'}</span>
            </div>
            {billing === 'annual' && (
              <p className="mt-0.5 text-[11px] text-trust-deep font-medium tnum">معادل {Math.round(PLAN_PRICING.team.annual / 12 / 1000).toLocaleString('en-US')} هزار تومان در ماه — 2 ماه رایگان</p>
            )}
            <p className="mt-1 text-[11px] text-soot tnum">+ کارمزد {PLAN_PRICING.team.feePct}% هر تراکنش آنلاین (حداقل {PLAN_PRICING.team.feeFloor.toLocaleString('en-US')} ت)</p>
            <ul className="mt-5 space-y-2.5 text-[13px] text-soot leading-relaxed flex-1 [&>li]:before:content-['✓'] [&>li]:before:text-trust [&>li]:before:font-bold [&>li]:before:ml-1.5">
              <li className="text-ink font-medium">همه‌ی امکانات «حرفه‌ای»</li>
              <li className="tnum">چندپرسنلی — تا {PLAN_PRICING.team.includedStaff} نفر (هر نفر اضافه {PLAN_PRICING.team.extraStaff.toLocaleString('en-US')} ت)</li>
              <li>ورود مستقل هر پرسنل به پنل خودش</li>
              <li>پیام گروهی به مشتریان (کمپین)</li>
              <li className="tnum">{PLAN_PRICING.team.sms} پیامک در ماه</li>
              <li>تسویه‌ی {PLAN_PRICING.team.settlement}</li>
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
          <div className="text-center mb-10" data-fx="reveal">
            <div className="text-sm font-semibold text-trust mb-3">پرسش‌های پرتکرار</div>
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tightest">پاسخ پرسش‌های شما</h2>
          </div>
          <div className="space-y-2.5" data-fx="stagger">
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
        <div className="rounded-3xl bg-ink text-white p-10 sm:p-14 text-center" data-fx="scale">
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
