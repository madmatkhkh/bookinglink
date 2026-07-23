#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# به‌روزرسانی رله‌ی در حال اجرا — فقط خود فایل رله را عوض می‌کند و سرویس را
# ری‌استارت می‌کند. به DNS، Caddy، کاربر zibal و یونیت systemd دست نمی‌زند.
#
# چرا لازم شد: نسخه‌ی نصب‌شده روی سرور فقط مسیرهای زیبال را می‌شناخت و به هر
# درخواست /sms/v1/* پاسخ 404 می‌داد. اجرای دوباره‌ی نصب‌کننده‌ی کامل برای این
# کار هم سنگین بود هم پرریسک.
#
# اجرا روی سرور رله، با کاربر root:
#   bash update-relay.sh
#
# قبل از جایگزینی از نسخه‌ی فعلی پشتیبان می‌گیرد و اگر سرویس بالا نیامد
# خودکار برمی‌گرداند.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TARGET=/opt/zibal-relay/zibal-relay.mjs
BACKUP="$TARGET.bak.$(date +%s)"

[ -f "$TARGET" ] || { echo "خطا: $TARGET پیدا نشد. رله روی این سرور نصب نیست."; exit 1; }

echo "پشتیبان: $BACKUP"
cp "$TARGET" "$BACKUP"

cat > "$TARGET" << 'RELAY_EOF'
// ─────────────────────────────────────────────────────────────────────────────
// رله‌ی آی‌پی ثابت برای زیبال — این فایل روی Vercel اجرا نمی‌شود.
//
// چرا لازم است: زیبال برای درگاه پرداخت آی‌پی ثابت می‌خواهد، ولی Vercel
// serverless است و آی‌پی خروجی‌اش ثابت نیست — پس هیچ آی‌پی‌ای را نمی‌شود در پنل
// زیبال whitelist کرد. این رله را روی یک سرور با آی‌پی ثابت (هر VPS ارزان
// ایرانی/خارجی) بالا می‌آوری، همان یک آی‌پی را به زیبال می‌دهی، و اپ Vercel
// به‌جای زیبال با این حرف می‌زند. این تنها کاری است که رله می‌کند: عبور دادن
// درخواست به زیبال و برگرداندن پاسخ - هیچ منطق پرداختی این‌جا نیست.
//
// ── راه‌اندازی ───────────────────────────────────────────────────────────────
//   1) این فایل را روی سرور بگذار.
//   2) یک کلید تصادفی بساز:            openssl rand -hex 32
//   3) اجرا:   RELAY_KEY=<همان کلید> PORT=8080 node zibal-relay.mjs
//      (برای ماندگاری: pm2 / systemd)
//   4) پشتش nginx + گواهی TLS بگذار تا با https سرو شود.
//   5) در Vercel این دو env را ست کن:
//        ZIBAL_API_BASE  = https://<دامنه‌ی رله>/v1
//        ZIBAL_RELAY_KEY = <همان کلید>
//   6) آی‌پی همین سرور را در پنل زیبال ثبت کن.
//
// ── نکته‌ی امنیتی ────────────────────────────────────────────────────────────
// بدون RELAY_KEY این می‌شد یک پروکسی باز به درگاه پرداخت. هدر x-relay-key
// اجباری است و مقایسه‌اش timing-safe انجام می‌شود. مسیرها هم whitelist شده‌اند
// (فقط request و verify) تا نشود از این رله برای هر آدرس دلخواهی استفاده کرد.
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http'
import crypto from 'node:crypto'

const PORT = parseInt(process.env.PORT || '8080', 10)
const RELAY_KEY = process.env.RELAY_KEY || ''

