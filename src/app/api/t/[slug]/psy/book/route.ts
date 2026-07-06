import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { PSY_PRICING, getDefaultResourceId, getIntakeForm, missingIntakeFields, INTAKE_KNOWN_COLUMNS } from '@/lib/psy'
import { setPayCookie } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function genCase(): string {
  return `PRV-${Math.floor(1000 + Math.random() * 9000)}`
}

// نام و یک شماره‌تماس همیشه ثابت‌اند (برای OTP لازم‌اند)؛ بقیه‌ی سوال‌ها کاملاً
// دیتایی‌اند و از فرمِ تنظیم‌شده‌ی همان دکتر می‌آیند (پنل → تنظیمات → فرمِ رزرو).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const b = await req.json()
  const { fatherPhone, sessionType, officeLocation, resourceId, answers } = b
  const childName = String(b.childName || '').trim().replace(/\s+/g, ' ')
  const rawAnswers: Record<string, any> = answers && typeof answers === 'object' ? answers : {}

  if (!childName || !fatherPhone)
    return NextResponse.json({ error: 'نام و شماره تماس لازم است' }, { status: 400 })
  if (!/^09\d{9}$/.test(String(fatherPhone).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).trim()))
    return NextResponse.json({ error: 'شماره تماس معتبر نیست (باید 11 رقم و با 09 شروع شود)' }, { status: 400 })

  // یک پرونده با همین نام + همین شماره قبلاً ثبت نشده باشد (تغییرِ نام یا شماره
  // آزاد است — فقط ترکیبِ عینِ یکسان مسدود می‌شود)
  const { data: dup } = await sb().from('psy_cases').select('id')
    .eq('tenant_id', t.id).eq('child_name', childName).eq('father_phone', fatherPhone).maybeSingle()
  if (dup) return NextResponse.json({ error: 'پرونده‌ای با همین نام و شماره‌تماس قبلاً ثبت شده است.' }, { status: 409 })

  // فعلاً صفحه‌ی عمومی دکتری را انتخاب نمی‌گیرد مگر بیش از یک دکتر باشد
  let finalResourceId: string | null = null
  if (resourceId) {
    const { data: r } = await sb().from('resources').select('id').eq('id', resourceId).eq('tenant_id', t.id).maybeSingle()
    finalResourceId = r?.id || null
  }
  if (!finalResourceId) finalResourceId = await getDefaultResourceId(t.id)

  // اعتبارسنجیِ سمتِ سرور — طبقِ همان فرمی که این دکتر تعریف کرده (نه فقط سمتِ کاربر)
  if (finalResourceId) {
    const form = await getIntakeForm(finalResourceId)
    const missing = missingIntakeFields(form, rawAnswers)
    if (missing.length) return NextResponse.json({ error: 'اطلاعاتِ ناقص: ' + missing.join('، ') }, { status: 400 })
  }

  let caseNumber = genCase()
  for (let i = 0; i < 6; i++) {
    const { data } = await sb().from('psy_cases').select('id')
      .eq('tenant_id', t.id).eq('case_number', caseNumber).maybeSingle()
    if (!data) break
    caseNumber = genCase()
  }

  // پاسخ‌هایی که روی ستونِ واقعیِ psy_cases می‌نشینند در همان‌جا؛ بقیه در details
  const known: Record<string, any> = {}
  const details: Record<string, any> = {}
  for (const [key, value] of Object.entries(rawAnswers)) {
    if ((INTAKE_KNOWN_COLUMNS as readonly string[]).includes(key)) known[key] = value
    else details[key] = value
  }

  const { data, error } = await sb().from('psy_cases').insert([{
    tenant_id: t.id,
    resource_id: finalResourceId,
    case_number: caseNumber,
    parent_name: known.father_name || known.mother_name || '',
    phone: fatherPhone,
    child_name: childName,
    birth_date: known.birth_date || '',
    grade: known.grade || '',
    reason: known.reason || '',
    father_name: known.father_name || '',
    father_phone: fatherPhone,
    mother_name: known.mother_name || '',
    mother_phone: known.mother_phone || '',
    session_type: sessionType,
    office_location: officeLocation || null,
    details,
    status: 'pending',
  }]).select().single()

  if (error) {
    console.error('psy/book insert error:', error)
    return NextResponse.json({
      error: 'مشکلی در ثبتِ اطلاعات پیش آمد. لطفاً دوباره تلاش کنید؛ اگر باز هم تکرار شد، با مجموعه تماس بگیرید.',
      detail: `${error.code || ''} ${error.message || ''}`.trim(),
    }, { status: 500 })
  }

  // مرحله‌ی اولِ پرونده همیشه «مصاحبه» است — خودِ ثبتِ فرم همین مرحله را می‌سازد
  const { data: stage, error: stageErr } = await sb().from('psy_stages').insert({
    tenant_id: t.id, resource_id: finalResourceId, case_number: caseNumber,
    stage_type: 'interview', price: PSY_PRICING.interview, status: 'awaiting_payment',
  }).select().single()
  if (stageErr || !stage) {
    console.error('psy/book stage insert error:', stageErr)
    return NextResponse.json({
      error: 'مشکلی در ایجادِ مرحله‌ی مصاحبه پیش آمد. لطفاً دوباره تلاش کنید.',
      detail: `${stageErr?.code || ''} ${stageErr?.message || ''}`.trim(),
    }, { status: 500 })
  }
  await sb().from('psy_cases').update({ current_stage_id: stage.id }).eq('id', data.id)

  // مجوزِ پرداختِ محدود به همین پرونده (کوکیِ امضاشده‌ی 2ساعته) — تا مراجعِ تازه
  // بدونِ OTP بتواند فقط هزینه‌ی مصاحبه‌ی همین پرونده را پرداخت کند (auth.ts)
  const res = NextResponse.json({ success: true, id: data.id, caseNumber, stageId: stage.id })
  setPayCookie(res, caseNumber)
  return res
}
