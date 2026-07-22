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

// موقعیت‌یابی برند (مهم برای سئو): نوبت‌لینک «پلتفرم مدیریت کسب‌وکار و رزرو
// نوبت آنلاین» است، نه یک ابزار ساده‌ی نوبت‌دهی. عنوان و توضیحات باید همین را
// بگویند چون گوگل دقیقا همین‌ها را در نتیجه نشان می‌دهد.
const SITE_TITLE = 'نوبت‌لینک | پلتفرم مدیریت کسب‌وکار و رزرو نوبت آنلاین'
const SITE_DESC = 'نوبت‌لینک پلتفرم جامع مدیریت کسب‌وکارهای خدماتی است: رزرو نوبت آنلاین، پرداخت و تسویه‌ی خودکار، پرونده‌ی مشتریان، گزارش مالی، مدیریت تیم و یادآوری پیامکی — همه از یک داشبورد.'

export const metadata: Metadata = {
  metadataBase: new URL(`https://${domain}`),
  title: {
    default: SITE_TITLE,
    template: '%s | نوبت‌لینک',
  },
  description: SITE_DESC,
  applicationName: 'نوبت‌لینک',
  keywords: [
    'مدیریت کسب و کار', 'نرم افزار مدیریت کسب و کار', 'پلتفرم مدیریت نوبت',
    'رزرو نوبت آنلاین', 'نوبت دهی آنلاین', 'سیستم نوبت دهی',
    'مدیریت مشتریان', 'پرداخت آنلاین', 'گزارش مالی', 'نرم افزار کلینیک',
    'نوبت‌لینک', 'nobatlink',
  ],
  authors: [{ name: 'نوبت‌لینک' }],
  creator: 'نوبت‌لینک',
  publisher: 'نوبت‌لینک',
  alternates: { canonical: '/' },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESC,
    type: 'website',
    locale: 'fa_IR',
    siteName: 'نوبت‌لینک',
    url: `https://${domain}`,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESC,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // ── داده‌ی ساختاریافته (JSON-LD) ──────────────────────────────────────────
  // چرا لازم است: بدون این، گوگل «نوبت‌لینک» را نمی‌شناسد و در AI Overview با
  // سرویس‌های مشابه (مثل نوبت‌دهی‌های پزشکی دیگر) اشتباه می‌گیرد. این اسکیما
  // هویت برند و «دسته‌ی محصول» را صریح می‌کند: نرم‌افزار مدیریت کسب‌وکار
  // (BusinessApplication) نه صرفا رزرو نوبت.
  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `https://${domain}/#organization`,
    name: 'نوبت‌لینک',
    alternateName: ['Nobatlink', 'نوبت لینک'],
    url: `https://${domain}`,
    logo: `https://${domain}/icon-512.png`,
    description: SITE_DESC,
    slogan: 'کل کسب‌وکارتان، در یک نقطه',
    areaServed: { '@type': 'Country', name: 'Iran' },
    knowsLanguage: 'fa-IR',
  }
  const appLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'نوبت‌لینک',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'مدیریت کسب‌وکار و رزرو نوبت آنلاین',
    operatingSystem: 'Web',
    url: `https://${domain}`,
    inLanguage: 'fa-IR',
    description: SITE_DESC,
    publisher: { '@id': `https://${domain}/#organization` },
    featureList: [
      'رزرو نوبت آنلاین با صفحه‌ی اختصاصی برندشده',
      'پرداخت آنلاین و تسویه‌ی خودکار',
      'پرونده و سوابق مشتریان',
      'گزارش مالی و آمار کسب‌وکار',
      'مدیریت تیم و چند پرسنل',
      'یادآوری خودکار پیامکی',
      'لیست انتظار و کدهای تخفیف',
    ],
  }
  const siteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'نوبت‌لینک',
    url: `https://${domain}`,
    inLanguage: 'fa-IR',
    publisher: { '@id': `https://${domain}/#organization` },
  }

  return (
    <html lang="fa" dir="rtl">
      <head>
        {/* فونت‌ها self-host اند (public/fonts + @font-face در globals.css) —
            preload تا متن فارسی بدون FOUT بالا بیاید. هیچ CDN خارجی در کار نیست. */}
        <link rel="preload" href="/fonts/Vazirmatn.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Estedad.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([orgLd, appLd, siteLd]) }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
