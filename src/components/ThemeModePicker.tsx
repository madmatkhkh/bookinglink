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
// موقت استخراج می‌کند — همه‌چیز سمت مرورگر، بدون آپلود یا وابستگی تازه.
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

export default function ThemeModePicker({ slug, themeMode, themeColor, logoUrl, onChange, uiAlert }: Props) {
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const currentRgb = parseRgbTriplet(themeColor) || parseRgbTriplet(DEFAULT_SAFE_THEME)!

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!ALLOWED.includes(file.type)) { uiAlert('فقط عکس JPG، PNG یا WebP مجاز است'); return }
    if (file.size > MAX_BYTES) { uiAlert('حجم عکس باید کمتر از 4 مگابایت باشد'); return }

    setUploading(true)
    setNote(null)
    try {
      const dominant = await dominantColorFromFile(file)
      let adjustedRgb = dominant ? ensureContrastOnWhite(dominant) : { rgb: [26, 26, 26] as [number, number, number], adjusted: false }
      if (!dominant) setNote('رنگ برجسته‌ای در لوگو پیدا نشد — رنگ مشکی پیش‌فرض استفاده شد.')
      else if (adjustedRgb.adjusted) setNote('برای خوانایی کافی روی زمینه‌ی سفید، این رنگ کمی تیره‌تر شد.')

      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/t/${slug}/panel/upload-logo`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { uiAlert(data.error || 'آپلود ناموفق بود'); setUploading(false); return }

      onChange({ theme_mode: 'logo', logo_url: data.public_url, theme_color: rgbToTriplet(adjustedRgb.rgb) })
    } catch {
      uiAlert('آپلود ناموفق بود — دوباره امتحان کن')
    }
    setUploading(false)
  }

  return (
    <div className="space-y-3">
      {/* سوییچ دو حالت */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange({ theme_mode: 'preset' })}
          className={`py-2 rounded-xl text-sm font-medium border transition-colors ${
            themeMode === 'preset' ? 'border-ink bg-sand text-ink' : 'border-sand text-soot hover:border-gray-300'}`}>
          رنگ‌های پیش‌فرض
        </button>
        <button type="button" onClick={() => onChange({ theme_mode: 'logo' })}
          className={`py-2 rounded-xl text-sm font-medium border transition-colors ${
            themeMode === 'logo' ? 'border-ink bg-sand text-ink' : 'border-sand text-soot hover:border-gray-300'}`}>
          لوگو یا برند
        </button>
      </div>

      {themeMode === 'preset' ? (
        <div className="grid grid-cols-4 gap-2">
          {THEME_PRESETS.map(p => {
            const triplet = rgbToTriplet(p.rgb)
            const selected = triplet === themeColor
            return (
              <button key={p.id} type="button" title={p.label}
                onClick={() => onChange({ theme_mode: 'preset', theme_color: triplet })}
                className={`aspect-square rounded-xl border-2 flex items-end justify-center pb-1 transition-transform ${
                  selected ? 'border-ink scale-105' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: `rgb(${triplet})` }}>
                {selected && <span className="text-white text-xs">✓</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={e => { handleFile(e.target.files?.[0]); e.target.value = '' }} />
          <div onClick={() => !uploading && fileRef.current?.click()}
            className="border-2 border-dashed border-sand rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:border-gray-300 transition-colors">
            <div className="w-14 h-14 rounded-lg bg-gray-50 border border-sand flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl
                ? /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={logoUrl} alt="لوگو" className="w-full h-full object-contain" />
                : <span className="text-xl text-soot">+</span>}
            </div>
            <div className="flex-1 text-xs text-soot">
              {uploading ? 'در حال بررسی رنگ‌ها و آپلود...' : logoUrl ? 'برای تغییر لوگو کلیک کنید' : 'برای آپلود لوگو یا برند خودتان کلیک کنید'}
            </div>
          </div>
          {note && <p className="text-[11px] text-soot">{note}</p>}
        </div>
      )}

      {/* پیش‌نمایش زنده — با scope مستقل، اثری روی بقیه‌ی خود پنل ادمین نمی‌گذارد */}
      <div className="rounded-xl border border-sand p-3 space-y-2" style={{ ['--brand' as any]: rgbToTriplet(currentRgb) }}>
        <p className="text-[11px] text-soot">پیش‌نمایش روی صفحه‌ی عمومی و پنل مراجع</p>
        <div className="flex items-center gap-2">
          <button type="button" className="px-4 py-2 bg-accent text-white rounded-lg text-xs font-medium">دکمه‌ی اصلی</button>
          <span className="text-xs text-accent font-medium">متن برند</span>
        </div>
      </div>
    </div>
  )
}
