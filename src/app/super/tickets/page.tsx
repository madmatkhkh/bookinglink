'use client'
// ─── تیکت‌های پشتیبانی — دیدن همه‌ی تیکت‌های متخصص‌ها + پاسخ/تغییر وضعیت ───
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DialogProvider, useDialog } from '@/components/Dialog'
import { PLATFORM_NAME } from '@/lib/config'

type Ticket = {
  id: string; tenant_slug: string | null; tenant_display_name: string | null
  resource_id: string | null; submitted_by_name: string; category: string
  subject: string; message: string; status: string; admin_reply: string | null; created_at: string
}

type ContactMessage = { id: string; email: string; message: string; is_read: boolean; created_at: string }

const STATUS_LABEL: Record<string, string> = { open: 'ثبت‌شده', in_progress: 'در حال بررسی', resolved: 'حل‌شده', closed: 'بسته‌شده' }
const CATEGORY_LABEL: Record<string, string> = { bug: '🐞 مشکل/باگ', feature: '💡 قابلیت تازه', billing: '💳 مالی/پلن', other: '❓ سایر' }

function TicketsInner() {
  const dialog = useDialog()
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [contactMsgs, setContactMsgs] = useState<ContactMessage[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    const res = await fetch(`/api/super/tickets${qs}`, { cache: 'no-store' })
    if (res.status === 401) { setAuthed(false); setLoading(false); return }
    const d = await res.json().catch(() => ({}))
    setTickets(d.tickets || [])
    setAuthed(true)
    setLoading(false)
    // پیام‌های فرم «تماس با ما» لندینگ — جدا از تیکت‌های کاربران پنل
    const cm = await fetch('/api/super/contact-messages', { cache: 'no-store' }).then(r => r.ok ? r.json() : { messages: [] }).catch(() => ({ messages: [] }))
    setContactMsgs(cm.messages || [])
  }, [statusFilter])

  async function toggleContactRead(id: string, isRead: boolean) {
    setBusyId(id)
    await fetch('/api/super/contact-messages', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_read: isRead }),
    })
    setBusyId(null)
    setContactMsgs(list => list.map(m => m.id === id ? { ...m, is_read: isRead } : m))
  }

  useEffect(() => { load() }, [load])
  useEffect(() => { if (authed === false) router.replace('/super') }, [authed, router])

  async function setStatus(id: string, status: string) {
    setBusyId(id)
    await fetch('/api/super/tickets', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    setBusyId(null)
    load()
  }

  async function sendReply(id: string) {
    const reply = (replyDrafts[id] || '').trim()
    if (!reply) { await dialog.uiAlert('متن پاسخ را بنویس'); return }
    setBusyId(id)
    await fetch('/api/super/tickets', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, admin_reply: reply, status: 'in_progress' }),
    })
    setBusyId(null)
    load()
  }

  if (authed === null || loading) {
    return <main className="min-h-screen grid place-items-center text-soot">در حال بارگذاری…</main>
  }

  const openCount = tickets.filter(t => t.status === 'open').length

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header>
        <a href="/super" className="text-xs text-soot underline">← بازگشت به لیست متخصص‌ها</a>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-xl font-bold text-ink">تیکت‌های پشتیبانی {PLATFORM_NAME}</h1>
          <span className="text-sm text-soot tnum">{openCount} باز رسیدگی‌نشده</span>
        </div>
      </header>

      <section className="flex gap-2 flex-wrap">
        {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={'text-xs rounded-xl px-3 py-1.5 border ' + (statusFilter === s ? 'bg-ink text-white border-ink' : 'border-sand text-ink')}>
            {s === 'all' ? 'همه' : STATUS_LABEL[s]}
          </button>
        ))}
      </section>

      <section className="space-y-3">
        {tickets.length === 0 && <p className="text-sm text-soot">تیکتی با این فیلتر نیست.</p>}
        {tickets.map(t => (
          <div key={t.id} className="bg-white border border-sand rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-ink text-sm">{t.subject}</span>
                <span className="text-[11px] text-soot">{CATEGORY_LABEL[t.category] || t.category}</span>
              </div>
              <span
                className={
                  'text-[11px] px-2 py-0.5 rounded-full ' +
                  (t.status === 'resolved' || t.status === 'closed' ? 'bg-emerald-100 text-emerald-800'
                    : t.status === 'in_progress' ? 'bg-amber-100 text-amber-800' : 'bg-sand text-soot')
                }
              >
                {STATUS_LABEL[t.status] || t.status}
              </span>
            </div>
            <div className="text-xs text-soot flex items-center gap-2 flex-wrap">
              <span>{t.tenant_display_name || t.tenant_slug}</span>
              <span>·</span>
              <a href={`/${t.tenant_slug}`} target="_blank" dir="ltr" className="underline">/{t.tenant_slug}</a>
              <span>·</span>
              <span>{t.submitted_by_name}</span>
              <span>·</span>
              <span className="tnum">{new Date(t.created_at).toLocaleDateString('fa-IR')}</span>
            </div>
            <p className="text-sm text-ink leading-relaxed">{t.message}</p>
            {t.admin_reply && (
              <div className="bg-sand/60 rounded-xl p-2.5">
                <p className="text-[11px] text-soot mb-0.5">پاسخ قبلی:</p>
                <p className="text-xs text-ink leading-relaxed">{t.admin_reply}</p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                value={replyDrafts[t.id] ?? ''}
                onChange={e => setReplyDrafts(s => ({ ...s, [t.id]: e.target.value }))}
                placeholder="پاسخ بنویس…"
                className="flex-1 border border-sand rounded-xl px-3 py-2 text-sm"
              />
              <button onClick={() => sendReply(t.id)} disabled={busyId === t.id}
                className="text-xs bg-ink text-white rounded-xl px-4 py-2 disabled:opacity-50 shrink-0">
                ارسال پاسخ
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap pt-1">
              {(['open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
                <button key={s} onClick={() => setStatus(t.id, s)} disabled={busyId === t.id}
                  className={'text-[11px] rounded-lg px-2.5 py-1 border disabled:opacity-40 ' + (t.status === s ? 'bg-ink text-white border-ink' : 'border-sand text-soot')}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── پیام‌های فرم «تماس با ما» لندینگ — بازدیدکننده‌های بدون حساب ── */}
      <section className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">پیام‌های سایت (فرم تماس با ما)</h2>
          <span className="text-sm text-soot tnum">{contactMsgs.filter(m => !m.is_read).length} خوانده‌نشده</span>
        </div>
        {contactMsgs.length === 0 && <p className="text-sm text-soot">هنوز پیامی از فرم تماس سایت نرسیده.</p>}
        {contactMsgs.map(m => (
          <div key={m.id} className={`bg-white border rounded-2xl p-4 space-y-2 ${m.is_read ? 'border-sand' : 'border-amber-500/40'}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`mailto:${m.email}`} dir="ltr" className="font-bold text-ink text-sm underline underline-offset-4">{m.email}</a>
                {!m.is_read && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">جدید</span>}
              </div>
              <span className="text-[11px] text-soot tnum">{new Date(m.created_at).toLocaleDateString('fa-IR')}</span>
            </div>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{m.message}</p>
            <div className="flex gap-2 pt-1">
              <a href={`mailto:${m.email}`} className="text-xs bg-ink text-white rounded-xl px-4 py-2">پاسخ با ایمیل</a>
              <button onClick={() => toggleContactRead(m.id, !m.is_read)} disabled={busyId === m.id}
                className="text-xs border border-sand text-soot rounded-xl px-4 py-2 disabled:opacity-40">
                {m.is_read ? 'علامت‌گذاری خوانده‌نشده' : 'خوانده شد'}
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}

export default function SuperTicketsPage() {
  return (
    <DialogProvider>
      <TicketsInner />
    </DialogProvider>
  )
}
