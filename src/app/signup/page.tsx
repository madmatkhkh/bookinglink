'use client'
// ─────────────────────────────────────────────────────────────────────────────
// ثبت‌نامِ متخصص (self-service) — طراحیِ مونوکروم، دو قدم.
//
// قبلاً این صفحه به /api/signup وصل بود که اصلاً وجود نداشت، و ۴۰۴ را «موفق»
// فرض می‌کرد — یعنی به هرکسی «ثبت‌نام شد!» نشان می‌داد بدونِ اینکه واقعاً چیزی
// ساخته شود. الان /api/signup واقعی ساخته شده (دو قدم: صدورِ OTP، بعد تاییدِ
// OTP + ساختِ tenant)، و این صفحه هم همان دو قدم را طی می‌کند.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { PLATFORM_NAME, RESERVED_SLUGS, SLUG_PATTERN } from '@/lib/config'

type NicheCard = { key: string; display_name: string; tagline: string }

export default function Signup() {
  const [niches, setNiches] = useState<NicheCard[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [phone, setPhone] = useState('')
  const [niche, setNiche] = useState('')
  const [step, setStep] = useState<'details' | 'code'>('details')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/niches').then(r => r.json()).then(d => {
      setNiches(d.niches || [])
      if (d.niches?.[0]) setNiche(d.niches[0].key)
    }).catch(() => {})
  }, [])

  const slugOk = SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.includes(slug)
  const slugMsg = slug && !slugOk
    ? (RESERVED_SLUGS.includes(slug) ? 'این نشانی رزرو شده است' : 'فقط حروفِ کوچکِ انگلیسی، عدد و خط‌تیره (3 تا 40 نویسه)')
    : ''

  async function requestCode(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    if (!slugOk) { setErr('نشانیِ کارگاه معتبر نیست'); return }
    if (!niche) { setErr('یک حوزه‌ی کاری انتخاب کن'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/signup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug, phone, niche_key: niche }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'خطا در ثبت‌نام'); return }
      if (d.dev_code) setDevCode(String(d.dev_code))
      setStep('code')
    } catch { setErr('اتصال برقرار نشد') } finally { setBusy(false) }
  }

  async function verifyAndCreate(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const r = await fetch('/api/signup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug, phone, niche_key: niche, code }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'کد نادرست است'); return }
      setDone(true)
    } catch { setErr('اتصال برقرار نشد') } finally { setBusy(false) }
  }

  const field = 'w-full text-[15px] px-3.5 py-3 border border-sand rounded-xl outline-none bg-white focus:border-ink focus:ring-2 focus:ring-ink/10 transition'

  if (done) {
    return (
      <div className="min-h-screen bg-paper text-ink flex items-center justify-center p-6">
        <div className="max-w-sm text-center animate-nl-up">
          <div className="w-14 h-14 rounded-2xl bg-ink text-white flex items-center justify-center mx-auto mb-6 text-2xl">✓</div>
          <h1 className="font-display font-extrabold text-2xl tracking-tightest mb-3">کارگاهت آماده شد!</h1>
          <p className="text-sm text-soot leading-relaxed mb-7">کارگاهِ <b className="text-ink" dir="ltr">nobatlink.com/{slug}</b> ساخته شد. حالا می‌توانی وارد پنلش شوی.</p>
          <a href={`/${slug}/panel`} className="font-display font-bold text-white bg-ink px-7 py-3 rounded-xl inline-block">ورود به پنل ←</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-ink flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.7} className="w-3.5 h-3.5"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/></svg>
          </span>
          <span className="font-display font-extrabold text-lg tracking-tightest">{PLATFORM_NAME}</span>
        </a>
        <a href="/login" className="text-[13px] text-soot hover:text-ink">قبلاً ثبت‌نام کرده‌ای؟ ورود</a>
      </header>

      <div className="max-w-md mx-auto px-6 py-10 animate-nl-up">
        <h1 className="font-display font-extrabold text-3xl tracking-tightest mb-2">ساختِ کارگاهِ رایگان</h1>
        <p className="text-sm text-soot leading-relaxed mb-8">در کمتر از 5 دقیقه صفحه‌ی رزروِ اختصاصی‌ات را بساز. بدونِ نیاز به درگاه بانکی.</p>

        {step === 'details' ? (
          <form onSubmit={requestCode}>
            <label className="block text-[13px] font-semibold text-ink/80 mb-1.5">نام و نامِ خانوادگی</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="مثلاً دکتر پریسا رستمی" required className={field + ' mb-4'} />

            <label className="block text-[13px] font-semibold text-ink/80 mb-1.5">نشانیِ کارگاه</label>
            <div className="flex items-stretch" dir="ltr">
              <span className="inline-flex items-center px-3 text-[13px] text-soot bg-paper border border-sand border-l-0 rounded-l-xl">nobatlink.com/</span>
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} placeholder="your-name" required
                className={`${field} rounded-l-none text-left ${slug && !slugOk ? 'border-red-400' : ''}`} />
            </div>
            <p className={`text-[12px] mt-1.5 mb-4 ${slugMsg ? 'text-red-500' : 'text-soot'}`}>{slugMsg || (slug && slugOk ? '✓ این نشانی در دسترس است' : 'نشانیِ لینکِ عمومی‌ات')}</p>

            <label className="block text-[13px] font-semibold text-ink/80 mb-1.5">شماره‌ی موبایل</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0912 000 0000" inputMode="tel" required className={field + ' mb-5'} dir="ltr" />

            <label className="block text-[13px] font-semibold text-ink/80 mb-2">حوزه‌ی کاری</label>
            <div className="grid sm:grid-cols-2 gap-2.5 mb-6">
              {niches.map(n => (
                <button type="button" key={n.key} onClick={() => setNiche(n.key)}
                  className={`text-right rounded-xl border p-3.5 transition ${niche === n.key ? 'border-ink bg-white ring-2 ring-ink/10' : 'border-sand hover:border-ink'}`}>
                  <div className="font-display font-bold text-sm">{n.display_name}</div>
                  <div className="text-[11px] text-soot leading-relaxed mt-1 line-clamp-2">{n.tagline}</div>
                </button>
              ))}
            </div>

            {err && <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{err}</p>}
            <button disabled={busy} className="w-full font-display font-bold text-white bg-ink py-3.5 rounded-xl shadow-sm hover:-translate-y-0.5 transition disabled:opacity-60">
              {busy ? 'در حالِ ارسالِ کد…' : 'ادامه ←'}
            </button>
            <p className="text-center text-[12px] text-soot/80 mt-4">با ثبت‌نام، قوانین و حریمِ خصوصیِ نوبت‌لینک را می‌پذیری.</p>
          </form>
        ) : (
          <form onSubmit={verifyAndCreate}>
            <p className="text-sm text-soot leading-relaxed mb-5">
              کدِ 5 رقمیِ ارسال‌شده به <b className="text-ink" dir="ltr">{phone}</b> را وارد کن تا کارگاهت ساخته شود.
            </p>
            {devCode && (
              <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                کدِ تست (حالتِ توسعه): <b>{devCode}</b>
              </p>
            )}
            <input value={code} onChange={e => setCode(e.target.value)} placeholder="- - - - -" inputMode="numeric" required autoFocus
              className={field + ' mb-4 text-center tracking-[0.5em] font-display text-lg'} dir="ltr" />
            {err && <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{err}</p>}
            <button disabled={busy} className="w-full font-display font-bold text-white bg-ink py-3.5 rounded-xl shadow-sm hover:-translate-y-0.5 transition disabled:opacity-60 mb-3">
              {busy ? 'در حالِ ساختِ کارگاه…' : 'تاییدِ کد و ساختِ کارگاه'}
            </button>
            <button type="button" onClick={() => { setStep('details'); setErr(''); setCode('') }} className="w-full text-[13px] text-soot hover:text-ink">
              بازگشت و ویرایشِ اطلاعات
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
