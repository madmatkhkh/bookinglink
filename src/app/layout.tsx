import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'نوبت‌لینک — رزرو نوبت آنلاین',
  description: 'صفحه‌ی نوبت‌دهیِ اختصاصی و برندشده برای متخصص‌ها و کسب‌وکارهای خدماتی',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        {/* بدنه — Vazirmatn */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" />
        {/* تیترها — Estedad از طریقِ @font-face در globals.css بارگذاری می‌شود.
            preconnect برای سرعتِ لود. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
      </head>
      <body>{children}</body>
    </html>
  )
}
