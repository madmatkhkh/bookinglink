'use client'
import { useState } from 'react'
import { IntakeForm, FormField, FormFieldType } from '@/lib/psy'
import { toLatinNum } from '@/lib/calendar'
import { uiConfirm } from '@/components/ui/Dialog'
import { genId } from '../shared'

// در پنل ادمین همه‌ی ارقام لاتین نمایش داده می‌شوند (همان تعریف والد — عمدا
// تکرار شد تا این ماژول به PsychologyAdmin وابسته نباشد؛ یک خط است).
const toFarsiNum = (n: number | string) => toLatinNum(String(n))

// ── فرم‌بیلدر رزرو — جداشده از PsychologyAdmin (ادامه‌ی فاز 4) ───────────────
//
// چرا این تکه اول جدا شد (و نه کل تب تنظیمات یک‌جا): تب تنظیمات روی هم 72
// شناسه از والدش می‌خواند — یعنی یک کامپوننت با 72 prop، که نه قابل‌نگهداری
// است نه قابل‌بازاستفاده. ولی 34 تای آن 72 تا فقط مال همین فرم‌بیلدر بود، و
// این زیرسیستم برخلاف بقیه‌ی بخش‌های تنظیمات state خودش را دارد و هیچ‌جای
// دیگر پنل استفاده نمی‌شود. پس جداکردنش هم بیشترین حجم را می‌برد هم کمترین
// ریسک را دارد: از 34 وابستگی به 3 prop.
//
// چه چیزی اینجا ماند و چه چیزی در والد:
//   • اینجا: کل state نمایشی (انتخاب جاری، آکاردئون باز، درگ‌اند‌دراپ، متن
//     زیرسوال تازه) + همه‌ی mutatorهای ساختار فرم + رندر.
//   • در والد: خود `intakeForm` و `setIntakeForm`. عمدا — چون نوار ذخیره‌ی
//     مشترک تنظیمات (`isSettingsTabDirty`) هر سه فرم (settings/profile/
//     intake) را با هم مقایسه و ذخیره می‌کند. اگر این state پایین می‌آمد،
//     آن نوار دیگر نمی‌فهمید فرم رزرو عوض شده — یعنی دکمه‌ی ذخیره ظاهر
//     نمی‌شد و تغییرات مراجع بی‌صدا از بین می‌رفت.
//
// ⚠️ پاک‌کردن انتخاب هنگام لود دوباره: قبلا `loadIntakeForm` در والد صریحا
// `setBuilderSel(null)` و `setOpenSection(null)` می‌زد. حالا آن state اینجاست،
// پس والد دسترسی ندارد. جایگزین از دو راه پوشش داده شد و رفتار عینا حفظ شد:
//   • خروج از تب تنظیمات → کل بلوک unmount می‌شود → state خودبه‌خود پاک.
//   • سوییچ بین دکترها (بدون unmount) → والد `key={viewingResourceId}` می‌دهد،
//     پس React کامپوننت را از نو می‌سازد. همان اثر، بدون prop اضافه.
//
// حذف‌شده حین انتقال: `moveFormSection`/`moveFormField` — کد مرده بودند
// (بازمانده‌ی دکمه‌های بالا/پایین که با درگ‌اند‌دراپ جایگزین شدند و هیچ‌جا
// صدا زده نمی‌شدند). با grep تایید شد.

type BuilderSel = { sIdx: number; fIdx: number | null } | null

