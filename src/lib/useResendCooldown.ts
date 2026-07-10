'use client'
import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// تایمر «ارسال دوباره»ی کد — مشترک همه‌ی صفحات OTP (پنل مراجع، ورود دکتر/
// کارمند، رزرو نیچ جنریک، ثبت‌نام). وقتی کد فرستاده می‌شود start() صدا زده
// می‌شود؛ تا secondsLeft به صفر نرسد دکمه‌ی «ارسال دوباره» غیرفعال می‌ماند —
// هم برای تجربه‌ی کاربری (اگر پیامک دیر رسید، معلوم است کی دوباره می‌شود
// امتحان کرد) هم به‌عنوان یک لایه‌ی محافظ سمت کلاینت در برابر کلیک‌های
// پشت‌سرهم (سقف واقعی همچنان سمت سرور است: checkThrottle در auth.ts).
// ─────────────────────────────────────────────────────────────────────────────
export function useResendCooldown(seconds = 60) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function start() {
    if (timerRef.current) clearInterval(timerRef.current)
    setSecondsLeft(seconds)
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0 }
        return s - 1
      })
    }, 1000)
  }

  return { secondsLeft, canResend: secondsLeft === 0, start }
}
