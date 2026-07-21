'use client'
// ─────────────────────────────────────────────────────────────────────────────
// زیرساخت اسکرول‌موشن لندینگ — GSAP + ScrollTrigger.
// یک هوک واحد که همه‌ی افکت‌های اسکرول صفحه را می‌سازد و در unmount پاک می‌کند.
// کاملا تابع prefers-reduced-motion: با حرکت‌کاهیده، هیچ ScrollTrigger ساخته
// نمی‌شود و محتوا در حالت نهایی (opacity:1) می‌ماند — پس صفحه بدون JS هم خواناست.
//
// اصول عملکرد (طبق اسکیل scroll-experience): فقط transform/opacity انیمیت
// می‌شود (GPU)، هرگز layout؛ اسکرول‌هایجک نداریم (فقط scrub/reveal)؛ روی موبایل
// شدت پارالاکس کمتر است.
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

    ;(async () => {
      const gsapMod = await import('gsap')
      const stMod = await import('gsap/ScrollTrigger')
      if (killed) return
      const gsap = gsapMod.default || gsapMod
      const ScrollTrigger = stMod.ScrollTrigger || stMod.default
      gsap.registerPlugin(ScrollTrigger)

      const isMobile = window.innerWidth < 768

      ctx = gsap.context(() => {
        // 1) reveal پایه — هر [data-fx="reveal"] موقع ورود از پایین محو-به-روشن
        gsap.utils.toArray<HTMLElement>('[data-fx="reveal"]').forEach(el => {
          gsap.from(el, {
            opacity: 0, y: 40, duration: 0.9, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 85%', once: true },
          })
        })

        // 2) stagger — فرزندان [data-fx="stagger"] پشت‌سرهم بالا می‌آیند
        gsap.utils.toArray<HTMLElement>('[data-fx="stagger"]').forEach(group => {
          const items = group.querySelectorAll(':scope > *')
          gsap.from(items, {
            opacity: 0, y: 48, duration: 0.7, ease: 'power3.out',
            stagger: 0.09,
            scrollTrigger: { trigger: group, start: 'top 80%', once: true },
          })
        })

        // 3) پارالاکس — [data-fx="parallax"] با data-speed کندتر/تندتر از اسکرول
        gsap.utils.toArray<HTMLElement>('[data-fx="parallax"]').forEach(el => {
          const speed = parseFloat(el.dataset.speed || '0.2') * (isMobile ? 0.5 : 1)
          gsap.to(el, {
            yPercent: -speed * 100, ease: 'none',
            scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
          })
        })

        // 4) عنوان‌های بزرگ — کلمه‌به‌کلمه با اسکرول از خاکستری به مشکی (scrub)
        gsap.utils.toArray<HTMLElement>('[data-fx="words"]').forEach(el => {
          const words = el.querySelectorAll('[data-word]')
          if (!words.length) return
          gsap.fromTo(words,
            { opacity: 0.18 },
            {
              opacity: 1, ease: 'none', stagger: 0.2,
              scrollTrigger: { trigger: el, start: 'top 75%', end: 'bottom 60%', scrub: true },
            })
        })

        // 5) scale-in — [data-fx="scale"] از کمی کوچک‌تر با نرمی جا می‌افتد
        gsap.utils.toArray<HTMLElement>('[data-fx="scale"]').forEach(el => {
          gsap.from(el, {
            opacity: 0, scale: 0.9, duration: 1, ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 82%', once: true },
          })
        })

        ScrollTrigger.refresh()
      })
    })()

    return () => { killed = true; if (ctx) ctx.revert() }
  }, [ready])
}
