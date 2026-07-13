#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Zibal relay installer — Debian/Ubuntu
#
#   sudo bash install-zibal-relay.sh pay.nobatlink.com
#
# Order matters here, and the previous version got it wrong: Caddy can only get
# a TLS certificate once the domain already points at this server. So this
# script checks DNS *first* and waits for it, instead of installing Caddy and
# leaving you with a failed certificate.
#
# It also separates two IPs that are easy to confuse:
#   - inbound / public IP  → the one the DNS A record must point to
#   - outbound / egress IP → the one Zibal must whitelist
# On most VPSes they're identical, but if the provider uses NAT they are not,
# and whitelisting the wrong one is a silent failure you'd only find in prod.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; BOLD=$'\e[1m'; OFF=$'\e[0m'
say()  { echo "${BOLD}── $* ${OFF}"; }
warn() { echo "${YELLOW}!  $*${OFF}"; }
die()  { echo "${RED}✗  $*${OFF}"; exit 1; }
ok()   { echo "${GREEN}✓  $*${OFF}"; }

[ "$EUID" -eq 0 ] || die "Run as root: sudo bash $0 <domain>"
command -v apt-get >/dev/null 2>&1 || die "This script supports Debian/Ubuntu only (apt)."

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  read -rp "Domain for this relay (e.g. pay.nobatlink.com): " DOMAIN
fi
[ -n "$DOMAIN" ] || die "Domain cannot be empty."

# ── Step 1: figure out the two IPs ───────────────────────────────────────────
say "Detecting IPs"
apt-get update -y -qq
apt-get install -y -qq curl dnsutils >/dev/null

OUTBOUND_IP=$(curl -4 -s --max-time 10 https://ifconfig.me || true)
[ -n "$OUTBOUND_IP" ] || die "Could not determine outbound IP (no internet from this server?)"

# The address bound to the interface that owns the default route — this is what
# the outside world connects to, i.e. what the DNS A record needs.
INBOUND_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1 || true)
[ -n "$INBOUND_IP" ] || INBOUND_IP="$OUTBOUND_IP"

# On a NAT'd VPS the bound address is private; then the public inbound address
# is whatever the provider assigned, and we can't detect it reliably.
case "$INBOUND_IP" in
  10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*)
    warn "This server sits behind NAT (local address: $INBOUND_IP)."
    warn "Use the PUBLIC IP from your hosting panel for the DNS A record."
    INBOUND_IP="$OUTBOUND_IP"
    ;;
esac

echo "   Outbound (give this to Zibal): $OUTBOUND_IP"
echo "   Inbound  (point DNS at this):  $INBOUND_IP"
if [ "$OUTBOUND_IP" != "$INBOUND_IP" ]; then
  warn "These differ — do not mix them up."
fi

# ── Step 2: check Zibal is actually reachable from this server ───────────────
say "Checking Zibal is reachable from this server"
ZCODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -X POST https://gateway.zibal.ir/v1/request \
  -H 'Content-Type: application/json' -d '{}' || echo "000")
if [ "$ZCODE" = "000" ]; then
  die "Cannot reach gateway.zibal.ir from this server. Fix networking before continuing — the relay would be useless."
fi
ok "gateway.zibal.ir responded (HTTP $ZCODE) — reachable."

# ── Step 3: DNS must point here BEFORE Caddy runs ────────────────────────────
say "Checking DNS for $DOMAIN"
echo "   Required record:  A   ${DOMAIN%%.*}   →   $INBOUND_IP"
echo "   (On Cloudflare, set the proxy/orange cloud to OFF — otherwise Caddy cannot get a certificate.)"
echo ""

while true; do
  RESOLVED=$(dig +short "$DOMAIN" A | tail -1 || true)
  if [ "$RESOLVED" = "$INBOUND_IP" ]; then
    ok "$DOMAIN resolves to $INBOUND_IP"
    break
  fi
  if [ -z "$RESOLVED" ]; then
    warn "$DOMAIN does not resolve yet."
  else
    warn "$DOMAIN resolves to $RESOLVED, expected $INBOUND_IP."
  fi
  echo ""
  echo "   Add/fix the A record, then press Enter to re-check."
  echo "   (Or type 'skip' to continue anyway — Caddy will keep retrying in the background.)"
  read -rp "   > " ANSWER
  if [ "$ANSWER" = "skip" ]; then
    warn "Continuing without verified DNS. After the record is live, run: systemctl restart caddy"
    break
  fi
done

# ── Step 4: Node ─────────────────────────────────────────────────────────────
say "Installing Node.js 20"
if command -v node >/dev/null 2>&1 && node -e 'process.exit(parseInt(process.versions.node) >= 18 ? 0 : 1)'; then
  ok "Node already present: $(node -v)"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# ── Step 5: relay user + code ────────────────────────────────────────────────
say "Installing relay"
id zibal >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin zibal
mkdir -p /opt/zibal-relay

cat > /opt/zibal-relay/zibal-relay.mjs << 'RELAY_EOF'
// ─────────────────────────────────────────────────────────────────────────────
// Zibal fixed-IP relay — this file does NOT run on Vercel.
//
// Vercel is serverless: its outbound IP changes between invocations, so there
// is no single IP to whitelist in the Zibal panel. This relay runs on a server
// with a fixed IP; that one IP is registered with Zibal, and the Vercel app
// calls Zibal through here. Forwarding the request and returning the response
// is all it does — no payment logic lives in this file.
//
// Security: without RELAY_KEY this would be an open proxy to a payment gateway.
// The x-relay-key header is mandatory and compared in constant time. Paths are
// whitelisted so the relay can't be pointed at arbitrary addresses.
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http'
import crypto from 'node:crypto'

