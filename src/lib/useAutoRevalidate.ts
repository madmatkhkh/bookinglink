import { useEffect, useRef } from 'react'

/**
 * تازه‌سازی خودکار داده بدون نیاز به ریلود دستی صفحه.
 *
 * دو رفتار:
 *  - «revalidate on focus»: هر بار کاربر به تب/پنجره برمی‌گردد (focus یا
 *    visible شدن دوباره‌ی صفحه) یک بار داده تازه گرفته می‌شود.
 *  - «polling سبک»: هر intervalMs یک بار، ولی فقط وقتی تب واقعا دیده می‌شود
 *    (پس‌زمینه هیچ درخواستی نمی‌زند).
 *
 * نکته‌ها:
 *  - `refetch` باید «بی‌اسپینر» باشد (فقط داده را جای‌گزین کند، نه اینکه حالت
 *    لودینگ سراسری بگذارد)، وگرنه هر تیک یک پرش اسپینر روی صفحه می‌بینیم.
 *  - اجراها هم‌پوشانی نمی‌کنند: اگر تازه‌سازی قبلی هنوز تمام نشده، تیک بعدی رد می‌شود.
 *  - `enabled=false` یا `paused=true` همه‌چیز را موقتا خاموش می‌کند (مثلا وقتی
 *    هنوز لاگین نشده یا یک ویرایش حساس باز است).
 */
export function useAutoRevalidate(
  refetch: () => void | Promise<void>,
  opts: { intervalMs?: number; enabled?: boolean; paused?: boolean } = {},
) {
  const { intervalMs = 30000, enabled = true, paused = false } = opts

  // آخرین نسخه‌ی callback و فلگ‌ها را در ref نگه می‌داریم تا افکت به‌ازای هر
  // رندر دوباره وصل/قطع نشود (listenerها و interval پایدار می‌مانند).
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch
  const runningRef = useRef(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    if (!enabled) return
    if (typeof document === 'undefined') return

    let cancelled = false
    async function run() {
      if (cancelled || runningRef.current || pausedRef.current) return
      if (document.visibilityState !== 'visible') return
      runningRef.current = true
      try { await refetchRef.current() } catch { /* بی‌صدا؛ تیک بعدی دوباره تلاش می‌کند */ } finally { runningRef.current = false }
    }

    function onFocus() { run() }
    function onVisibility() { if (document.visibilityState === 'visible') run() }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const id = setInterval(run, intervalMs)

    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(id)
    }
  }, [enabled, intervalMs])
}
