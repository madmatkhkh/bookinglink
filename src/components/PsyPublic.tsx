'use client'
// ─────────────────────────────────────────────────────────────────────────────
// کامپوننت‌های عمومی سمت مراجع روانشناسی (نسخه‌ی چندمستاجری + چندکارمندی).
// تنظیمات کلینیک (سطح tenant) و پروفایل دکترها (سطح resource) حالا جدا از
// هم ذخیره می‌شوند؛ این فایل آن‌ها را برای صفحه‌های عمومی در یک شکل ترکیبی
// آشنا (همان چیزی که همیشه بوده: doctor_name/avatar_url/badges/...) ادغام
// می‌کند تا صفحه‌های موجود (interview، my) نیازی به تغییر نداشته باشند.
// اگر مجموعه چند دکتر داشت، «doctors» کامل لیست را هم برمی‌گرداند.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import type { OfficeLocation, PaymentCardInfo, SessionMode, PublicDoctor } from '@/lib/psy'
import { composeTermsText } from '@/lib/psy'

export type PublicClinicView = {
  office_locations: OfficeLocation[]
  doctor_name: string
  doctor_title: string
  avatar_url: string
  badges: string[]
  session_modes: SessionMode
  cards: PaymentCardInfo[]
  theme_color: string | null
}

const EMPTY_VIEW: PublicClinicView = {
  office_locations: [], doctor_name: '', doctor_title: '', avatar_url: '',
  badges: [], session_modes: 'both', cards: [], theme_color: null,
}

function buildView(settings: { office_locations?: OfficeLocation[] } | null, doctors: PublicDoctor[], themeColor: string | null): PublicClinicView {
  const primary = doctors[0]
  return {
    office_locations: Array.isArray(settings?.office_locations) ? settings!.office_locations! : [],
    doctor_name: primary?.name || '',
    doctor_title: primary?.title || '',
    avatar_url: primary?.avatar_url || '',
    badges: primary?.badges || [],
    session_modes: primary?.session_modes || 'both',
    cards: primary?.cards || [],
    theme_color: themeColor,
  }
}

// هوک: تنظیمات عمومی کلینیک یک tenant را در کلاینت می‌گیرد (شکل ترکیبی آشنا)
export function usePublicClinic(slug: string): PublicClinicView & { loaded: boolean; doctors: PublicDoctor[] } {
  const [state, setState] = useState<PublicClinicView & { loaded: boolean; doctors: PublicDoctor[] }>({
    ...EMPTY_VIEW, loaded: false, doctors: [],
  })
  useEffect(() => {
    let alive = true
    fetch(`/api/t/${slug}/psy/public`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        const doctors: PublicDoctor[] = Array.isArray(d.doctors) ? d.doctors : []
        setState({ ...buildView(d.settings, doctors, d.theme_color || null), loaded: true, doctors })
      })
      .catch(() => { if (alive) setState({ ...EMPTY_VIEW, loaded: true, doctors: [] }) })
    return () => { alive = false }
  }, [slug])
  return state
}

// هوک: ماژول‌های فعال/غیرفعال پنل مراجع (خرید جلسه‌ی جبرانی، کنسل خودکار و...)
export function usePatientFeatures(slug: string): Record<string, boolean> {
  const [flags, setFlags] = useState<Record<string, boolean>>({
    patient_buy_extra_session: true, patient_self_cancel: true,
  })
  useEffect(() => {
    let alive = true
    fetch(`/api/t/${slug}/psy/public`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (alive && d.features) setFlags(d.features) })
      .catch(() => {})
    return () => { alive = false }
  }, [slug])
  return flags
}

export type DiscountApplied = { code: string; discountedAmount: number; discountAmount: number }

