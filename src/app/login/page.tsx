'use client'
// ─────────────────────────────────────────────────────────────────────────────
// ورودِ متخصص — طراحیِ مونوکروم، دو ستونه.
//
// این صفحه دیگر خودش OTP را دست‌کاری نمی‌کند — قبلاً به /api/t/<slug>/otp وصل
// بود که کوکیِ «مراجع» می‌نشاند، نه نشستِ پنلِ متخصص؛ یعنی بعدِ «ورودِ موفق»
// دوباره به لاگین برمی‌گشت (باگ). راهِ درست این نبود که OTP را اینجا هم پیاده
// کنیم؛ خودِ `/[slug]/panel` از قبل یک فلوِ OTPِ کامل و درست دارد (owner/staff،
// هر دو کوکیِ صحیح). این صفحه فقط نشانیِ کارگاه را می‌گیرد، وجودش را با یک
// endpoint سبک و عمومی چک می‌کند، و کاربر را به همان پنلِ واقعی هدایت می‌کند.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { PLATFORM_NAME } from '@/lib/config'

const AGENDA = [
  { time: '09:30', name: 'جلسه‌ی مشاوره — سارا محمدی', strong: true },
  { time: '11:00', name: 'پیگیری — رضا کریمی' },
  { time: '14:30', name: 'جلسه‌ی اول — نگار احمدی' },
]

export default function Login() {
  const [slug, setSlug] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function goToPanel(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const s = slug.trim().toLowerCase()
    if (!s) return
    setBusy(true)
    try {
      const r = await fetch(`/api/t/${s}/niche`)
      if (!r.ok) { setErr('کارگاهی با این نشانی پیدا نشد — نشانی را دوباره چک کن.'); return }
      window.location.href = `/${s}/panel`
    } catch {
      setErr('اتصال برقرار نشد')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full text-[15px] px-3.5 py-3 border border-sand rounded-xl outline-none bg-white focus:border-ink focus:ring-2 focus:ring-ink/10 transition'

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* ── سمتِ فرم ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col p-8">
        <div className="flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-ink">
            <span className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.7} className="w-3.5 h-3.5"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/></svg>
            </span>
            <span className="font-display font-extrabold text-lg tracking-tightest">{PLATFORM_NAME}</span>
          </a>
          <a href="/" className="text-[13px] text-soot hover:text-ink">→ بازگشت</a>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm animate-nl-up">
            <h1 className="font-display font-extrabold text-3xl tracking-tightest mb-2">ورود به پنل</h1>
            <p className="text-sm text-soot leading-relaxed mb-7">
              نشانیِ کارگاهت را وارد کن؛ کدِ ورود (پیامکی) داخلِ همان پنل ازت پرسیده می‌شود.
            </p>

            <form onSubmit={goToPanel}>
              <label className="block text-[13px] font-semibold text-ink/80 mb-1.5">نشانیِ کارگاه</label>
              <div className="flex items-stretch mb-5" dir="ltr">
                <span className="inline-flex items-center px-3 text-[13px] text-soot bg-paper border border-sand border-l-0 rounded-l-xl">nobatlink.com/</span>
                <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="your-name" required autoFocus
                  className={field + ' rounded-l-none text-left'} />
              </div>
              {err && <p className="text-[13px] text-ink bg-sand rounded-lg px-3 py-2 mb-4">{err}</p>}
              <button disabled={busy || !slug.trim()} className="w-full font-display font-bold text-white bg-ink py-3 rounded-xl shadow-sm hover:-translate-y-0.5 transition disabled:opacity-60">
                {busy ? 'در حالِ بررسی…' : 'برو به پنل ←'}
              </button>
            </form>

            <p className="text-center text-[13px] text-soot mt-7">
              حساب نداری؟ <a href="/signup" className="font-semibold text-ink">ثبت‌نام رایگان</a>
            </p>
          </div>
        </div>
        <div className="text-center text-[12px] text-soot/70">© 1404 {PLATFORM_NAME}</div>
      </div>

      {/* ── سمتِ برند (مشکی) ─────────────────────────────────────────────── */}
      <div className="relative hidden md:flex flex-col justify-center bg-ink text-white p-14 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.06) 1px, transparent 0)', backgroundSize: '26px 26px' }} />
        <div className="relative max-w-md">
          <div className="inline-flex items-center gap-2 text-[13px] text-white/70 border border-white/15 rounded-full px-3 py-1.5 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-white" style={{ animation: 'nlPulse 2s infinite' }} />
            داشبوردِ {PLATFORM_NAME}
          </div>
          <h2 className="font-display font-extrabold text-3xl leading-snug tracking-tightest mb-4">همه‌ی نوبت‌هایت،<br />یک‌جا و مرتب</h2>
          <p className="text-[15px] text-white/70 leading-loose mb-10">وارد شو تا تقویم، مراجعین و یادآوری‌های پیامکی‌ات را مدیریت کنی — بدونِ هماهنگیِ دستی.</p>
          <div className="rounded-2xl border border-white/12 bg-white/5 p-5 backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-bold text-sm">امروز · یک‌شنبه</span>
              <span className="text-xs text-white/50">4 نوبت</span>
            </div>
            {AGENDA.map(a => (
              <div key={a.time} className="flex items-center gap-3 py-2.5 border-t border-white/8">
                <span className="font-semibold text-[13px] text-white/90 min-w-[44px]" dir="ltr">{a.time}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${a.strong ? 'bg-white' : 'bg-white/40'}`} />
                <span className="text-[13px] text-white/70 flex-1">{a.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
