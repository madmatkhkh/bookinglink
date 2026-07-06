/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── پالتِ مونوکروم (جایگزینِ پالتِ گرمِ کاغذی) ─────────────────
        // نام‌ها همان قبلی‌اند تا همه‌ی className‌های موجود بدونِ تغییر
        // مونوکروم شوند: bg-paper / border-sand / text-ink / text-soot …
        paper: '#FFFFFF',   // زمینه‌ی صفحه (بود #FAF8F5)
        sand:  '#ECECEC',   // بوردر و زمینه‌ی خیلی روشن (بود #EDE7DE)
        ink:   '#0A0A0A',   // متن و دکمه‌ی اصلی (بود #26211C)
        soot:  '#737373',   // متنِ کم‌رنگ (بود #6E655B)
        // رنگِ برندِ tenant — همچنان از theme_color تزریق می‌شود؛ پیش‌فرضش در
        // globals.css به خاکستریِ تیره ست شده تا صفحاتِ بی‌برند هم مونوکروم بمانند.
        accent: 'rgb(var(--brand) / <alpha-value>)',
        // پالتِ خاکستریِ برند (جایگزینِ سبز) — پنلِ روانشناسی از brand-50…900
        // استفاده می‌کند؛ حالا سایه‌های خنثیِ مشکی/خاکستری.
        brand: {
          50:  '#F5F5F5',
          100: '#E5E5E5',
          200: '#D4D4D4',
          400: '#A3A3A3',
          600: '#525252',
          800: '#262626',
          900: '#0A0A0A',
        },
      },
      fontFamily: {
        // بدنه — خوانا در سایزهای کوچک
        sans: ['Vazirmatn', 'system-ui', 'sans-serif'],
        // تیترها — هندسی و فشرده (YekanBakh-مانند)
        display: ['Estedad', 'Vazirmatn', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.03em', // برای تیترهای بزرگِ فارسی
      },
    },
  },
  plugins: [],
}
