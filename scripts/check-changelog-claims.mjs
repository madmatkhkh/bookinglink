#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// چک ادعاهای چنج‌لاگ — آیا فایل‌هایی که CLAUDE.md می‌گوید ساخته شده‌اند
// واقعا روی دیسک هستند؟
//
// چرا لازم شد: در ممیزی 1405/05/01 چهار ادعای «ساخته شد» پیدا شد که هیچ‌کدام
// در کد وجود نداشتند (cron/subscriptions، panel/psy/invoices، قلاب
// SMS_IR_API_BASE، و تابع smsPost). هر چهار مورد در سندی ادعا شده بودند که
// خودش برای جلوگیری از همین اتفاق نوشته شده بود.
//
// اجرا:  node scripts/check-changelog-claims.mjs
// خروجی: کد 1 اگر مسیر گم‌شده‌ای پیدا شود (قابل استفاده در CI).
//
// ⚠️ حد این ابزار: فقط ادعاهای «فایل» را چک می‌کند. ادعایی مثل «این تابع را
//    اصلاح کردم» یا «این باگ رفع شد» را نمی‌تواند بررسی کند — برای آن‌ها
//    همچنان باید کد را خواند.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = resolve(ROOT, 'CLAUDE.md')

// مسیرهایی که عمدا دیگر وجود ندارند (حذف‌شده یا در فایل یکپارچه ادغام شده‌اند).
// اضافه‌کردن به این لیست یعنی «می‌دانم نیست و درست است».
const KNOWN_GONE = [
  'migrations/',            // در schema.sql یکپارچه ادغام شد
  'supabase-schema.sql',    // نام قدیمی schema.sql
  'scripts/migrate.mjs',    // runner عمدا حذف شد
  'MIGRATIONS.md',          // بعدا دوباره ساخته شد؛ مسیرهای قدیمی مهم نیستند
  'src/app/opengraph-image.tsx',
  'src/app/og/',
  'psych-booking',          // ریپوی مرجع، نه این ریپو
  'APPLY-DELETIONS.sh',
]

// فایل‌های مهاجرت شماره‌دار (0045_plan_fees.sql و مشابه) عمدا در schema.sql
// یکپارچه ادغام شده‌اند و پوشه‌شان از ریپو حذف شده — گم‌شدنشان طبیعی است.
const MERGED_MIGRATION = /^\d{4}_[\w-]+\.sql$/

// چیزی شبیه مسیر فایل پروژه به نظر می‌رسد؟
const LOOKS_LIKE_PATH = /^(src\/|scripts\/|public\/|migrations\/)?[\w.\[\]-]+(\/[\w.\[\]-]+)*\.(ts|tsx|sql|mjs|js|css|json|md|sh|svg)$/

// آیا فایلی وجود دارد که مسیرش به این رشته ختم شود؟
let ALL = null
function allFiles() {
  if (ALL) return ALL
  ALL = []
  const walk = d => {
    for (const n of readdirSync(d)) {
      if (['node_modules', '.git', '.next'].includes(n)) continue
      const p = resolve(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else ALL.push(p.slice(ROOT.length + 1).replace(/\\/g, '/'))
    }
  }
  walk(ROOT)
  return ALL
}
function findBySuffix(tok) {
  return allFiles().some(f => f === tok || f.endsWith('/' + tok))
}

const text = readFileSync(DOC, 'utf8')
const lines = text.split('\n')

// فقط خطوطی که واقعا فهرست فایل تحویلی‌اند: «فایل‌ها: ...» / «فایل: ...» /
// «فایل تغییرکرده...: ...» — نه هر جمله‌ای که اتفاقی اسم فایل دارد.
const FILE_LINE = /^(فایل|فایل‌ها|فایل‌های تغییرکرده|فایل تغییرکرده‌ی این جلسه|فایل‌های تغییرکرده‌ی این جلسه)[^:]*:/

const missing = []
let claimLines = 0, checked = 0

lines.forEach((line, i) => {
  if (!FILE_LINE.test(line.trim())) return
  claimLines++
  const after = line.slice(line.indexOf(':') + 1)
  // جداکننده‌ها: ویرگول فارسی/لاتین، «و»، بولت
  for (let tok of after.split(/[،,]|\s+و\s+/)) {
    tok = tok.trim()
      .replace(/`/g, '')
      .replace(/\*\*/g, '')
      .replace(/\(.*?\)/g, '')       // «(جدید)» و مشابهش
      .replace(/[.،؛:]+$/, '')
      .trim()
    if (!tok || !LOOKS_LIKE_PATH.test(tok)) continue
    if (KNOWN_GONE.some(k => tok.startsWith(k) || tok.includes(k))) continue
    if (MERGED_MIGRATION.test(tok)) continue
    checked++
    // مسیرهای نسبی چنج‌لاگ گاهی کوتاه‌اند (مثلا «FinanceTab.tsx» یا
    // «pay-online/route.ts») — پس اگر مسیر مستقیم نبود، دنبال پسوندش می‌گردیم.
    if (existsSync(resolve(ROOT, tok))) continue
    if (existsSync(resolve(ROOT, 'src', tok))) continue
    if (findBySuffix(tok)) continue
    missing.push({ line: i + 1, path: tok })
  }
})

console.log(`خطوط فهرست فایل در CLAUDE.md : ${claimLines}`)
console.log(`مسیرهای بررسی‌شده             : ${checked}`)

if (!missing.length) {
  console.log('\nنتیجه: هیچ مسیر گم‌شده‌ای پیدا نشد.')
  process.exit(0)
}

console.log(`\nمسیرهایی که ادعا شده‌اند ولی روی دیسک نیستند (${missing.length}):\n`)
for (const m of missing) console.log(`  CLAUDE.md:${m.line}  →  ${m.path}`)
console.log('\nهر کدام یا واقعا ساخته نشده، یا اسمش عوض شده، یا عمدا حذف شده.')
console.log('اگر عمدی است، به KNOWN_GONE در همین اسکریپت اضافه‌اش کن.')
process.exit(1)
