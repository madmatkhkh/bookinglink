import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'رزرو نوبت آنلاین',
  description: 'صفحه‌ی نوبت‌دهی اختصاصی',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" />
      </head>
      <body>{children}</body>
    </html>
  )
}
