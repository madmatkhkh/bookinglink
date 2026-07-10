import { MetadataRoute } from 'next'

// robots.txt — پنل‌ها و APIها از ایندکس موتورهای جستجو بیرون می‌مانند؛
// صفحات عمومی متخصص‌ها (ارزش اصلی سئو برای خودشان) ایندکس می‌شوند.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/super', '/login', '/signup'],
    },
  }
}
