// ─────────────────────────────────────────────────────────────────────────────
// درگاهِ پرداختِ آنلاین — زرین‌پال (استانداردِ رایج برای این‌جور اپ‌های ایرانی).
// برای فعال‌شدنِ واقعی باید ZARINPAL_MERCHANT_ID به env اضافه شود؛ بدونِ آن،
// درخواستِ پرداخت با خطای روشن fail می‌شود (نه سکوت).
// برای تست از ZARINPAL_SANDBOX=true استفاده کنید.
// ─────────────────────────────────────────────────────────────────────────────

const MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID || ''
const SANDBOX = process.env.ZARINPAL_SANDBOX === 'true'
const API_BASE = SANDBOX ? 'https://sandbox.zarinpal.com/pg/v4/payment' : 'https://payment.zarinpal.com/pg/v4/payment'
const STARTPAY_BASE = SANDBOX ? 'https://sandbox.zarinpal.com/pg/StartPay' : 'https://payment.zarinpal.com/pg/StartPay'

export type ZarinpalRequestResult = { ok: true; authority: string; url: string } | { ok: false; error: string }
export type ZarinpalVerifyResult = { ok: true; refId: number } | { ok: false; error: string }

// مبلغ‌ها همه‌جای این پروژه تومان است؛ زرین‌پال ریال می‌گیرد (× ۱۰)
export async function requestZarinpalPayment(
  amountToman: number, description: string, callbackUrl: string, mobile?: string
): Promise<ZarinpalRequestResult> {
  if (!MERCHANT_ID) return { ok: false, error: 'درگاهِ پرداختِ آنلاین هنوز تنظیم نشده (ZARINPAL_MERCHANT_ID)' }
  try {
    const res = await fetch(`${API_BASE}/request.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: MERCHANT_ID,
        amount: Math.round(amountToman * 10),
        description,
        callback_url: callbackUrl,
        ...(mobile ? { metadata: { mobile } } : {}),
      }),
    })
    const data = await res.json()
    if (data?.data?.code === 100 && data?.data?.authority) {
      return { ok: true, authority: data.data.authority, url: `${STARTPAY_BASE}/${data.data.authority}` }
    }
    return { ok: false, error: data?.errors?.message || 'اتصال به درگاهِ پرداخت ناموفق بود' }
  } catch {
    return { ok: false, error: 'خطا در اتصال به درگاهِ پرداخت' }
  }
}

export async function verifyZarinpalPayment(amountToman: number, authority: string): Promise<ZarinpalVerifyResult> {
  if (!MERCHANT_ID) return { ok: false, error: 'درگاهِ پرداختِ آنلاین هنوز تنظیم نشده' }
  try {
    const res = await fetch(`${API_BASE}/verify.json`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant_id: MERCHANT_ID, amount: Math.round(amountToman * 10), authority }),
    })
    const data = await res.json()
    // 100 = تاییدِ تازه، 101 = قبلاً تایید شده (idempotent — نباید خطا حساب شود)
    if (data?.data?.code === 100 || data?.data?.code === 101) {
      return { ok: true, refId: data.data.ref_id }
    }
    return { ok: false, error: data?.errors?.message || 'پرداخت تاییدنشده است' }
  } catch {
    return { ok: false, error: 'خطا در تاییدِ پرداخت' }
  }
}
