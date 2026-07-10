import './globals.css'
import type { Metadata, Viewport } from 'next'

// metadataBase از دامنه‌ی پلتفرم — لینک‌های og/twitter مطلق می‌شوند
const domain = process.env.PLATFORM_DOMAIN || 'nobatlink.com'

// این export قبلا اصلا وجود نداشت — بدونش مرورگر موبایل صفحه را با عرض دسکتاپ
// (حدود 980px) رندر و بعد کوچک می‌کند تا جا شود؛ یعنی همه‌چیز ریز و برای لمس
// سخت می‌شود، همون مشکلی که گزارش شد. width=device-width یعنی صفحه واقعا با
// عرض خود گوشی رندر شود.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL(`https://${domain}`),
  title: 'نوبت‌لینک — رزرو نوبت آنلاین',
  description: 'صفحه‌ی نوبت‌دهی اختصاصی و برندشده برای متخصص‌ها و کسب‌وکارهای خدماتی',
  openGraph: {
    title: 'نوبت‌لینک — رزرو نوبت آنلاین',
    description: 'صفحه‌ی نوبت‌دهی اختصاصی و برندشده برای متخصص‌ها و کسب‌وکارهای خدماتی',
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
            preload تا متن فارسی بدون FOUT بالا بیاید. هیچ CDN خارجی در کار نیست. */}
        <link rel="preload" href="/fonts/Vazirmatn.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Estedad.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
