#!/bin/bash
# اجرا از ریشه‌ی ریپو: فایل‌های حذف‌شده‌ی og را پاک می‌کند.
# (فایل‌های تغییریافته را از زیپ کپی کن؛ این اسکریپت فقط حذف‌ها را انجام می‌دهد.)
set -e
rm -f src/app/opengraph-image.tsx
rm -f "src/app/[slug]/opengraph-image.tsx"
rm -rf src/app/og
echo "✓ فایل‌های og حذف شدند. حالا npm install (برای حذف sharp) و بعد دیپلوی کن."
