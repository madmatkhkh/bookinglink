'use client'
import { useEffect, useRef } from 'react'

// همان الگویی که در Dialog.tsx/ui-Dialog.tsx پیاده شد، به‌صورت یک هوک عمومی
// برای هر مودال سفارشی دیگر (نه فقط uiAlert/uiConfirm/uiPrompt). هر مودالی
// که با یک boolean باز/بسته می‌شود، فقط کافی است این را صدا بزند:
//
//   useModalBackClose(showNewPackage, () => setShowNewPackage(false))
//
// تا وقتی مودال باز است یک ورودی از تاریخچه‌ی مرورگر اشغالش می‌کند — اولین
// برگشت (چه گوشی چه مرورگر) فقط همین مودال را می‌بندد، نه صفحه‌ی زیرین را.
// بستن با کلیک عادی (دکمه‌ی انصراف/ثبت یا کلیک روی پس‌زمینه) هم خودش با
// history.back همان ورودی را مصرف می‌کند تا برگشت اضافه‌ای روی صف نماند.
export function useModalBackClose(isOpen: boolean, onClose: () => void) {
  const closingViaPop = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    window.history.pushState({ __modal: true }, '')
    function handlePopState() {
      closingViaPop.current = true
      onClose()
    }
    window.addEventListener('popstate', handlePopState)
    // این cleanup هم برای «isOpen شد false» اجرا می‌شود هم برای unmount شدن
    // کامپوننت مودال (وقتی مودال یک کامپوننت جداست که فقط وقتی باز است mount
    // می‌شود، نه یک boolean در کامپوننت همیشه‌-mount) — یعنی هر دو الگوی
    // استفاده را با یک پیاده‌سازی پوشش می‌دهد.
    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (!closingViaPop.current) window.history.back()
      closingViaPop.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
}
