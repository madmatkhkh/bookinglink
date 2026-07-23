#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// نگهبان همگامی رله — کد رله در سه جا تکرار شده و باید یکی بماند:
//   1) scripts/zibal-relay.mjs            ← منبع حقیقت
//   2) scripts/install-zibal-relay.sh     ← نصب روی سرور تازه
//   3) scripts/update-relay.sh            ← به‌روزرسانی سرور موجود
//
// چرا لازم شد: نسخه‌ی 1 مسیرهای /sms/v1/* را داشت ولی نسخه‌ی 2 (تنها نسخه‌ای که
// واقعا روی سرور اجرا می‌شود) نداشت. نتیجه: هر پیامک از مسیر رله HTTP 404
// می‌گرفت، در حالی که خواندن فایل ریپو نشان می‌داد همه‌چیز درست است.
//
// اجرا: node scripts/check-relay-sync.mjs   (یا npm run check:relay)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(resolve(ROOT, 'scripts/zibal-relay.mjs'), 'utf8').trim()

function embedded(file) {
  const t = readFileSync(resolve(ROOT, file), 'utf8')
  const m = t.match(/<< 'RELAY_EOF'\n([\s\S]*?)\nRELAY_EOF/)
  return m ? m[1].trim() : null
}

let bad = 0
for (const f of ['scripts/install-zibal-relay.sh', 'scripts/update-relay.sh']) {
  const e = embedded(f)
  if (e === null) { console.log(`✗ ${f}: بلوک RELAY_EOF پیدا نشد`); bad++; continue }
  if (e !== source) {
    console.log(`✗ ${f}: با scripts/zibal-relay.mjs یکی نیست`)
    bad++
  } else {
    console.log(`✓ ${f}`)
  }
}

// چک معنایی: مسیرهای پیامک واقعا در منبع هستند؟
for (const need of ['/sms/v1/send/verify', '/sms/v1/send/bulk', "'x-api-key'"]) {
  if (!source.includes(need)) { console.log(`✗ منبع رله فاقد ${need} است`); bad++ }
}

if (bad) {
  console.log('\nناهمگام. بعد از تغییر scripts/zibal-relay.mjs باید هر دو اسکریپت بازتولید شوند.')
  process.exit(1)
}
console.log('\nهر سه نسخه‌ی رله یکی هستند.')
