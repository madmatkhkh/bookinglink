import type { SWRConfiguration } from 'swr'

// خطای fetch با کد وضعیت — تا مصرف‌کننده بتواند 401 را از بقیه جدا کند
export class FetchError extends Error {
  status: number
  constructor(status: number, message?: string) {
    super(message || `HTTP ${status}`)
    this.status = status
    this.name = 'FetchError'
  }
}

// fetcher مشترک SWR — JSON برمی‌گرداند و روی وضعیت غیر-OK خطای دارای status می‌اندازد.
// همان `cache: 'no-store'` قبلی تا داده‌ی کش‌شده‌ی مرورگر قاطی نشود؛ کش را خود SWR می‌گرداند.
export async function swrFetcher(url: string) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new FetchError(res.status)
  return res.json()
}

// تنظیمات «سطح زنده»: همان رفتار هوک دستی قبلی، ولی بومی SWR.
//  - revalidateOnFocus (پیش‌فرض SWR روشن است): برگشت به تب → تازه‌سازی.
//  - refreshInterval: polling سبک؛ SWR به‌صورت پیش‌فرض وقتی تب پنهان است poll نمی‌کند
//    (refreshWhenHidden=false)، پس دقیقا «فقط وقتی دیده می‌شود».
//  - dedupingInterval: درخواست‌های هم‌کلید در این بازه یکی می‌شوند (کمتر شدن بار).
//  - keepPreviousData: هنگام تغییر کلید، داده‌ی قبلی نگه داشته می‌شود تا پرش/خالی‌شدن نبینیم.
//  - revalidateOnFocus اضافه لازم نیست؛ 401 را مصرف‌کننده از error.status می‌فهمد.
export const LIVE_SWR_OPTIONS: SWRConfiguration = {
  refreshInterval: 30000,
  dedupingInterval: 5000,
  revalidateOnReconnect: true,
  keepPreviousData: true,
  shouldRetryOnError: false,
}
