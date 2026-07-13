'use client'
import { useRef, useState } from 'react'
import { THEME_PRESETS, rgbToTriplet, extractDominantColor, ensureContrastOnWhite, parseRgbTriplet, DEFAULT_SAFE_THEME } from '@/lib/theme'

export type ThemePatch = { theme_mode?: 'preset' | 'logo'; theme_color?: string; logo_url?: string | null }

type Props = {
  slug: string
  themeMode: 'preset' | 'logo'
  themeColor: string
  logoUrl: string | null
  onChange: (patch: ThemePatch) => void
  uiAlert: (msg: string) => void | Promise<void>
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 4 * 1024 * 1024

// از یک فایل تصویر، رنگ غالب (غیرخاکستری/غیرپس‌زمینه) را روی یک canvas کوچک
// موقت استخراج می‌کند — همه‌چیز سمت مرورگر، بدون وابستگی تازه.
async function dominantColorFromFile(file: File): Promise<[number, number, number] | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = reject
      im.src = url
    })
    const size = 96 // کوچک کافی است — فقط توزیع رنگ لازم است، نه جزئیات
    const canvas = document.createElement('canvas')
    canvas.width = size; canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    return extractDominantColor(data)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

// حذف یک لوگوی رهاشده از R2 — بی‌صدا؛ اگر شکست بخورد مشکلی نیست چون هرجایی که
// theme_color نهایتا ذخیره شود، panel/profile هم دوباره فایل قبلی را پاک می‌کند
// (دفاع دوم سمت سرور روی مسیر «ذخیره»، این‌جا فقط پاک‌سازی فوری حین کار است).
function discardLogo(slug: string, url: string | null) {
  if (!url) return
  fetch(`/api/t/${slug}/panel/upload-logo`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  }).catch(() => {})
}