export default function IntakeFormBuilder({ intakeForm, setIntakeForm, intakeLoaded }: {
  intakeForm: IntakeForm
  setIntakeForm: React.Dispatch<React.SetStateAction<IntakeForm>>
  intakeLoaded: boolean
}) {
 // state کاملا نمایشی — هیچ‌کدام در ذخیره‌سازی نقشی ندارند، پس جایشان همین‌جاست
 const [builderSel, setBuilderSel] = useState<BuilderSel>(null)
 const [openSection, setOpenSection] = useState<string | null>(null)
 const [newSubQuestion, setNewSubQuestion] = useState<Record<string, string>>({})
 const [dragField, setDragField] = useState<{ sIdx: number; fIdx: number } | null>(null)
 const [dragOverField, setDragOverField] = useState<{ sIdx: number; fIdx: number } | null>(null)
 const [dragSectionIdx, setDragSectionIdx] = useState<number | null>(null)
 const [dragOverSectionIdx, setDragOverSectionIdx] = useState<number | null>(null)

 // سوال‌هایی که می‌توانند «شرط» یک سوال بعدی باشند: فقط تک‌گزینه‌ای/چندگزینه‌ای، و فقط آن‌هایی که قبل از این سوال آمده‌اند
 function eligibleTriggerFields(sIdx: number, fIdx: number): FormField[] {
  const result: FormField[] = []
  for (let si = 0; si < intakeForm.sections.length; si++) {
   for (let fi = 0; fi < intakeForm.sections[si].fields.length; fi++) {
    if (si === sIdx && fi === fIdx) return result
    const fld = intakeForm.sections[si].fields[fi]
    if ((fld.type === 'select' || fld.type === 'multiselect') && (fld.options || []).length > 0) result.push(fld)
   }
  }
  return result
 }
 // همه‌ی سوال‌هایی که بعد این سوال می‌آیند — برای وصل‌کردن «این گزینه، کدام سوال‌های بعدی رو نشون بده»
 function downstreamFields(sIdx: number, fIdx: number): { sIdx: number; fIdx: number; field: FormField }[] {
  const result: { sIdx: number; fIdx: number; field: FormField }[] = []
  let started = false
  for (let si = 0; si < intakeForm.sections.length; si++) {
   for (let fi = 0; fi < intakeForm.sections[si].fields.length; fi++) {
    if (si === sIdx && fi === fIdx) { started = true; continue }
    if (started) result.push({ sIdx: si, fIdx: fi, field: intakeForm.sections[si].fields[fi] })
   }
  }
  return result
 }
 const fieldTypeIcon = (t: FormFieldType) => t === 'text' ? 'Aa' : t === 'textarea' ? '¶' : t === 'select' ? '◉' : t === 'date' ? '' : t === 'phone' ? '☎' : t === 'email' ? '@' : '☑'
 const fieldTypeLabel = (t: FormFieldType) => t === 'text' ? 'متن کوتاه' : t === 'textarea' ? 'متن بلند' : t === 'select' ? 'تک‌گزینه‌ای' : t === 'date' ? 'تاریخ' : t === 'phone' ? 'شماره‌تماس' : t === 'email' ? 'ایمیل' : 'چندگزینه‌ای'

 function addFormSection() {
  const id = genId('section')
  setIntakeForm(f => ({ sections: [...f.sections, { id, title: 'بخش جدید', fields: [] }] }))
  setBuilderSel({ sIdx: intakeForm.sections.length, fIdx: null })
  setOpenSection(id)
 }
 function updateFormSection(idx: number, patch: Partial<IntakeForm['sections'][number]>) {
  setIntakeForm(f => ({ sections: f.sections.map((s, i) => i === idx ? { ...s, ...patch } : s) }))
 }
 function removeFormSection(idx: number) {
  setIntakeForm(f => ({ sections: f.sections.filter((_, i) => i !== idx) }))
  setBuilderSel(sel => (sel && sel.sIdx === idx) ? null : sel)
 }
 // جابه‌جایی آزاد (برای درگ‌اند‌دراپ) — از هر اندیس به هر اندیس دیگر
 function reorderFormSection(from: number, to: number) {
  if (from === to) return
  setIntakeForm(f => {
   const next = [...f.sections]
   const [item] = next.splice(from, 1)
   next.splice(to, 0, item)
   return { sections: next }
  })
  setBuilderSel(sel => {
   if (!sel) return sel
   if (sel.sIdx === from) return { ...sel, sIdx: to }
   if (from < to && sel.sIdx > from && sel.sIdx <= to) return { ...sel, sIdx: sel.sIdx - 1 }
   if (from > to && sel.sIdx >= to && sel.sIdx < from) return { ...sel, sIdx: sel.sIdx + 1 }
   return sel
  })
 }
 function addFormField(sIdx: number) {
  const newIdx = intakeForm.sections[sIdx].fields.length
  updateFormSection(sIdx, {
   fields: [...intakeForm.sections[sIdx].fields, { id: genId('field'), label: 'سوال جدید', type: 'text' as FormFieldType, required: false }],
  })
  setBuilderSel({ sIdx, fIdx: newIdx })
  setOpenSection(intakeForm.sections[sIdx].id)
 }
 // زیرسوال تازه که خود دکتر متنش رو می‌نویسه — درست بعد سوال محرک اضافه می‌شه و
 // به همون گزینه وصل می‌شه (showIf از قبل ست شده، دیگه نیازی به لینک‌کردن دستی نیست)
 function addSubQuestion(sIdx: number, fIdx: number, optionValue: string) {
  const triggerField = intakeForm.sections[sIdx].fields[fIdx]
  const key = `${triggerField.id}:${optionValue}`
  const label = (newSubQuestion[key] || '').trim()
  if (!label) return
  const newField: FormField = { id: genId('field'), label, type: 'text', required: false, showIf: { fieldId: triggerField.id, value: optionValue } }
  setIntakeForm(f => ({
   sections: f.sections.map((s, i) => i !== sIdx ? s : {
    ...s, fields: [...s.fields.slice(0, fIdx + 1), newField, ...s.fields.slice(fIdx + 1)],
   }),
  }))
  setNewSubQuestion(s => ({ ...s, [key]: '' }))
  setBuilderSel({ sIdx, fIdx: fIdx + 1 })
 }
 function updateFormField(sIdx: number, fIdx: number, patch: Partial<FormField>) {
  setIntakeForm(f => ({
   sections: f.sections.map((s, i) => i !== sIdx ? s : {
    ...s, fields: s.fields.map((fl, j) => j === fIdx ? { ...fl, ...patch } : fl),
   }),
  }))
 }
 function removeFormField(sIdx: number, fIdx: number) {
  setIntakeForm(f => ({
   sections: f.sections.map((s, i) => i !== sIdx ? s : { ...s, fields: s.fields.filter((_, j) => j !== fIdx) }),
  }))
  setBuilderSel(sel => (sel && sel.sIdx === sIdx && sel.fIdx === fIdx) ? null : sel)
 }
 // جابه‌جایی آزاد سوال داخل همان بخش (برای درگ‌اند‌دراپ)
 function reorderFormField(sIdx: number, from: number, to: number) {
  if (from === to) return
  setIntakeForm(f => ({
   sections: f.sections.map((s, i) => {
    if (i !== sIdx) return s
    const next = [...s.fields]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return { ...s, fields: next }
   }),
  }))
  setBuilderSel(sel => {
   if (!sel || sel.sIdx !== sIdx || sel.fIdx === null) return sel
   if (sel.fIdx === from) return { ...sel, fIdx: to }
   if (from < to && sel.fIdx > from && sel.fIdx <= to) return { ...sel, fIdx: sel.fIdx - 1 }
   if (from > to && sel.fIdx >= to && sel.fIdx < from) return { ...sel, fIdx: sel.fIdx + 1 }
   return sel
  })
 }

 return (
  <section className="bg-white rounded-2xl border border-sand p-5">
   <h2 className="text-sm font-display font-semibold text-ink mb-1">فرم رزرو</h2>
   <p className="text-xs text-soot mb-4">
    از لیست یه سوال رو انتخاب کن تا تو پنل کنارش ویرایشش کنی. نام و شماره‌تماس همیشه ثابت‌اند و این‌جا نیستند.
   </p>
   {!intakeLoaded ? (
    <div className="text-center py-8 text-soot text-sm">در حال بارگذاری فرم...</div>
   ) : (
    <div className="grid sm:grid-cols-[260px_1fr] gap-4 items-start">
     {/* ── لیست: آکاردئون + جابه‌جایی با درگ (فقط از دستگیره‌ی ⠿) ── */}
     <div className="bg-gray-50 rounded-xl p-2 sm:max-h-[560px] sm:overflow-y-auto">
      {intakeForm.sections.map((section, sIdx) => {
       const isOpen = openSection === section.id
       return (
        <div key={section.id} className="mb-1.5"
         onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragSectionIdx !== null) setDragOverSectionIdx(sIdx) }}
         onDragLeave={() => setDragOverSectionIdx(x => x === sIdx ? null : x)}
         onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragSectionIdx !== null) reorderFormSection(dragSectionIdx, sIdx); setDragSectionIdx(null); setDragOverSectionIdx(null) }}
        >
         {dragOverSectionIdx === sIdx && dragSectionIdx !== null && dragSectionIdx !== sIdx && (
          <div className="h-0.5 bg-ink rounded-full mb-1 mx-2" />
         )}
         {/* ── ردیف بخش: پس‌زمینه‌ی پررنگ‌تر + بولد + آیکون پوشه، تا کاملا از سوال‌ها جدا دیده شود ── */}
         <div
          className={`w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg transition-colors bg-gray-200/70 ${
           isOpen ? 'ring-1 ring-inset ring-gray-300' : 'hover:bg-gray-200'}`}>
          <span draggable title="جابه‌جایی"
           onDragStart={e => { e.stopPropagation(); setDragSectionIdx(sIdx) }}
           onDragEnd={() => { setDragSectionIdx(null); setDragOverSectionIdx(null) }}
           className="text-soot text-xs shrink-0 cursor-grab active:cursor-grabbing px-0.5">⠿</span>
          <button onClick={() => { setOpenSection(x => x === section.id ? null : section.id); setBuilderSel({ sIdx, fIdx: null }) }}
           className="flex-1 min-w-0 flex items-center gap-2 text-right">
           <svg viewBox="0 0 24 24" className={`w-2.5 h-2.5 text-soot shrink-0 transition-transform ${isOpen ? '-rotate-90' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
           </svg>
           <span className="text-xs shrink-0"></span>
           <span className="flex-1 min-w-0 truncate text-sm font-bold text-ink">{section.title || 'بخش بی‌نام'}</span>
           <span className="text-[10px] text-soot shrink-0 bg-white px-1.5 py-0.5 rounded-full">{section.fields.length}</span>
          </button>
         </div>
         {isOpen && (
          <div className="mt-1 space-y-1 pr-2">
           {section.fields.map((field, fIdx) => {
            const isConditional = !!field.showIf
            return (
             <div key={field.id}
              className={isConditional ? 'mr-4' : ''}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragField && dragField.sIdx === sIdx) setDragOverField({ sIdx, fIdx }) }}
              onDragLeave={() => setDragOverField(x => (x && x.sIdx === sIdx && x.fIdx === fIdx) ? null : x)}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragField && dragField.sIdx === sIdx) reorderFormField(sIdx, dragField.fIdx, fIdx); setDragField(null); setDragOverField(null) }}
             >
              {dragOverField?.sIdx === sIdx && dragOverField.fIdx === fIdx && dragField && dragField.fIdx !== fIdx && (
               <div className="h-0.5 bg-ink rounded-full mb-0.5 mr-4" />
              )}
              <div className={`w-full flex items-center gap-1 pr-1 pl-2.5 py-2 rounded-lg transition-colors border ${
                builderSel?.sIdx === sIdx && builderSel?.fIdx === fIdx
                 ? 'bg-white border-sand shadow-sm'
                 : isConditional ? 'bg-gray-100/60 border-sand hover:bg-gray-100' : 'bg-white/60 border-transparent hover:bg-gray-100'
               } ${field.hidden ? 'opacity-40' : ''}`}>
               {isConditional && <span className="text-soot text-xs shrink-0">↳</span>}
               <span draggable title="جابه‌جایی"
                onDragStart={e => { e.stopPropagation(); setDragField({ sIdx, fIdx }) }}
                onDragEnd={() => { setDragField(null); setDragOverField(null) }}
                className="text-gray-300 text-xs shrink-0 cursor-grab active:cursor-grabbing px-0.5">⠿</span>
               <button onClick={() => setBuilderSel({ sIdx, fIdx })}
                className="flex-1 min-w-0 flex items-center gap-2 text-right">
                <span className="text-[10px] text-gray-300 shrink-0 w-4 text-center">{fieldTypeIcon(field.type)}</span>
                <span className={`flex-1 min-w-0 truncate text-xs ${isConditional ? 'text-ink' : 'text-ink'}`}>{field.label || 'بدون عنوان'}</span>
                {field.hidden && <span title="مخفی" className="text-[10px] text-soot shrink-0">🚫</span>}
                {field.required && <span title="اجباری" className="w-1.5 h-1.5 rounded-full bg-ink shrink-0" />}
               </button>
              </div>
             </div>
            )
           })}
           <button onClick={() => addFormField(sIdx)}
            className="w-full text-[11px] pr-4 pl-2.5 py-1.5 text-soot hover:text-ink text-right">+ سوال جدید</button>
          </div>
         )}
        </div>
       )
      })}
      <button onClick={addFormSection}
       className="w-full mt-1 text-xs py-2 border border-dashed border-gray-300 text-soot rounded-lg hover:border-gray-400 hover:text-ink">+ بخش جدید</button>
     </div>

     {/* ── پنل ویرایش متمرکز ── */}
     <div>
      {!builderSel ? (
       <div className="h-full min-h-[240px] flex items-center justify-center text-center text-sm text-soot bg-gray-50 rounded-xl p-8">
        یه سوال یا بخش رو از لیست انتخاب کن تا اینجا ویرایشش کنی
       </div>
      ) : builderSel.fIdx === null ? (
       // ── ویرایش بخش ──
       (() => {
        const sIdx = builderSel.sIdx
        const section = intakeForm.sections[sIdx]
        if (!section) return null
        return (
         <div className="bg-gray-50 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
           <span className="text-xs text-soot">ویرایش بخش — برای جابه‌جایی، از لیست کنار درگ کن</span>
           <button onClick={async () => { if (await uiConfirm(`بخش «${section.title}» با همه‌ی سوال‌هایش حذف شود؟`)) removeFormSection(sIdx) }}
            className="text-xs px-2.5 py-1.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5 shrink-0">حذف بخش</button>
          </div>
          <label className="text-xs text-soot mb-1 block">عنوان بخش</label>
          <input value={section.title} onChange={e => updateFormSection(sIdx, { title: e.target.value })}
           className="w-full text-base font-medium px-3 py-2.5 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
         </div>
        )
       })()
      ) : (
       // ── ویرایش سوال ──
       (() => {
        const { sIdx, fIdx } = builderSel
        const section = intakeForm.sections[sIdx]
        const field = section?.fields[fIdx]
        if (!field) return null
        const triggers = eligibleTriggerFields(sIdx, fIdx)
        const triggerField = field.showIf ? triggers.find(t => t.id === field.showIf!.fieldId) : undefined
        const downstream = downstreamFields(sIdx, fIdx)
        const canBeTrigger = (field.type === 'select' || field.type === 'multiselect') && (field.options || []).some(o => o.trim())
        return (
         <div className="bg-gray-50 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between">
           <span className="text-xs text-soot">ویرایش سوال — برای جابه‌جایی، از لیست کنار درگ کن</span>
           <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => updateFormField(sIdx, fIdx, { hidden: !field.hidden })}
             title={field.hidden ? 'نمایش دوباره' : 'مخفی‌کردن موقت (بدون حذف)'}
             className={`w-8 h-8 flex items-center justify-center rounded-lg border ${field.hidden ? 'border-sand bg-gray-100 text-soot' : 'border-sand bg-white text-soot hover:text-soot'}`}>
             {field.hidden ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
               <path d="M3 3l18 18" /><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6 0 9.5 5 10.5 7-.4.8-1.3 2.2-2.7 3.5M6.6 6.6C4.4 8 3 10.3 1.5 12c1 2 4.5 7 10.5 7 1.5 0 2.9-.3 4.1-.8" />
               <path d="M9.9 10a3 3 0 0 0 4.2 4.2" />
              </svg>
             ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
               <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" />
               <circle cx="12" cy="12" r="3" />
              </svg>
             )}
            </button>
            <button onClick={() => removeFormField(sIdx, fIdx)}
             className="text-xs px-2.5 py-1.5 border border-red-500/30 text-red-600 rounded-lg hover:bg-red-500/5">حذف سوال</button>
           </div>
          </div>

          {field.hidden && (
           <div className="text-xs text-ink bg-gray-100 border border-sand rounded-lg p-2.5">
            این سوال الان مخفی است — مراجع اصلا نمی‌بیندش، ولی حذف نشده و هروقت خواستی می‌تونی برش‌گردونی.
           </div>
          )}

          {/* پیش‌نمایش زنده */}
          <div className="bg-white rounded-xl border border-sand p-4">
           <p className="text-[10px] text-soot mb-2">این‌طوری مراجع می‌بیند:</p>
           <div className="flex items-center gap-1 mb-1.5">
            <span className="text-xs text-soot">{field.label || 'بدون عنوان'}</span>
            {field.required && <span className="text-soot text-xs">*</span>}
           </div>
           {field.type === 'text' && (
            <input disabled placeholder={field.placeholder} className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-gray-50 text-soot" />
           )}
           {field.type === 'textarea' && (
            <textarea disabled rows={2} placeholder={field.placeholder} className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-gray-50 text-soot resize-none" />
           )}
           {(field.type === 'select' || field.type === 'multiselect') && (
            <div className="flex gap-2 flex-wrap">
             {(field.options || []).length === 0 && <span className="text-xs text-gray-300">هنوز گزینه‌ای نیست</span>}
             {(field.options || []).map((o, oi) => (
              <span key={oi} className={`text-xs px-3 py-1.5 border border-sand text-soot bg-gray-50 ${field.type === 'select' ? 'rounded-lg' : 'rounded-full'}`}>{o}</span>
             ))}
            </div>
           )}
           {field.type === 'date' && (
            <div className="w-full text-sm px-3 py-2.5 border border-sand rounded-xl bg-gray-50 text-soot flex items-center justify-between">
             <span>انتخاب تاریخ</span>
             <span></span>
            </div>
           )}
           {field.type === 'phone' && (
            <input disabled dir="ltr" placeholder="09xxxxxxxxx" className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-gray-50 text-soot" />
           )}
           {field.type === 'email' && (
            <input disabled dir="ltr" placeholder="example@gmail.com" className="w-full text-sm px-3 py-2 border border-sand rounded-lg bg-gray-50 text-soot" />
           )}
          </div>

          {/* اگر این سوال خودش وابسته به یه سوال قبلیه — فقط نمایشی، ساخته نمی‌شه اینجا */}
          {field.showIf && (
           <div className="flex items-center justify-between gap-2 text-xs bg-gray-100 border border-sand rounded-lg p-3">
            <span className="text-ink">
             ⑂ این سوال فقط وقتی نشون داده می‌شه که پاسخ «{triggerField?.label || '؟'}» برابر «{field.showIf.value}» باشد
            </span>
            <button onClick={() => updateFormField(sIdx, fIdx, { showIf: undefined })}
             className="text-red-500 hover:text-red-700 shrink-0">حذف شرط</button>
           </div>
          )}

          <div>
           <label className="text-xs text-soot mb-1 block">متن سوال</label>
           <input value={field.label} onChange={e => updateFormField(sIdx, fIdx, { label: e.target.value })}
            className="w-full text-base px-3 py-2.5 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
          </div>

          <div>
           <label className="text-xs text-soot mb-2 block">نوع پاسخ</label>
           <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {(['text', 'textarea', 'select', 'multiselect', 'date', 'phone', 'email'] as FormFieldType[]).map(t => (
             <button key={t} onClick={() => updateFormField(sIdx, fIdx, { type: t })}
              className={`py-2 rounded-xl border text-center transition-all ${field.type === t ? 'border-ink border-2 bg-sand text-ink' : 'border-sand bg-white text-soot hover:border-gray-300'}`}>
              <div className="text-sm mb-0.5">{fieldTypeIcon(t)}</div>
              <div className="text-[9px]">{fieldTypeLabel(t)}</div>
             </button>
            ))}
           </div>
           <p className="text-[11px] text-soot mt-1.5 px-0.5">
            {field.type === 'text' && 'مراجع یک خط متن کوتاه می‌نویسد — مثل اسم یا سن.'}
            {field.type === 'textarea' && 'مراجع چند خط توضیح می‌نویسد — مثل دلیل مراجعه.'}
            {field.type === 'select' && 'مراجع فقط یکی از گزینه‌ها را انتخاب می‌کند — مثل بله/خیر.'}
            {field.type === 'multiselect' && 'مراجع می‌تواند چند گزینه را همزمان انتخاب کند — مثل چند علامت رفتاری.'}
            {field.type === 'date' && 'مراجع با یک تقویم واقعی شمسی (کلیک‌پذیر) تاریخ را انتخاب می‌کند — نه تایپ دستی.'}
            {field.type === 'phone' && 'فقط شماره‌ی موبایل معتبر (11 رقم، با 09) قبول می‌شود — نه هر متنی.'}
            {field.type === 'email' && 'فقط ایمیل معتبر قبول می‌شود.'}
           </p>
          </div>

          {(field.type === 'select' || field.type === 'multiselect') && (
           <div>
            <label className="text-xs text-soot mb-2 block">گزینه‌ها</label>
            <div className="space-y-1.5">
             {(field.options || []).map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
               <span className="text-[10px] text-gray-300 w-4 text-center shrink-0">{toFarsiNum(oi + 1)}</span>
               <input value={o}
                onChange={e => { const next = [...(field.options || [])]; next[oi] = e.target.value; updateFormField(sIdx, fIdx, { options: next }) }}
                className="flex-1 text-sm px-3 py-1.5 border border-sand rounded-lg bg-white focus:outline-none focus:border-ink" />
               <button onClick={() => updateFormField(sIdx, fIdx, { options: (field.options || []).filter((_, j) => j !== oi) })}
                className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-ink shrink-0">×</button>
              </div>
             ))}
            </div>
            <button onClick={() => updateFormField(sIdx, fIdx, { options: [...(field.options || []), ''] })}
             className="mt-2 text-xs px-3 py-1.5 border border-dashed border-gray-300 text-soot rounded-lg hover:border-gray-400 hover:text-soot">+ افزودن گزینه</button>
           </div>
          )}

          <label className="flex items-center justify-between p-3 rounded-xl border border-sand bg-white cursor-pointer">
           <span className="text-sm text-ink">پاسخ به این سوال اجباری باشد</span>
           <input type="checkbox" checked={field.required}
            onChange={e => updateFormField(sIdx, fIdx, { required: e.target.checked })}
            className="w-5 h-5 accent-ink" />
          </label>

          {/* منطق شرطی — از اینجا (سوال گزینه‌ای) تعیین می‌کنی هر جواب چه سوال‌هایی رو بعدش باز کنه */}
          {canBeTrigger && (
           <div>
            <label className="text-xs text-soot mb-1 block">این سوال کدام سوال‌های بعدی را کنترل می‌کند؟</label>
            <p className="text-[11px] text-soot mb-2">برای هر گزینه، فقط زیرسوالی که می‌خواهی بنویس — خودش وصل می‌شود.</p>
            <div className="space-y-2">
             {(field.options || []).filter(o => o.trim()).map(opt => {
              const key = `${field.id}:${opt}`
              const linked = downstream.filter(d => d.field.showIf?.fieldId === field.id && d.field.showIf?.value === opt)
              return (
               <div key={opt} className="p-3 rounded-xl bg-white border border-sand">
                <p className="text-xs text-soot mb-2">وقتی پاسخ «{opt}» بود:</p>

                {linked.length > 0 && (
                 <div className="flex flex-wrap gap-1.5 mb-2">
                  {linked.map(d => (
                   <span key={d.field.id} className="text-[11px] pl-1.5 pr-2.5 py-1 bg-sand text-ink rounded-lg flex items-center gap-1">
                    {d.field.label || 'بدون عنوان'}
                    <button onClick={() => updateFormField(d.sIdx, d.fIdx, { showIf: undefined })}
                     title="قطع این زیرسوال از این گزینه" className="text-soot hover:text-ink leading-none">×</button>
                   </span>
                  ))}
                 </div>
                )}

                <div className="flex items-center gap-2">
                 <input value={newSubQuestion[key] || ''}
                  onChange={e => setNewSubQuestion(s => ({ ...s, [key]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubQuestion(sIdx, fIdx, opt) } }}
                  placeholder="زیرسوال تازه بنویس..."
                  className="flex-1 min-w-0 text-xs px-2.5 py-1.5 border border-dashed border-gray-300 rounded-lg focus:outline-none focus:border-ink focus:border-solid" />
                 <button onClick={() => addSubQuestion(sIdx, fIdx, opt)} disabled={!(newSubQuestion[key] || '').trim()}
                  className="text-xs px-2.5 py-1.5 border border-sand text-ink rounded-lg hover:bg-sand disabled:opacity-40 shrink-0">+ افزودن</button>
                </div>
               </div>
              )
             })}
            </div>
           </div>
          )}
         </div>
        )
       })()
      )}
     </div>
    </div>
   )}
  </section>
 )
}
