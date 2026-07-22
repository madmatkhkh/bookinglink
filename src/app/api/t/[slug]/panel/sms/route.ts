import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { requirePanelAuth, isPanelAuthResponse } from '@/lib/tenant'
import { getSmsAllowance } from '@/lib/smsQuota'
import { freeTextSmsConfigured } from '@/lib/sms'
import { validateReminderBody, DEFAULT_REMINDER_BODY, SmsTemplate } from '@/lib/smsTemplates'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// بخش «پیامک» در تب قابلیت‌ها: وضعیت سهمیه/اعتبار + قالب یادآوری سفارشی.
//
// نکته‌ی دسترسی: خواندن برای کارمند هم آزاد است (باید بداند چقدر اعتبار مانده)،
// ولی نوشتن فقط کار صاحب مجموعه است — قالب پیامک تنظیمی سطح-مجموعه است و از
// خط مشترک پلتفرم بیرون می‌رود، پس تصمیمش هم باید مال صاحب حساب باشد.

async function loadTemplate(tenantId: string): Promise<SmsTemplate | null> {
  const { data, error } = await sb().from('sms_templates')
    .select('id, kind, body, status, review_note, reviewed_at, updated_at')
    .eq('tenant_id', tenantId).eq('kind', 'reminder').maybeSingle()
  // قبل از migration 0052 جدول نیست → مثل «هنوز قالبی ننوشته» رفتار کن
  if (error) {
    if (!/does not exist/i.test(error.message || '')) console.error('panel/sms load error:', error.message)
    return null
  }
  return (data as SmsTemplate) || null
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a

  const [allowance, template] = await Promise.all([
    getSmsAllowance(a.tenant.id, a.tenant.plan),
    loadTemplate(a.tenant.id),
  ])

  return NextResponse.json({
    allowance,
    template,
    defaultBody: DEFAULT_REMINDER_BODY,
    // اگر خط اختصاصی در env نیست، متن سفارشی حتی بعد از تایید هم ارسال نمی‌شود
    // و یادآوری روی الگوی ثابت می‌ماند — بهتر است کاربر این را بداند تا اینکه
    // متنی بنویسد، تایید بگیرد و بی‌صدا هیچ‌وقت استفاده نشود.
    customSendingAvailable: freeTextSmsConfigured(),
    canEdit: a.isOwner,
  })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const a = await requirePanelAuth(req, params.slug)
  if (isPanelAuthResponse(a)) return a
  if (!a.isOwner) return NextResponse.json({ error: 'فقط صاحب مجموعه می‌تواند متن پیامک را تغییر دهد' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  const v = validateReminderBody(b.body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const existing = await loadTemplate(a.tenant.id)

  // ⚠️ هسته‌ی امنیتی این فیچر: هر ذخیره‌ای status را به pending_review برمی‌گرداند.
  // بدون این، صاحب مجموعه می‌توانست یک متن بی‌خطر تایید بگیرد و بعد محتوایش را
  // به تبلیغ عوض کند — و خط مشترک پلتفرم بلک‌لیست شود.
  // استثنای عمدی: اگر متن *دقیقا* همان چیزی است که قبلا تایید شده، دوباره به صف
  // بازبینی نمی‌رود (کاربر فقط دکمه‌ی ذخیره را دوباره زده).
  const unchangedAndApproved = existing?.status === 'approved' && existing.body === v.body
  const status = unchangedAndApproved ? 'approved' : 'pending_review'

  const row = {
    tenant_id: a.tenant.id,
    kind: 'reminder',
    body: v.body,
    status,
    review_note: null,
    reviewed_at: unchangedAndApproved ? existing?.reviewed_at ?? null : null,
    updated_at: new Date().toISOString(),
  }

  const { error } = existing
    ? await sb().from('sms_templates').update(row).eq('id', existing.id)
    : await sb().from('sms_templates').insert(row)

  if (error) {
    console.error('panel/sms save error:', error)
    return NextResponse.json({ error: 'ذخیره‌ی متن پیامک ناموفق بود' }, { status: 500 })
  }

  return NextResponse.json({ success: true, status, template: await loadTemplate(a.tenant.id) })
}