export default function ThemeModePicker({ slug, themeMode, themeColor, logoUrl, onChange, uiAlert }: Props) {
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const currentRgb = parseRgbTriplet(themeColor) || parseRgbTriplet(DEFAULT_SAFE_THEME)!
  const previewVar = rgbToTriplet(currentRgb)

  function choosePreset(triplet: string) {
    // اگر لوگویی آپلود شده بود و حالا از رنگ‌های پیش‌فرض استفاده می‌شود، دیگر لازم
    // نیست — کلا از R2 پاک می‌شود، نه فقط از فرم.
    if (themeMode === 'logo' && logoUrl) discardLogo(slug, logoUrl)
    setNote(null)
    onChange({ theme_mode: 'preset', theme_color: triplet, logo_url: null })
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!ALLOWED.includes(file.type)) { uiAlert('فقط عکس JPG، PNG یا WebP مجاز است'); return }
    if (file.size > MAX_BYTES) { uiAlert('حجم عکس باید کمتر از 4 مگابایت باشد'); return }

    setUploading(true)
    setNote(null)
    try {
      const dominant = await dominantColorFromFile(file)
      const adjusted = dominant ? ensureContrastOnWhite(dominant) : { rgb: [26, 26, 26] as [number, number, number], adjusted: false }
      if (!dominant) setNote('رنگ برجسته‌ای در لوگو پیدا نشد — مشکی استفاده شد.')
      else if (adjusted.adjusted) setNote('برای خوانایی روی زمینه‌ی سفید، رنگ کمی تیره‌تر شد.')

      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/t/${slug}/panel/upload-logo`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { uiAlert(data.error || 'آپلود ناموفق بود'); setUploading(false); return }

      if (logoUrl) discardLogo(slug, logoUrl) // لوگوی قبلی جایگزین شد — کلا پاک می‌شود
      onChange({ theme_mode: 'logo', logo_url: data.public_url, theme_color: rgbToTriplet(adjusted.rgb) })
    } catch {
      uiAlert('آپلود ناموفق بود — دوباره امتحان کن')
    }
    setUploading(false)
  }

  return (
    <div className="space-y-5">
      {/* ── پیش‌نمایش زنده (اول) — همان عناصری که واقعا روی صفحه‌ی عمومی و پنل
         مراجع رنگ می‌گیرند. زمینه‌ی این کادر عمدا سفید هاردکد است (نه bg-white
         که در دارک‌مود پنل معکوس می‌شود)، چون صفحه‌ی عمومی و پنل مراجع همیشه
         روشن‌اند — پیش‌نمایش باید همان چیزی را نشان دهد که مراجع می‌بیند. ── */}
      <div className="rounded-xl border border-sand overflow-hidden" style={{ ['--brand' as any]: previewVar }}>
        <div className="px-3 py-2 border-b border-sand bg-gray-50">
          <span className="text-[11px] text-soot">پیش‌نمایش زنده</span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-3" style={{ background: '#ffffff' }}>
          {/* مینی‌مکاپ صفحه‌ی عمومی */}
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="text-[10px] text-gray-500">صفحه‌ی عمومی</p>
            <div className="w-8 h-8 rounded-full bg-accent/15 border border-accent/30 mx-auto" />
            <div className="h-1.5 w-12 bg-gray-200 rounded-full mx-auto" />
            <button type="button" className="w-full py-1.5 bg-accent text-white rounded-lg text-[11px] font-medium">رزرو نوبت</button>
          </div>
          {/* مینی‌مکاپ پنل مراجع */}
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <p className="text-[10px] text-gray-500">پنل مراجع</p>
            <div className="flex gap-1">
              <span className="flex-1 text-center rounded-md bg-accent text-white text-[10px] py-1">جلسات</span>
              <span className="flex-1 text-center rounded-md text-gray-500 text-[10px] py-1">پروفایل</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-accent" style={{ width: '60%' }} /></div>
            <button type="button" className="w-full py-1.5 bg-accent text-white rounded-lg text-[11px] font-medium">پرداخت جلسه</button>
          </div>
        </div>
      </div>

      {/* ── رنگ‌های پیش‌فرض — یک ردیف سواچ کوچک ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-ink">رنگ‌های پیش‌فرض</span>
          {themeMode === 'preset' && <span className="text-[10px] text-soot">فعال</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map(p => {
            const triplet = rgbToTriplet(p.rgb)
            const selected = themeMode === 'preset' && triplet === themeColor
            return (
              <button key={p.id} type="button" title={p.label} aria-label={p.label} onClick={() => choosePreset(triplet)}
                className={`p-[3px] rounded-full transition-transform hover:scale-110 ${selected ? 'ring-2 ring-ink' : ''}`}>
                <span className="w-7 h-7 rounded-full ring-1 ring-black/10 flex items-center justify-center"
                  style={{ backgroundColor: `rgb(${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]})` }}>
                  {selected && <span className="text-white text-[11px] leading-none">✓</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── لوگو یا برند ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-ink">لوگو یا برند</span>
          {themeMode === 'logo' && <span className="text-[10px] text-soot">فعال</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
        <button type="button" onClick={() => !uploading && fileRef.current?.click()} disabled={uploading}
          className="w-full flex items-center gap-3 text-right border border-dashed border-sand rounded-xl p-2.5 hover:border-gray-300 transition-colors disabled:opacity-60">
          <span className="w-9 h-9 rounded-lg border border-sand flex items-center justify-center overflow-hidden shrink-0 bg-gray-50">
            {logoUrl
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoUrl} alt="" className="w-full h-full object-contain" />
              : <span className="text-sm text-soot leading-none">+</span>}
          </span>
          <span className="flex-1 text-[11px] text-soot leading-snug">
            {uploading ? 'در حال بررسی رنگ‌ها...' : logoUrl ? 'تغییر لوگو' : 'آپلود لوگو — رنگ تم خودکار از آن استخراج می‌شود'}
          </span>
        </button>
        {note && <p className="text-[11px] text-soot mt-1.5">{note}</p>}
      </div>
    </div>
  )
}
