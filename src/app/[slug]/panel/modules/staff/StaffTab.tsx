'use client'
// ── ماژول «درمانگرها» (حالت کلینیک) — سومین تب جداشده از PsychologyAdmin ─────
// (فاز 4). کد عینا منتقل شده — بدون تغییر رفتار. state لیست درمانگرها
// (staffList) و loader آن در والد مانده چون کل پنل مصرفش می‌کند (سوییچر
// «کدام دکتر» در داشبورد/تنظیمات/برنامه و...)؛ این‌جا فقط فرم افزودن/ویرایش
// و اکشن‌های CRUD زندگی می‌کنند. تایپ ResourceRow این‌جا export می‌شود و والد
// type-only import می‌کند (همان الگوی FinanceTab).
import { useState } from 'react'
import { toFarsiNum } from '@/lib/calendar'
import { uiAlert, uiConfirm } from '@/components/ui/Dialog'
import { PageHeader } from '../shared'

export type ResourceRow = {
 id: string
 name: string
 title: string
 avatar_url: string | null
 phone: string | null
 is_active: boolean
 is_selectable: boolean
 sort_order: number
}

export default function StaffTab({ panelApi, staffList, staffLoaded, reloadStaff }: {
 panelApi: (path: string) => string
 staffList: ResourceRow[]
 staffLoaded: boolean
 reloadStaff: () => Promise<void>
}) {
 const [staffForm, setStaffForm] = useState<{ id: string; name: string; title: string; phone: string }>({ id: '', name: '', title: '', phone: '' })
 const [staffFormOpen, setStaffFormOpen] = useState(false)
 const [staffSaving, setStaffSaving] = useState(false)

 function openNewStaffForm() { setStaffForm({ id: '', name: '', title: '', phone: '' }); setStaffFormOpen(true) }
 function openEditStaffForm(r: ResourceRow) { setStaffForm({ id: r.id, name: r.name, title: r.title, phone: r.phone || '' }); setStaffFormOpen(true) }

 async function saveStaffMember() {
  if (!staffForm.name.trim()) { uiAlert('نام لازم است'); return }
  setStaffSaving(true)
  try {
   const method = staffForm.id ? 'PATCH' : 'POST'
   const res = await fetch(panelApi('/resources'), {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: staffForm.id || undefined, name: staffForm.name, title: staffForm.title, phone: staffForm.phone }),
   })
   const d = await res.json().catch(() => ({}))
   if (!res.ok) { uiAlert(d.error || 'ذخیره نشد'); setStaffSaving(false); return }
   setStaffFormOpen(false)
   await reloadStaff()
  } catch (e: any) {
   uiAlert('خطای شبکه: ' + (e?.message || e))
  }
  setStaffSaving(false)
 }

 async function deactivateStaffMember(id: string) {
  const ok = await uiConfirm('این درمانگر غیرفعال شود؟ پرونده‌های قبلی‌اش دست‌نخورده می‌ماند.')
  if (!ok) return
  const res = await fetch(panelApi('/resources'), {
   method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) { uiAlert(d.error || 'حذف نشد'); return }
  await reloadStaff()
 }

 return (
    <div className="max-w-lg mx-auto pb-24">
     <PageHeader title="درمانگرها" desc="هر درمانگر پرونده‌ها، برنامه‌ی کاری و پروفایل خودش را دارد و در صورت ثبت شماره‌ی موبایل، مستقل وارد پنل می‌شود." />
     {!staffLoaded ? (
      <div className="text-center py-16 text-soot">در حال بارگذاری...</div>
     ) : (
      <div className="space-y-2 mb-4">
       {staffList.map(r => (
        <div key={r.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-3 ${r.is_active ? 'border-sand' : 'border-sand opacity-50'}`}>
         <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-sand flex items-center justify-center text-ink font-semibold text-sm shrink-0 overflow-hidden">
           {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" /> : (r.name?.charAt(0) || '?')}
          </div>
          <div className="min-w-0">
           <div className="text-sm font-medium text-ink truncate">{r.name}{r.title ? ` — ${r.title}` : ''}</div>
           <div className="text-xs text-soot mt-0.5" dir="ltr">
            {r.phone ? toFarsiNum(r.phone) : 'بدون ورود مستقل'}
            {!r.is_active && <span className="text-red-500"> · غیرفعال</span>}
           </div>
          </div>
         </div>
         <div className="flex gap-2 shrink-0">
          <button onClick={() => openEditStaffForm(r)}
           className="text-xs px-2.5 py-1.5 border border-sand rounded-lg text-soot hover:bg-gray-50">ویرایش</button>
          {r.is_active && (
           <button onClick={() => deactivateStaffMember(r.id)}
            className="text-xs px-2.5 py-1.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5">غیرفعال</button>
          )}
         </div>
        </div>
       ))}
      </div>
     )}

     <button onClick={openNewStaffForm}
      className="w-full py-2.5 border border-sand text-ink rounded-xl text-sm hover:bg-sand">
      افزودن درمانگر تازه
     </button>

     {staffFormOpen && (
      <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/30" onClick={() => setStaffFormOpen(false)}>
       <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-display font-bold text-ink mb-4">{staffForm.id ? 'ویرایش درمانگر' : 'افزودن درمانگر'}</h3>
        <div className="space-y-3">
         <div>
          <label className="text-xs text-soot mb-1 block">نام</label>
          <input value={staffForm.name} onChange={e => setStaffForm(s => ({ ...s, name: e.target.value }))}
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
         </div>
         <div>
          <label className="text-xs text-soot mb-1 block">عنوان / تخصص</label>
          <input value={staffForm.title} onChange={e => setStaffForm(s => ({ ...s, title: e.target.value }))}
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
         </div>
         <div>
          <label className="text-xs text-soot mb-1 block">شماره‌ی موبایل (اختیاری — برای ورود مستقل)</label>
          <input value={staffForm.phone} onChange={e => setStaffForm(s => ({ ...s, phone: e.target.value }))}
           dir="ltr" placeholder="09xxxxxxxxx"
           className="w-full text-sm px-3 py-2 border border-sand rounded-lg focus:outline-none focus:border-ink" />
         </div>
        </div>
        <div className="flex gap-2 mt-5">
         <button onClick={() => setStaffFormOpen(false)}
          className="flex-1 py-2.5 border border-sand rounded-xl text-sm text-soot">انصراف</button>
         <button onClick={saveStaffMember} disabled={staffSaving}
          className="flex-1 py-2.5 bg-ink text-white rounded-xl text-sm font-medium disabled:opacity-50">
          {staffSaving ? 'در حال ذخیره...' : 'ذخیره'}
         </button>
        </div>
       </div>
      </div>
     )}
    </div>
 )
}
