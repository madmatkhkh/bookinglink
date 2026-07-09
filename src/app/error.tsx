'use client'
// صفحه‌ی خطای برندشده — به‌جای صفحه‌ی پیش‌فرضِ انگلیسیِ Next.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-paper text-ink flex items-center justify-center px-6" dir="rtl">
      <div className="text-center max-w-sm">
        <h1 className="font-display font-extrabold text-xl tracking-tightest">مشکلی پیش آمد</h1>
        <p className="text-sm text-soot mt-2 leading-6">
          خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید؛ اگر مشکل ادامه داشت چند دقیقه‌ی دیگر برگردید.
        </p>
        <button onClick={reset} className="mt-6 text-sm font-semibold text-white bg-ink px-5 py-2.5 rounded-lg hover:opacity-90">
          تلاشِ دوباره
        </button>
      </div>
    </main>
  )
}
