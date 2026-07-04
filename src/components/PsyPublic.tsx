'use client'
// ─────────────────────────────────────────────────────────────────────────────
// کامپوننت‌های عمومیِ سمتِ مراجعِ روانشناسی (نسخه‌ی چندمستاجری).
// معادلِ PublicSettings.tsx در psych-booking، ولی تنظیمات را per-tenant (با slug) می‌گیرد.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import type { ClinicSettings, PaymentCardInfo } from '@/lib/psy'
import { DEFAULT_CLINIC, mergeClinic } from '@/lib/psy'

// هوک: تنظیماتِ عمومیِ کلینیکِ یک tenant را در کلاینت می‌گیرد
export function usePublicClinic(slug: string): ClinicSettings & { loaded: boolean } {
  const [state, setState] = useState<ClinicSettings & { loaded: boolean }>({ ...DEFAULT_CLINIC, loaded: false })
  useEffect(() => {
    let alive = true
    fetch(`/api/t/${slug}/psy/public`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (alive) setState({ ...mergeClinic(d.settings), loaded: true }) })
      .catch(() => { if (alive) setState({ ...DEFAULT_CLINIC, loaded: true }) })
    return () => { alive = false }
  }, [slug])
  return state
}

// نمایشِ شماره‌کارت‌ها برای واریزی + دکمه‌ی کپی
export function CardChooser({ cards, loaded = true }: { cards: PaymentCardInfo[]; loaded?: boolean }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const list = cards && cards.length ? cards : DEFAULT_CLINIC.cards

  async function copy(c: PaymentCardInfo) {
    try {
      await navigator.clipboard.writeText(c.number.replace(/[^0-9]/g, ''))
      setCopiedId(c.id); setTimeout(() => setCopiedId(null), 1500)
    } catch {}
  }

  if (!loaded) {
    return (
      <div className="border-t border-brand-100 pt-2 space-y-2">
        <div className="h-3.5 w-28 bg-gray-100 rounded animate-pulse" />
        <div className="h-5 w-44 bg-gray-100 rounded animate-pulse" />
      </div>
    )
  }
  if (!list.length) {
    return <div className="border-t border-brand-100 pt-2 text-xs text-gray-500">شماره‌کارتی ثبت نشده است.</div>
  }

  return (
    <div className="border-t border-brand-100 pt-2 space-y-2">
      {list.map(c => (
        <div key={c.id}>
          <span className="text-xs text-gray-500 block mb-1">
            شماره کارت ({c.holder}{c.bank ? ` — ${c.bank}` : ''})
          </span>
          <div className="flex items-center justify-between gap-2">
            <span dir="ltr" className="font-mono text-sm tracking-wider text-gray-800">{c.number}</span>
            <button onClick={() => copy(c)}
              className="text-xs px-2 py-1 border border-brand-200 text-brand-600 rounded-lg shrink-0">
              {copiedId === c.id ? '✓ کپی شد' : 'کپی'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
