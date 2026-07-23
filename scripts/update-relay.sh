#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Update the running relay in place.
#
# Replaces /opt/zibal-relay/zibal-relay.mjs and restarts the service. It does
# NOT touch DNS, Caddy, the zibal user, or the systemd unit - so it is safe to
# run on a working server.
#
# Why this exists: the deployed relay only knew the Zibal paths and answered
# 404 to every /sms/v1/* request. Re-running the full installer just to add two
# routes would have been heavy and risky.
#
# Usage, as root on the relay server:
#   bash update-relay.sh
#
# It backs up the current file first and rolls back automatically if the
# service fails to come up.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TARGET=/opt/zibal-relay/zibal-relay.mjs
BACKUP="$TARGET.bak.$(date +%s)"
PORT="${PORT:-8080}"

if [ ! -f "$TARGET" ]; then
  echo "ERROR: $TARGET not found. The relay is not installed on this server."
  exit 1
fi

echo "==> Backing up current relay to: $BACKUP"
cp "$TARGET" "$BACKUP"

echo "==> Writing new relay"
cat > "$TARGET" << 'RELAY_EOF'
// ─────────────────────────────────────────────────────────────────────────────
// Fixed-IP relay for Zibal and sms.ir. This file does NOT run on Vercel.
//
// Everything here runs on a Linux server and its output goes to journalctl,
// so this file is intentionally English-only. Persian text renders as garbage
// in most SSH terminals.
//
// Why it exists: Zibal requires a fixed IP for the payment gateway, but Vercel
// is serverless and its outbound IP changes between invocations, so there is no
// single IP to whitelist. This relay runs on a server with a fixed IP; that one
// IP is registered with Zibal, and the Vercel app talks to this instead.
// Forwarding the request and returning the response is all it does - no payment
// logic lives here.
//
// ── Setup ───────────────────────────────────────────────────────────────────
//   1) Put this file on the server.
//   2) Generate a key:   openssl rand -hex 32
//   3) Run:              RELAY_KEY=<key> PORT=8080 node zibal-relay.mjs
//      (use systemd for persistence - see install-zibal-relay.sh)
//   4) Put nginx/Caddy + TLS in front of it so it is served over https.
//   5) Set these in Vercel:
//        ZIBAL_API_BASE   = https://<relay-domain>/v1
//        SMS_IR_API_BASE  = https://<relay-domain>/sms/v1
//        ZIBAL_RELAY_KEY  = <same key>
//   6) Register this server's IP in the Zibal panel (and sms.ir, which also
//      recommends restricting API access to a fixed IP).
//
// ── Security ────────────────────────────────────────────────────────────────
// Without RELAY_KEY this would be an open proxy to a payment gateway. The
// x-relay-key header is mandatory and compared in constant time. Paths are
// whitelisted so the relay cannot be pointed at arbitrary addresses.
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http'
import crypto from 'node:crypto'

const PORT = parseInt(process.env.PORT || '8080', 10)
const RELAY_KEY = process.env.RELAY_KEY || ''

// Path -> upstream. Anything not listed here is rejected, so the relay only
// ever knows these specific endpoints and cannot become an open proxy.
//
// sms.ir is included for the same reason as Zibal: it is an Iranian service
// that may be unreachable from Vercel, and sms.ir also recommends restricting
// API access to a fixed IP. Point SMS_IR_API_BASE at /sms/v1 on this relay.
const ROUTES = {
  '/v1/request': 'https://gateway.zibal.ir/v1/request',
  '/v1/verify':  'https://gateway.zibal.ir/v1/verify',
  '/v1/inquiry': 'https://gateway.zibal.ir/v1/inquiry',
  '/sms/v1/send/verify': 'https://api.sms.ir/v1/send/verify',
  '/sms/v1/send/bulk':   'https://api.sms.ir/v1/send/bulk',
}

// Headers forwarded upstream. x-api-key is required by sms.ir (Zibal sends its
// key inside the body instead). x-relay-key is deliberately NOT forwarded -
// that one belongs to the relay itself and must not leak to third parties.
const PASS_HEADERS = ['x-api-key', 'accept']

if (!RELAY_KEY) {
  console.error('RELAY_KEY is not set - refusing to start (would be an open proxy).')
  process.exit(1)
}

// Constant-time compare: a plain === leaks the key one character at a time
// through response timing.
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
    if (body.length > 100_000) req.destroy() // size cap - avoid unbounded feed
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
}).listen(PORT, '127.0.0.1', () => console.log(`relay listening on 127.0.0.1:${PORT}`))
RELAY_EOF

chown zibal:zibal "$TARGET" 2>/dev/null || true

echo "==> Checking syntax"
if ! node --check "$TARGET"; then
  echo "ERROR: new file has a syntax error. Restoring backup."
  cp "$BACKUP" "$TARGET"
  exit 1
fi

echo "==> Restarting service"
systemctl restart zibal-relay
sleep 2

if ! systemctl is-active --quiet zibal-relay; then
  echo "ERROR: service did not come up. Restoring backup."
  cp "$BACKUP" "$TARGET"
  systemctl restart zibal-relay
  echo "--- last 30 log lines ---"
  journalctl -u zibal-relay -n 30 --no-pager
  exit 1
fi

echo "==> Service is active"
echo
echo "--- Self test ---"

health=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/health" || echo "000")
echo "  /health              -> HTTP $health   (expect 200)"

sms=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d '{}' \
  "http://127.0.0.1:$PORT/sms/v1/send/verify" || echo "000")
echo "  /sms/v1/send/verify  -> HTTP $sms   (expect 401)"

zibal=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' -d '{}' \
  "http://127.0.0.1:$PORT/v1/request" || echo "000")
echo "  /v1/request          -> HTTP $zibal   (expect 401)"

echo
if [ "$sms" = "401" ] && [ "$zibal" = "401" ] && [ "$health" = "200" ]; then
  echo "OK - SMS route is live. 401 is correct here: the path was recognised"
  echo "     and only the relay key is missing, which the app sends."
  echo
  echo "Next: set SMS_IR_API_BASE in Vercel to  https://<relay-domain>/sms/v1"
  echo "      (note /sms/v1, not /v1), then redeploy and send a test OTP."
else
  echo "PROBLEM:"
  [ "$health" != "200" ] && echo "  - /health is not 200; the service may not be listening on port $PORT."
  [ "$sms"  = "404" ]    && echo "  - /sms/v1/send/verify returned 404; the update did not take effect."
  [ "$zibal" = "404" ]   && echo "  - /v1/request returned 404; Zibal routes are missing too - restore the backup."
  echo
  echo "  Backup kept at: $BACKUP"
  echo "  Restore with:   cp $BACKUP $TARGET && systemctl restart zibal-relay"
  exit 1
fi