const PORT = parseInt(process.env.PORT || '8080', 10)
const RELAY_KEY = process.env.RELAY_KEY || ''
const ZIBAL = 'https://gateway.zibal.ir/v1'
const ALLOWED = new Set(['/v1/request', '/v1/verify', '/v1/inquiry'])

if (!RELAY_KEY) {
  console.error('RELAY_KEY is not set — refusing to start (would be an open proxy).')
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
  if (!ALLOWED.has(path)) return send(404, { error: 'not found' })
  if (!keyOk(req.headers['x-relay-key'])) return send(401, { error: 'unauthorized' })

  let body = ''
  req.on('data', chunk => {
    body += chunk
    if (body.length > 100_000) req.destroy() // size cap
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
RELAY_EOF

chown -R zibal:zibal /opt/zibal-relay

# ── Step 6: key, kept out of the unit file ───────────────────────────────────
# The old version inlined the key into the systemd unit, which is world-readable
# (0644). Here it lives in a 0600 env file instead.
say "Setting up relay key"
if [ -f /etc/zibal-relay.env ]; then
  RELAY_KEY=$(grep -oP '(?<=^RELAY_KEY=).*' /etc/zibal-relay.env)
  ok "Existing key reused."
else
  RELAY_KEY=$(openssl rand -hex 32)
  printf 'PORT=8080\nRELAY_KEY=%s\n' "$RELAY_KEY" > /etc/zibal-relay.env
  ok "New key generated."
fi
chmod 600 /etc/zibal-relay.env
chown root:root /etc/zibal-relay.env

# ── Step 7: systemd ──────────────────────────────────────────────────────────
say "Creating systemd service"
cat > /etc/systemd/system/zibal-relay.service << 'EOF'
[Unit]
Description=Zibal relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=zibal
WorkingDirectory=/opt/zibal-relay
EnvironmentFile=/etc/zibal-relay.env
ExecStart=/usr/bin/node /opt/zibal-relay/zibal-relay.mjs
Restart=always
RestartSec=3

# hardening — the relay needs nothing but the network
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now zibal-relay
sleep 2
systemctl is-active --quiet zibal-relay \
  || die "Relay failed to start. Check: journalctl -u zibal-relay -n 50"
ok "Relay service active."

curl -sf --max-time 5 http://127.0.0.1:8080/health >/dev/null \
  && ok "Relay answers locally on 127.0.0.1:8080" \
  || die "Relay is running but not answering. Check: journalctl -u zibal-relay -n 50"

# ── Step 8: Caddy (TLS) ──────────────────────────────────────────────────────
say "Installing Caddy (automatic TLS)"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -qq
  apt-get install -y caddy
fi

cat > /etc/caddy/Caddyfile << EOF
$DOMAIN {
    reverse_proxy 127.0.0.1:8080
}
EOF

systemctl restart caddy
ok "Caddy configured for $DOMAIN"

# ── Step 9: firewall ─────────────────────────────────────────────────────────
# 8080 is deliberately NOT opened: the relay binds to 127.0.0.1 and is only
# reachable through Caddy.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  say "Opening firewall ports 80/443"
  ufw allow 80/tcp  >/dev/null
  ufw allow 443/tcp >/dev/null
  ok "ufw updated."
fi

# ── Step 10: end-to-end check ────────────────────────────────────────────────
say "Testing https://$DOMAIN/health"
sleep 5
if curl -sf --max-time 20 "https://$DOMAIN/health" | grep -q '"ok":true'; then
  ok "HTTPS works end to end."
  TLS_OK=yes
else
  warn "Not answering over HTTPS yet."
  warn "Usually this means DNS hasn't propagated, or Cloudflare proxy is on."
  warn "Once DNS is live: systemctl restart caddy   then   curl https://$DOMAIN/health"
  TLS_OK=no
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "${BOLD}  Done${OFF}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "${BOLD}1) Register this IP in the Zibal panel${OFF} (the outbound one):"
echo "   ${GREEN}$OUTBOUND_IP${OFF}"
echo ""
echo "${BOLD}2) Set these in Vercel, then redeploy${OFF}"
echo "   (env changes don't apply until you redeploy):"
echo "   ZIBAL_API_BASE  = https://$DOMAIN/v1"
echo "   ZIBAL_RELAY_KEY = $RELAY_KEY"
echo ""
if [ "$TLS_OK" = "no" ]; then
  echo "${YELLOW}3) HTTPS isn't up yet — fix DNS, then:${OFF}"
  echo "   systemctl restart caddy && curl https://$DOMAIN/health"
  echo ""
fi
echo "Key is stored at /etc/zibal-relay.env (root only)."
echo "Logs:    journalctl -u zibal-relay -f"
echo "Restart: systemctl restart zibal-relay"
echo ""
echo "${BOLD}Then make a real payment three times in a row.${OFF}"
echo "The whole point is that the 2nd and 3rd also succeed — that's what was"
echo "failing before, because the IP changed between attempts."
