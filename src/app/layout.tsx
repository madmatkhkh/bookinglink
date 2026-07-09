import './globals.css'
import type { Metadata } from 'next'

// metadataBase از دامنه‌ی پلتفرم — لینک‌های og/twitter مطلق می‌شوند
const domain = process.env.PLATFORM_DOMAIN || 'nobatlink.ir'

export const metadata: Metadata = {
  metadataBase: new URL(`https://${domain}`),
  title: 'نوبت‌لینک — رزرو نوبت آنلاین',
  description: 'صفحه‌ی نوبت‌دهیِ اختصاصی و برندشده برای متخصص‌ها و کسب‌وکارهای خدماتی',
  openGraph: {
    title: 'نوبت‌لینک — رزرو نوبت آنلاین',
    description: 'صفحه‌ی نوبت‌دهیِ اختصاصی و برندشده برای متخصص‌ها و کسب‌وکارهای خدماتی',
    type: 'website',
    locale: 'fa_IR',
    siteName: 'نوبت‌لینک',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        {/* فونت‌ها self-host اند (public/fonts + @font-face در globals.css) —
            preload تا متنِ فارسی بدونِ FOUT بالا بیاید. هیچ CDN خارجی در کار نیست. */}
        <link rel="preload" href="/fonts/Vazirmatn.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Estedad.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
