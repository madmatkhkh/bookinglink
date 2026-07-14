'use client'
// ── کامپوننت‌های مشترک پنل — بین PsychologyAdmin و ماژول‌های جداشده (فاز 4) ──
// این‌ها قبلا توابع محلی داخل PsychologyAdmin.tsx بودند؛ با شروع جداسازی
// تب‌ها به panel/modules/<key>/ باید از یک‌جا import شوند. عینا و بدون تغییر
// رفتار منتقل شده‌اند.
import React from 'react'
import { Glyph } from '@/components/Glyph'

export function PageHeader({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
 return (
  <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
   <div>
    <h1 className="sr-only">{title}</h1>
    {desc && <p className="text-xs text-soot">{desc}</p>}
   </div>
   {action}
  </div>
 )
}

// ── حالت خالی استاندارد — آیکون + عنوان + توضیح + اقدام (به‌جای یک خط متن خشک) ──
export function EmptyState({ icon, title, desc, action }: { icon: string; title: string; desc?: string; action?: React.ReactNode }) {
 return (
  <div className="text-center py-14 px-4 bg-white rounded-2xl border border-sand">
   <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
    <Glyph icon={icon} className="w-6 h-6 text-soot" />
   </div>
   <div className="text-sm font-display font-semibold text-ink">{title}</div>
   {desc && <p className="text-xs text-soot mt-1.5 max-w-xs mx-auto leading-relaxed">{desc}</p>}
   {action && <div className="mt-4">{action}</div>}
  </div>
 )
}
