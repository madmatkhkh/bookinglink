/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF8F5',
        sand: '#EDE7DE',
        ink: '#26211C',
        soot: '#6E655B',
        // رنگِ برندِ tenant — در layout هر صفحه از theme_color تزریق می‌شود
        accent: 'rgb(var(--brand) / <alpha-value>)',
        // پالتِ ثابتِ brand — پنلِ روانشناسی (منتقل‌شده از psych-booking) از این
        // سایه‌ها (brand-50 … brand-900) استفاده می‌کند.
        brand: {
          50:  '#EAF3DE',
          100: '#C0DD97',
          200: '#97C459',
          400: '#639922',
          600: '#3B6D11',
          800: '#27500A',
          900: '#173404',
        },
      },
      fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
    },
  },
  plugins: [],
}
