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
      },
      fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
    },
  },
  plugins: [],
}
