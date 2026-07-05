// ─────────────────────────────────────────────────────────────────────────────
// درگاهِ پرداختِ آنلاین — زیبال (به‌جایِ زرین‌پال، طبقِ نظرِ خودت — پرداختی و
// پشتیبانیِ بهتر). برای فعال‌شدنِ واقعی باید ZIBAL_MERCHANT_ID به env اضافه شود.
// برای تستِ بدونِ حسابِ واقعی: ZIBAL_SANDBOX=true (از merchant تستیِ خودِ زیبال
// استفاده می‌کند، نیازی به مرچنتِ واقعی نیست).
// ─────────────────────────────────────────────────────────────────────────────

const REAL_MERCHANT = process.env.ZIBAL_MERCHANT_ID || ''
const SANDBOX = process.env.ZIBAL_SANDBOX === 'true'
const MERCHANT = REAL_MERCHANT || (SANDBOX ? 'zibal' : '')  // 'zibal' = مرچنتِ تستیِ رسمیِ خودِ زیبال

const API_BASE = 'https://gateway.zibal.ir/v1'
const STARTPAY_BASE = 'https://gateway.zibal.ir/start'

export type ZibalRequestResult = { ok: true; trackId: number; url: string } | { ok: false; error: string }
export type ZibalVerifyResult = { ok: true; refNumber: string | number } | { ok: false; error: string }

// مبلغ‌ها همه‌جای این پروژه تومان است؛ زیبال ریال می‌گیرد (× ۱۰)
export async function requestZibalPayment(
  amountToman: number, description: string, callbackUrl: string, mobile?: string
): Promise<ZibalRequestResult> {
  if (!MERCHANT) return { ok: false, error: 'درگاهِ پرداختِ آنلاین هنوز تنظیم نشده (ZIBAL_MERCHANT_ID)' }
  try {
    const res = await fetch(`${API_BASE}/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant: MERCHANT,
        amount: Math.round(amountToman * 10),
        callbackUrl,
        description,
        ...(mobile ? { mobile } : {}),
      }),
    })
    const data = await res.json()
    if (data?.result === 100 && data?.trackId) {
      return { ok: true, trackId: data.trackId, url: `${STARTPAY_BASE}/${data.trackId}` }
    }
    return { ok: false, error: data?.message || 'اتصال به درگاهِ پرداخت ناموفق بود' }
  } catch {
    return { ok: false, error: 'خطا در اتصال به درگاهِ پرداخت' }
  }
}

export async function verifyZibalPayment(trackId: number | string): Promise<ZibalVerifyResult> {
  if (!MERCHANT) return { ok: false, error: 'درگاهِ پرداختِ آنلاین هنوز تنظیم نشده' }
  try {
    const res = await fetch(`${API_BASE}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: MERCHANT, trackId }),
    })
    const data = await res.json()
    // 100 = تاییدِ تازه، 201 = قبلاً تایید شده (idempotent — نباید خطا حساب شود)
    if (data?.result === 100 || data?.result === 201) {
      return { ok: true, refNumber: data.refNumber ?? trackId }
    }
    return { ok: false, error: data?.message || 'پرداخت تاییدنشده است' }
  } catch {
    return { ok: false, error: 'خطا در تاییدِ پرداخت' }
  }
}
