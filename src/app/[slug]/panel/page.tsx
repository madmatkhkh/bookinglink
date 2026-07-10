'use client'
// ─────────────────────────────────────────────────────────────────────────────
// روتر پنل: نیچ tenant را می‌گیرد و پنل درست را نشان می‌دهد.
//   • psychology → PsychologyAdmin (پنل کامل روانشناسی، منتقل‌شده از psych-booking)
//   • بقیه       → GenericAdmin (پنل سرویس‌محور عمومی)
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PsychologyAdmin } from './PsychologyAdmin'
import { GenericAdmin } from './GenericAdmin'

export default function PanelRouter() {
  const { slug } = useParams<{ slug: string }>()
  const [niche, setNiche] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/t/${slug}/niche`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setNiche(d.niche_key))
      .catch(() => setNotFound(true))
  }, [slug])

  if (notFound) return <div className="min-h-screen flex items-center justify-center text-soot" dir="rtl">این صفحه پیدا نشد.</div>
  if (niche === null) return <div className="min-h-screen flex items-center justify-center text-soot" dir="rtl">در حال بارگذاری…</div>
  if (niche === 'psychology') return <PsychologyAdmin />
  return <GenericAdmin />
}