// نگاشت مسیر → مقصد. هر مسیری که این‌جا نباشد رد می‌شود؛ یعنی رله فقط همین
// چند endpoint مشخص را می‌شناسد و به پروکسی باز تبدیل نمی‌شود.
//
// sms.ir هم اضافه شد: api.sms.ir هم سرویس ایرانی است و اگر از Vercel در دسترس
// نبود (همان مشکل زیبال)، کافی است SMS_IR_API_BASE در Vercel به همین رله اشاره
// کند. اگر sms.ir از Vercel مستقیم کار می‌کند، این مسیرها بی‌استفاده می‌مانند و
// ضرری ندارند.
const ROUTES = {
  '/v1/request': 'https://gateway.zibal.ir/v1/request',
  '/v1/verify':  'https://gateway.zibal.ir/v1/verify',
  '/v1/inquiry': 'https://gateway.zibal.ir/v1/inquiry',
  '/sms/v1/send/verify': 'https://api.sms.ir/v1/send/verify',
  '/sms/v1/send/bulk':   'https://api.sms.ir/v1/send/bulk',
}

// هدرهایی که باید به مقصد پاس شوند. x-api-key برای sms.ir لازم است (زیبال کلیدش
// را داخل بدنه می‌فرستد). x-relay-key عمدا پاس داده نمی‌شود — آن مال خود رله است.
const PASS_HEADERS = ['x-api-key', 'accept']

if (!RELAY_KEY) {
  console.error('RELAY_KEY تنظیم نشده — رله بدون آن بالا نمی‌آید (وگرنه پروکسی باز می‌شد).')
  process.exit(1)
}

// مقایسه‌ی timing-safe — با === می‌شد کلید را کاراکتربه‌کاراکتر حدس زد
function keyOk(given) {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(RELAY_KEY)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(obj))
  }

  if (req.url === '/health') return send(200, { ok: true })
  if (req.method !== 'POST') return send(405, { error: 'method not allowed' })

  const path = (req.url || '').split('?')[0]
  const target = ROUTES[path]
  if (!target) return send(404, { error: 'not found' })
  if (!keyOk(req.headers['x-relay-key'])) return send(401, { error: 'unauthorized' })

  let body = ''
  req.on('data', chunk => {
    body += chunk
    if (body.length > 100_000) req.destroy() // سقف حجم — جلوگیری از تغذیه‌ی بی‌پایان
  })
  req.on('end', async () => {
    try {
      const headers = { 'Content-Type': 'application/json' }
      for (const h of PASS_HEADERS) {
        if (req.headers[h]) headers[h] = req.headers[h]
      }
      const upstream = await fetch(target, { method: 'POST', headers, body })
      const text = await upstream.text()
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
      res.end(text)
    } catch (e) {
      console.error('relay error:', e)
      send(502, { error: 'upstream failed' })
    }
  })
}).listen(PORT, '127.0.0.1', () => console.log(`zibal relay listening on 127.0.0.1:${PORT}`))
RELAY_EOF

chown zibal:zibal "$TARGET" 2>/dev/null || true
node --check "$TARGET" || { echo "فایل تازه نحوش خراب است — برگرداندن پشتیبان"; cp "$BACKUP" "$TARGET"; exit 1; }

systemctl restart zibal-relay
sleep 2

if systemctl is-active --quiet zibal-relay; then
  echo "سرویس بالا آمد."
  echo "تست سلامت:"
  curl -s -o /dev/null -w "  /health → HTTP %{http_code}\n" http://127.0.0.1:8080/health || true
  echo
  echo "تست مسیر پیامک (401 یعنی مسیر شناخته شد و فقط کلید لازم است — همین کافی است):"
  curl -s -o /dev/null -w "  /sms/v1/send/verify → HTTP %{http_code}\n" \
    -X POST -H 'Content-Type: application/json' -d '{}' \
    http://127.0.0.1:8080/sms/v1/send/verify || true
  echo
  echo "اگر بالا 404 دیدی یعنی به‌روزرسانی نگرفته؛ 401 یعنی درست است."
else
  echo "سرویس بالا نیامد — برگرداندن پشتیبان"
  cp "$BACKUP" "$TARGET"
  systemctl restart zibal-relay
  journalctl -u zibal-relay -n 30 --no-pager
  exit 1
fi
