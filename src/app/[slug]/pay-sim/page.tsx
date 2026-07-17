'use client'
// صفحه‌ی شبیه‌سازی پرداخت — وقتی نمایش داده می‌شود که pay-online کاربر را به
// این‌جا فرستاده باشد (یعنی یا فلگ سراسری تست روشن است یا مجموعه تستی است).
// دکمه‌ها کاربر را به همان callback واقعی می‌فرستند؛ مرز امنیتی واقعی خود
// callback است که فقط intent با authority تستی را — و فقط وقتی مجاز باشد —
// نهایی می‌کند. پس این صفحه به‌خودی‌خود خطری ندارد.
import { useSearchParams, useParams } from 'next/navigation'
import { Suspense } from 'react'

function PaySimInner() {
  const params = useParams<{ slug: string }>()
  const sp = useSearchParams()
  const intent = sp.get('intent') || ''
  const amount = sp.get('amount') || ''

  const callback = (success: boolean) =>
    `/api/t/${params.slug}/psy/pay-online/callback?intent=${intent}&trackId=TEST-${intent}&success=${success ? '1' : '0'}`

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-sand p-6 text-center">
        <div className="inline-block text-[11px] px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 mb-4">حالت تست — پرداخت واقعی نیست</div>
        <div className="w-16 h-16 rounded-full bg-sand flex items-center justify-center mx-auto mb-4 text-3xl">🧪</div>
        <h1 className="text-base font-medium text-ink mb-1">شبیه‌سازی درگاه پرداخت</h1>
        <p className="text-sm text-soot mb-1">مبلغ قابل پرداخت</p>
        <p className="text-2xl font-bold text-ink mb-6 tnum">{Number(amount || 0).toLocaleString('en-US')} تومان</p>

        <a href={callback(true)}
          className="block w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium mb-2 hover:bg-emerald-700">
          پرداخت موفق ✓
        </a>
        <a href={callback(false)}
          className="block w-full py-3 border border-sand text-soot rounded-xl text-sm font-medium hover:bg-gray-50">
          لغو / پرداخت ناموفق
        </a>
        <p className="text-[11px] text-soot mt-4">این صفحه فقط در محیط تست دیده می‌شود. روی محیط واقعی، درگاه زیبال باز می‌شود.</p>
      </div>
    </div>
  )
}

export default function PaySimPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <PaySimInner />
    </Suspense>
  )
}
