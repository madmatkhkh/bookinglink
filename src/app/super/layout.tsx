'use client'
// دارک‌مود برای کل بخش سوپرادمین (همه‌ی صفحات /super/*) — یک لایه‌ی مشترک
// به‌جای تکرار state/دکمه در هر صفحه. از همان کلاس CSS پنل تنانت
// (.pb-admin-dark در globals.css) استفاده می‌کند، فقط با کلید جدای
// localStorage (super_admin_dark) — چون این دو تا context کاملا جدا هستند
// (سوپرادمین به هیچ tenant خاصی وصل نیست) و ترجیح تیره/روشن‌شان لازم نیست
// به هم قفل باشد. هیچ صفحه‌ای زیر /super نیازی به تغییر نداشت — چون همه‌ی
// override‌های دارک‌مود از قبل روی کلاس‌های عمومی (bg-white، text-ink، ...)
// تعریف شده‌اند، فقط کافی‌ست این کلاس روی یک والد مشترک بنشیند.
import { useEffect, useState } from 'react'

export default function SuperLayout({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('super_admin_dark') === '1'
    setDark(saved)
  }, [])

  function toggle(on: boolean) {
    setDark(on)
    try { localStorage.setItem('super_admin_dark', on ? '1' : '0') } catch {}
  }

  return (
    <div className={dark ? 'pb-admin-dark min-h-screen' : 'min-h-screen'}>
      {children}

      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-white border border-sand rounded-full pl-3 pr-1.5 py-1.5 shadow-lg text-xs text-soot">
        <span>🌙 حالت تیره</span>
        <button type="button" role="switch" aria-checked={dark} aria-label="حالت تیره" dir="ltr"
          onClick={() => toggle(!dark)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${dark ? 'bg-ink' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${dark ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>
    </div>
  )
}
