'use client'
// ─────────────────────────────────────────────────────────────────────────────
// زیرساخت اسکرول‌موشن لندینگ — GSAP + ScrollTrigger.
// یک هوک واحد که همه‌ی افکت‌های اسکرول صفحه را می‌سازد و در unmount پاک می‌کند.
//
// ⚠️ درس مهم (رفع باگ «کارت‌های ناپدید»): الگوی gsap.from({opacity:0}) عنصر را
// فورا مخفی می‌کند و برای برگرداندنش به شلیک تریگر وابسته است. وقتی یک بخش
// pinشونده (story) ارتفاع صفحه را دینامیک عوض می‌کند، محاسبه‌ی موقعیت تریگرها
// به‌هم می‌ریزد و بعضی گریدها هرگز شلیک نمی‌شوند → برای همیشه opacity:0 می‌مانند.
// راه‌حل مقاوم:
//   1) حالت اولیه را با gsap.set جدا ست می‌کنیم (نه از طریق from).
//   2) انیمیشن با toggleActions play اجرا می‌شود، نه once.
//   3) یک fallback با onRefresh/onEnter تضمین می‌کند اگر عنصر هنگام رفرش داخل
//      دید بود، فورا مرئی شود — پس هیچ عنصری گیر نمی‌کند.
//   4) بعد از آماده‌شدن layout (شامل pin)، چند بار refresh می‌کنیم.
//
// کاملا تابع prefers-reduced-motion: با حرکت‌کاهیده هیچ چیزی مخفی نمی‌شود.
// فقط transform/opacity (GPU)؛ بدون اسکرول‌هایجک.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react'

export function useScrollFX(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    if (typeof window === 'undefined') return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    let ctx: any
    let killed = false
    const timers: any[] = []

    ;(async () => {
      const gsapMod = await import('gsap')
      const stMod = await import('gsap/ScrollTrigger')
      if (killed) return
      const gsap = (gsapMod as any).default || gsapMod
      const ScrollTrigger = (stMod as any).ScrollTrigger || (stMod as any).default
      gsap.registerPlugin(ScrollTrigger)

      const isMobile = window.innerWidth < 768

      ctx = gsap.context(() => {
        // ── reveal + stagger: هر دو با یک الگوی مقاوم ────────────────────────
        // به‌جای from (که به شلیک وابسته است) fromTo با toggleActions می‌سازیم؛
        // اگر عنصر هنگام لود داخل دید بود، ScrollTrigger خودش onEnter را می‌زند.
        const animateInto = (targets: any, group: Element, stagger: number) => {
          gsap.set(targets, { opacity: 0, y: 40 })
          gsap.to(targets, {
            opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger,
            scrollTrigger: {
              trigger: group,
              start: 'top 88%',
              toggleActions: 'play none none none',
            },
          })
        }

        gsap.utils.toArray('[data-fx="reveal"]').forEach((el: any) => {
          animateInto(el, el, 0)
        })

        gsap.utils.toArray('[data-fx="stagger"]').forEach((group: any) => {
          const items = Array.from(group.querySelectorAll(':scope > *'))
          if (!items.length) return
          animateInto(items, group, 0.09)
        })

        // پارالاکس ملایم موکاپ هرو
        gsap.utils.toArray('[data-fx="parallax"]').forEach((el: any) => {
          const speed = parseFloat(el.dataset.speed || '0.2') * (isMobile ? 0.5 : 1)
          gsap.to(el, {
            yPercent: -speed * 100, ease: 'none',
            scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
          })
        })

        // scale-in باکس CTA
        gsap.utils.toArray('[data-fx="scale"]').forEach((el: any) => {
          gsap.set(el, { opacity: 0, scale: 0.92 })
          gsap.to(el, {
            opacity: 1, scale: 1, duration: 0.9, ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' },
          })
        })
      })

      // ── تضمین نهایی: بعد از اینکه همه‌چیز (شامل pin و فونت‌ها و دیتای نیچ‌ها)
      // چید، چند بار refresh کن تا موقعیت‌ها درست شوند. اگر عنصری به هر دلیل
      // مخفی ماند و داخل دید بود، دستی مرئی‌اش کن (fail-safe مطلق).
      const refreshAll = () => {
        if (killed) return
        ScrollTrigger.refresh()
        // fail-safe: هر [data-fx] که هنوز نامرئی و داخل ویوپورت است را نمایان کن
        document.querySelectorAll<HTMLElement>('[data-fx="reveal"], [data-fx="stagger"] > *, [data-fx="scale"]').forEach((el: any) => {
          const r = el.getBoundingClientRect()
          const inView = r.top < window.innerHeight && r.bottom > 0
          if (inView && parseFloat(getComputedStyle(el).opacity) < 0.05) {
            gsap.to(el, { opacity: 1, y: 0, scale: 1, duration: 0.4, overwrite: true })
          }
        })
      }
      timers.push(setTimeout(refreshAll, 300))
      timers.push(setTimeout(refreshAll, 900))
      window.addEventListener('load', refreshAll)
      timers.push(() => window.removeEventListener('load', refreshAll))
    })()

    return () => {
      killed = true
      timers.forEach(t => (typeof t === 'function' ? t() : clearTimeout(t)))
      if (ctx) ctx.revert()
    }
  }, [ready])
}
