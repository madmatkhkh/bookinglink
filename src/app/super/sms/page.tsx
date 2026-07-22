'use client'
// ─── بازبینی متن پیامک متخصص‌ها ───────────────────────────────────────────
// متن سفارشی هر tenant از خط مشترک پلتفرم ارسال می‌شود، پس یک متن تبلیغاتی
// می‌تواند خط را بلک‌لیست کند و OTP همه‌ی متخصص‌ها را بخواباند. این صفحه همان
// گیتی است که جلوی آن را می‌گیرد: تا تایید نشود، هیچ متنی ارسال نمی‌شود.
//
// رد کردن سرویس کسی را قطع نمی‌کند — یادآوری‌های آن tenant روی متن پیش‌فرض
// می‌مانند تا متن قابل‌قبولی بنویسد.
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { PLATFORM_NAME } from '@/lib/config'

type Template = {
  id: string; tenant_slug: string | null; tenant_display_name: string | null
  kind: string; body: string; status: string; review_note: string | null
  reviewed_at: string | null; updated_at: string
}

const STATUS_LABEL: Record<string, string> = {
  pending_review: 'در انتظار بررسی', approved: 'تاییدشده', rejected: 'رد شده',
}
const STATUS_CLS: Record<string, string> = {
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
}

function SmsReviewInner() {
  const dialog = useDialog()
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending_review')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    const res = await fetch(`/api/super/sms-templates${qs}`, { cache: 'no-store' })
    if (res.status === 401) { setAuthed(false); setLoading(false); return }
    const d = await res.json().catch(() => ({}))
    setTemplates(d.templates || [])
    setAuthed(true)
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (authed === false) router.replace('/super') }, [authed, router])

  async function review(id: string, status: 'approved' | 'rejected') {
    let note = ''
    if (status === 'rejected') {
      const answer = await dialog.uiPrompt('دلیل رد را بنویس (به خود متخصص نشان داده می‌شود):')
      if (!answer?.trim()) return
      note = answer.trim()
    }
    setBusyId(id)
    const res = await fetch('/api/super/sms-templates', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, review_note: note }),
    })
    setBusyId(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      await dialog.uiAlert(d.error || 'ذخیره ناموفق بود')
      return
    }
    load()
  }

  if (authed === false) return null

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-ink">متن پیامک متخصص‌ها — {PLATFORM_NAME}</h1>
        <a href="/super" className="text-xs border border-sand rounded-xl px-3 py-1.5 text-ink">بازگشت</a>
      </header>

      <p className="text-xs text-soot leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
        این متن‌ها از خط مشترک پلتفرم ارسال می‌شوند. هر متنی که بوی تبلیغ بدهد یا لینک
        داشته باشد را رد کن — بلک‌لیست‌شدن خط، ورود همه‌ی متخصص‌ها را می‌خواباند.
      </p>

      <div className="flex gap-2 flex-wrap">
        {['pending_review', 'approved', 'rejected', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs rounded-xl px-3 py-1.5 border ${statusFilter === s ? 'bg-ink text-white border-ink' : 'border-sand text-soot'}`}>
            {s === 'all' ? 'همه' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-24 bg-white rounded-2xl border border-sand animate-pulse" aria-hidden="true" />
      ) : templates.length === 0 ? (
        <div className="text-sm text-soot text-center py-12 bg-white rounded-2xl border border-sand">
          موردی نیست.
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="bg-white border border-sand rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-ink text-sm">{t.tenant_display_name || t.tenant_slug || '—'}</span>
                  {t.tenant_slug && <span dir="ltr" className="text-[11px] text-soot">/{t.tenant_slug}</span>}
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_CLS[t.status] || ''}`}>
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                </div>
                <span className="text-[11px] text-soot tnum">{new Date(t.updated_at).toLocaleDateString('fa-IR')}</span>
              </div>

              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap bg-gray-50 border border-sand rounded-xl p-3">
                {t.body}
              </p>

              {t.review_note && (
                <p className="text-xs text-soot">یادداشت بازبینی: {t.review_note}</p>
              )}

              {t.status !== 'approved' && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => review(t.id, 'approved')} disabled={busyId === t.id}
                    className="text-xs bg-ink text-white rounded-xl px-4 py-2 disabled:opacity-40">
                    تایید
                  </button>
                  <button onClick={() => review(t.id, 'rejected')} disabled={busyId === t.id}
                    className="text-xs border border-sand text-soot rounded-xl px-4 py-2 disabled:opacity-40">
                    رد
                  </button>
                </div>
              )}
              {t.status === 'approved' && (
                <button onClick={() => review(t.id, 'rejected')} disabled={busyId === t.id}
                  className="text-xs border border-sand text-soot rounded-xl px-4 py-2 disabled:opacity-40">
                  ابطال تایید
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

export default function SuperSmsPage() {
  return (
    <DialogProvider>
      <SmsReviewInner />
    </DialogProvider>
  )
}
