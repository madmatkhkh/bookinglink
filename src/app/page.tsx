'use client'
// ─────────────────────────────────────────────────────────────────────────────
// لندینگِ پلتفرم — قهرمانِ صفحه: تمپلیت‌های آماده‌ی هر نیچ
// مخاطب: متخصصِ فردی/کسب‌وکارِ کوچکِ اینستاگرام‌محور که صفحه‌ی نوبت‌دهیِ
// برندشده‌ی خودش را می‌خواهد. لحن: مطمئن، حرفه‌ای، بدونِ زرق‌وبرقِ اضافه.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { PLATFORM_NAME } from '@/lib/config'
import { toFarsiNum } from '@/lib/calendar'

type NicheCard = {
  key: string; display_name: string; tagline: string
  icon: string; default_theme: string; setup_price: number
}

const ICON: Record<string, string> = { brain: '🧠', sparkles: '✨', default: '📅' }

export default function Landing() {
  const [niches, setNiches] = useState<NicheCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/niches').then(r => r.json()).then(d => {
      setNiches(d.niches || []); setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="max-w-4xl mx-auto px-6 pt-6 flex items-center justify-between">
        <div className="font-extrabold text-lg">{PLATFORM_NAME}</div>
        <a href="#templates" className="text-xs px-4 py-2 rounded-full bg-ink text-white font-medium">
          شروع کنید
        </a>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
        <div className="inline-block text-xs px-3 py-1.5 rounded-full bg-sand text-soot mb-6">
          صفحه‌ی نوبت‌دهیِ اختصاصیِ شما
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight max-w-2xl mx-auto">
          لینکِ نوبت‌دهیِ حرفه‌ای، با برندِ خودتان
        </h1>
        <p className="mt-5 text-sm sm:text-base text-soot leading-relaxed max-w-xl mx-auto">
          یک صفحه‌ی زیبا و اختصاصی بگیرید، لینکش را در بایوی اینستاگرام بگذارید،
          و بگذارید مشتریان بدونِ تماس و پیام، خودشان نوبت بگیرند. بدونِ هیچ برندِ واسطه‌ای — فقط شما.
        </p>
        <a href="#templates" className="inline-block mt-8 px-8 py-3.5 rounded-2xl bg-ink text-white font-medium">
          تمپلیتِ کارتان را انتخاب کنید
        </a>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { n: '1', t: 'تمپلیت را انتخاب کنید', d: 'قالبِ آماده‌ی حرفه‌ی خودتان را بردارید — از پیش برای کارِ شما چیده شده.' },
            { n: '2', t: 'چند دقیقه تنظیمش کنید', d: 'عکس، سرویس‌ها، قیمت‌ها و ساعاتِ کاری. همین.' },
            { n: '3', t: 'لینک را در بایو بگذارید', d: 'مشتری از اینستاگرام می‌آید و خودش نوبت می‌گیرد.' },
          ].map(s => (
            <div key={s.n} className="rounded-2xl border border-sand bg-white p-5">
              <div className="w-9 h-9 rounded-full bg-ink text-white flex items-center justify-center font-bold text-sm mb-3">{s.n}</div>
              <div className="font-bold text-sm mb-1.5">{s.t}</div>
              <p className="text-xs text-soot leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="templates" className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold">تمپلیتِ کارتان را انتخاب کنید</h2>
          <p className="mt-2 text-sm text-soot">هر تمپلیت از پیش برای نیازهای همان حرفه چیده شده — و بعداً کاملاً قابلِ شخصی‌سازی است.</p>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[0, 1].map(i => <div key={i} className="h-44 rounded-2xl bg-sand animate-pulse" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {niches.map(n => (
              <div key={n.key} className="rounded-2xl border border-sand bg-white overflow-hidden">
                <div className="h-2" style={{ backgroundColor: `rgb(${n.default_theme})` }} />
                <div className="p-6">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4"
                    style={{ backgroundColor: `rgb(${n.default_theme} / 0.12)` }}>
                    {ICON[n.icon] || ICON.default}
                  </div>
                  <h3 className="font-extrabold">{n.display_name}</h3>
                  <p className="mt-2 text-xs text-soot leading-relaxed min-h-[32px]">{n.tagline}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-soot">
                      {n.setup_price > 0
                        ? <>راه‌اندازی: <strong className="tnum text-ink">{toFarsiNum(n.setup_price.toLocaleString('en-US'))}</strong> تومان</>
                        : <span className="text-green-600 font-medium">راه‌اندازیِ رایگان</span>}
                    </span>
                    <a href="#contact"
                      className="text-xs px-4 py-2 rounded-xl text-white font-medium"
                      style={{ backgroundColor: `rgb(${n.default_theme})` }}>
                      انتخاب
                    </a>
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border-2 border-dashed border-sand bg-transparent p-6 flex flex-col justify-center items-center text-center">
              <div className="text-2xl mb-3">💬</div>
              <h3 className="font-bold text-sm">حرفه‌ی شما اینجا نیست؟</h3>
              <p className="mt-2 text-xs text-soot leading-relaxed">
                تمپلیت‌های تازه مدام اضافه می‌شوند. بگویید چه کاری می‌کنید تا برایتان بسازیم.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="max-w-4xl mx-auto px-6 py-12">
        <div className="rounded-3xl bg-ink text-white p-8 sm:p-10">
          <h2 className="text-xl font-extrabold mb-6">همه‌چیز برای اینکه حرفه‌ای دیده شوید</h2>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
            {[
              ['🎨', 'برندِ کاملاً خودتان', 'رنگ، عکس و نامِ شما. هیچ لوگوی واسطه‌ای در صفحه نیست.'],
              ['📅', 'تقویمِ شمسی و هوشمند', 'ساعت‌های خالی خودکار محاسبه می‌شوند؛ رزروِ همزمانِ تکراری غیرممکن است.'],
              ['👥', 'چند پرسنل', 'برای سالن و مطب: مشتری می‌تواند پرسنلِ دلخواهش را انتخاب کند یا هر کسی که آزاد بود.'],
              ['🗂', 'پرونده‌ی مشتری', 'سابقه‌ی هر مشتری، متناسب با حرفه‌ی شما — تشخیص، حساسیت، هرچه لازم است.'],
              ['💳', 'دریافتِ وجه', 'کارت‌به‌کارت از همان ابتدا؛ درگاهِ آنلاین به‌زودی.'],
              ['📱', 'ساخته‌شده برای موبایل', 'مشتری از داخلِ اینستاگرام می‌آید؛ همه‌چیز روی گوشی روان است.'],
            ].map(([icon, t, d]) => (
              <div key={t} className="flex gap-3">
                <span className="text-xl shrink-0">{icon}</span>
                <div>
                  <div className="font-bold text-sm">{t}</div>
                  <p className="text-xs text-white/70 leading-relaxed mt-0.5">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="max-w-4xl mx-auto px-6 py-12 text-center">
        <h2 className="text-2xl font-extrabold">آماده‌ی شروع هستید؟</h2>
        <p className="mt-3 text-sm text-soot max-w-md mx-auto leading-relaxed">
          به ما پیام بدهید تا تمپلیتِ کارتان را راه‌اندازی کنیم و لینکِ اختصاصی‌تان را تحویل بگیرید.
        </p>
        <a href="https://instagram.com" target="_blank" rel="noopener noreferrer"
          className="inline-block mt-6 px-8 py-3.5 rounded-2xl bg-ink text-white font-medium">
          شروعِ گفتگو
        </a>
      </section>

      <footer className="border-t border-sand">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-soot">
          <span>{PLATFORM_NAME}</span>
          {/* نمادِ اعتماد الکترونیکی (اینماد) — طبقِ دستورالعملِ خودِ اینماد، این تگ
              نباید rel="noopener noreferrer" داشته باشد، وگرنه لوگو نمایش داده نمی‌شود. */}
          <a referrerPolicy="origin" target="_blank"
            href="https://trustseal.enamad.ir/?id=753950&Code=AcwMyu4tgps3IUpdr2taP5QYaQkTCSyp">
            <img referrerPolicy="origin"
              src="https://trustseal.enamad.ir/logo.aspx?id=753950&Code=AcwMyu4tgps3IUpdr2taP5QYaQkTCSyp"
              alt="نمادِ اعتماد الکترونیکی" style={{ cursor: 'pointer' }} data-code="AcwMyu4tgps3IUpdr2taP5QYaQkTCSyp" />
          </a>
          <span>© {toFarsiNum(1404)}</span>
        </div>
      </footer>
    </main>
  )
}
