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
const ZIBAL = 'https://gateway.zibal.ir/v1'
const ALLOWED = new Set(['/v1/request', '/v1/verify', '/v1/inquiry'])

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
  if (!ALLOWED.has(path)) return send(404, { error: 'not found' })
  if (!keyOk(req.headers['x-relay-key'])) return send(401, { error: 'unauthorized' })

  let body = ''
  req.on('data', chunk => {
    body += chunk
    if (body.length > 100_000) req.destroy() // سقف حجم — جلوگیری از تغذیه‌ی بی‌پایان
  })
  req.on('end', async () => {
    try {
      const upstream = await fetch(`${ZIBAL}${path.slice(3)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      const text = await upstream.text()
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' })
      res.end(text)
    } catch (e) {
      console.error('relay error:', e)
      send(502, { error: 'upstream failed' })
    }
  })
}).listen(PORT, '127.0.0.1', () => console.log(`zibal relay listening on 127.0.0.1:${PORT}`))