// فیلد کد تخفیف — همان منطق/UI که در فرم پرداخت مصاحبه‌ی اولیه (interview/page.tsx)
// از قبل بود، اینجا مشترک شد تا پنل مراجع (/my) هم برای جلسه‌ی تکی/جایگزین و
// پروتکل درمان همین را داشته باشد. بک‌اند (psy/pay و psy/pay-online) از قبل
// discount_code را برای هر سه نوع پرداخت (stage/package/session) می‌پذیرد —
// فقط UI برای گرفتنش در /my وجود نداشت.
export function DiscountCodeField({ slug, resourceId, amount, onApplied }: {
  slug: string; resourceId?: string | null; amount: number
  onApplied: (result: DiscountApplied | null) => void
}) {
  const [show, setShow] = useState(false)
  const [code, setCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<{ ok: true; discountedAmount: number; discountAmount: number } | { ok: false; error: string } | null>(null)

  async function check() {
    if (!code.trim() || !resourceId) return
    setChecking(true)
    try {
      const res = await fetch(`/api/t/${slug}/psy/discount-check?resource_id=${resourceId}&code=${encodeURIComponent(code.trim())}&amount=${amount}`)
      const d = await res.json()
      setResult(d)
      onApplied(d.ok ? { code: code.trim(), discountedAmount: d.discountedAmount, discountAmount: d.discountAmount } : null)
    } catch {
      setResult({ ok: false, error: 'خطا در بررسی کد' })
      onApplied(null)
    }
    setChecking(false)
  }

  if (!resourceId) return null
  return (
    <div className="mb-3">
      {!show ? (
        <button type="button" onClick={() => setShow(true)} className="text-xs text-soot underline">کد تخفیف دارید؟</button>
      ) : (
        <div className="flex gap-2">
          <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setResult(null); onApplied(null) }}
            dir="ltr" placeholder="کد تخفیف" className="flex-1 text-sm px-3 py-2 border border-sand rounded-lg tnum" />
          <button type="button" onClick={check} disabled={checking || !code.trim()}
            className="px-3 py-2 border border-sand rounded-lg text-xs text-ink disabled:opacity-50">
            {checking ? '...' : 'اعمال'}
          </button>
        </div>
      )}
      {result && (
        <p className={`text-xs mt-1.5 ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>
          {result.ok ? `کد اعمال شد — ${result.discountAmount.toLocaleString()} تومان تخفیف` : result.error}
        </p>
      )}
    </div>
  )
}

// شرایط و مقررات قبل از پرداخت — اگر دکتر خاموشش کرده (doctor.terms.enabled
// === false)، اصلا چیزی رندر نمی‌شود و پرداخت مثل قبل آزاد است. اگر روشن
// است، تا وقتی مراجع تیک «می‌پذیرم» را نزده accepted=false می‌ماند و صفحه‌ی
// صدازننده (SessionCard/StagePayment/PayButton/...) دکمه‌ی پرداخت را غیرفعال
// نگه می‌دارد.
export function TermsGate({ doctor, accepted, onAcceptedChange }: {
  doctor: PublicDoctor | undefined
  accepted: boolean
  onAcceptedChange: (v: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (!doctor?.terms?.enabled) return null
  const text = composeTermsText({ pricing: doctor.pricing, cancellation_policy: doctor.cancellation_policy, terms: doctor.terms })
  return (
    <div className="mb-3 bg-gray-50 border border-sand rounded-xl p-3">
      <button type="button" onClick={() => setExpanded(v => !v)} className="text-xs text-ink underline mb-2 block">
        {expanded ? 'بستن شرایط و مقررات' : 'مشاهده‌ی شرایط و مقررات'}
      </button>
      {expanded && <p className="text-xs text-soot whitespace-pre-wrap leading-6 mb-2">{text}</p>}
      <label className="flex items-start gap-2 text-xs text-ink cursor-pointer">
        <input type="checkbox" checked={accepted} onChange={e => onAcceptedChange(e.target.checked)} className="mt-0.5 shrink-0" />
        <span>شرایط و مقررات را مطالعه کردم و می‌پذیرم.</span>
      </label>
    </div>
  )
}

export function CardChooser({ cards, loaded = true }: { cards: PaymentCardInfo[]; loaded?: boolean }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const list = cards && cards.length ? cards : []

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
