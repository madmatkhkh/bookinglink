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

// ── اسکلتون بارگذاری لیست‌ها — به‌جای متن «در حال بارگذاری…» ──
export function SkeletonRows({ count = 4, height = 'h-[72px]' }: { count?: number; height?: string }) {
 return (
  <div className="space-y-2" aria-hidden="true">
   {Array.from({ length: count }).map((_, i) => (
    <div key={i} className={`${height} bg-white rounded-xl border border-sand p-4 flex items-center gap-3`}>
     <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse shrink-0" />
     <div className="flex-1 space-y-2">
      <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
      <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/2" />
     </div>
    </div>
   ))}
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
