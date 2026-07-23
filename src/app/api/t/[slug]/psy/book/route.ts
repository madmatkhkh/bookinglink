import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { getDefaultResourceId, getIntakeForm, missingIntakeFields, INTAKE_KNOWN_COLUMNS, getResourcePricing, resolvePrice, getFirstStageLabel } from '@/lib/psy'
import { isDraftCase } from '@/lib/flow'
import { setPayCookie, normalizePhone, isValidEmail } from '@/lib/auth'
import { randomInt } from 'crypto'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// 6 رقم از CSPRNG (نه Math.random) — هم فضای بزرگ‌تر (900هزار به‌جای 9هزار؛
// سقف عملی پرونده به‌ازای هر tenant) هم غیرقابل‌حدس. پرونده‌های قدیمی
// 4رقمی همچنان معتبرند — هیچ‌جا طول عدد validate نمی‌شود.
function genCase(): string {
  return `PRV-${randomInt(100000, 1000000)}`
}

// نام و یک شماره‌تماس همیشه ثابت‌اند (برای OTP لازم‌اند)؛ بقیه‌ی سوال‌ها کاملا
// دیتایی‌اند و از فرم تنظیم‌شده‌ی همان دکتر می‌آیند (پنل → تنظیمات → فرم رزرو).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const b = await req.json()
  const { contactPhone, sessionType, officeLocation, resourceId, answers } = b
  const clientName = String(b.clientName || '').trim().replace(/\s+/g, ' ')
  const rawAnswers: Record<string, any> = answers && typeof answers === 'object' ? answers : {}

  // ایمیل یا شماره — حداقل یکی لازم است (نه لزوما شماره)؛ برای مراجع خارج از
  // ایران که شماره‌ی ایرانی ندارد، ایمیل به‌تنهایی کافی است. اگر هرکدام پر شده،
  // باید فرمتش معتبر باشد.
  const email = b.contactEmail ? String(b.contactEmail).trim().toLowerCase() : ''
  if (email && !isValidEmail(email))
    return NextResponse.json({ error: 'ایمیل معتبر نیست' }, { status: 400 })

  // نرمال‌سازی شماره یک بار و همین‌جا — هم برای چک هم برای ذخیره. (باگ قبلی:
  // چک روی نسخه‌ی نرمال‌شده بود ولی نسخه‌ی خام ذخیره می‌شد؛ مراجعی که با ارقام
  // فارسی/فاصله شماره می‌زد، بعدا با OTP نرمال‌شده هرگز به پرونده‌اش نمی‌رسید.)
  const phone = contactPhone ? normalizePhone(contactPhone) : ''
  if (!clientName || (!phone && !email))
    return NextResponse.json({ error: 'نام و حداقل یکی از شماره‌تماس یا ایمیل لازم است' }, { status: 400 })
  if (phone && !/^09\d{9}$/.test(phone))
    return NextResponse.json({ error: 'شماره تماس معتبر نیست (باید 11 رقم و با 09 شروع شود)' }, { status: 400 })

  // یک پرونده با همین نام + همین شماره/ایمیل قبلا ثبت نشده باشد (تغییر نام یا
  // شماره آزاد است — فقط ترکیب عین یکسان مسدود می‌شود)
  const db = sb()
  const dupSelect = '*, current_stage:psy_stages!current_stage_id(*)'
  const [{ data: dupByPhone }, { data: dupByEmail }] = await Promise.all([
    phone ? db.from('psy_cases').select(dupSelect).eq('tenant_id', t.id).eq('client_name', clientName).eq('contact_phone', phone).maybeSingle() : Promise.resolve({ data: null }),
    email ? db.from('psy_cases').select(dupSelect).eq('tenant_id', t.id).eq('client_name', clientName).eq('contact_email', email).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const dup = dupByPhone || dupByEmail

  if (dup) {
    // اگر پرونده‌ی قبلی یک پیش‌نویس رهاشده است (فرم پر شده ولی مراجع حتی ادعای
    // پرداخت هم نکرده)، همان شخص دارد دوباره تلاش می‌کند — نه اینکه واقعا پرونده‌ی
    // تکراری بسازد. قبلا این‌جا 409 می‌خورد و راه‌حلی نداشت جز اینکه دکتر دستی
    // پرونده را پاک کند (این دقیقا اتفاقی بود که افتاد). حالا پیش‌نویس قبلی پاک
    // می‌شود و ثبت‌نام تازه ادامه پیدا می‌کند.
    if (isDraftCase(dup)) {
      await db.from('psy_stages').delete().eq('tenant_id', t.id).eq('case_number', dup.case_number)
      await db.from('psy_cases').delete().eq('id', dup.id)
    } else {
      return NextResponse.json({ error: 'پرونده‌ای با همین نام و شماره‌تماس/ایمیل قبلا ثبت شده است.' }, { status: 409 })
    }
  }

  // فعلا صفحه‌ی عمومی دکتری را انتخاب نمی‌گیرد مگر بیش از یک دکتر باشد
  let finalResourceId: string | null = null
  if (resourceId) {
    const { data: r } = await sb().from('resources').select('id').eq('id', resourceId).eq('tenant_id', t.id).maybeSingle()
    finalResourceId = r?.id || null
  }
  if (!finalResourceId) finalResourceId = await getDefaultResourceId(t.id)

  // اعتبارسنجی سمت سرور — طبق همان فرمی که این دکتر تعریف کرده (نه فقط سمت کاربر)
  if (finalResourceId) {
    const form = await getIntakeForm(finalResourceId)
    const missing = missingIntakeFields(form, rawAnswers)
    if (missing.length) return NextResponse.json({ error: 'اطلاعات ناقص: ' + missing.join('، ') }, { status: 400 })
  }

  let caseNumber = genCase()
  for (let i = 0; i < 6; i++) {
    const { data } = await sb().from('psy_cases').select('id')
      .eq('tenant_id', t.id).eq('case_number', caseNumber).maybeSingle()
    if (!data) break
    caseNumber = genCase()
  }

  // پاسخ‌هایی که روی ستون واقعی psy_cases می‌نشینند در همان‌جا؛ بقیه در details
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
    client_name: clientName,
    birth_date: known.birth_date || '',
    grade: known.grade || '',
    reason: known.reason || '',
    contact_name: known.contact_name || '',
    contact_phone: phone,
    contact_email: email || null,
    contact2_name: known.contact2_name || '',
    contact2_phone: known.contact2_phone ? normalizePhone(known.contact2_phone) : '',
    session_type: sessionType,
    office_location: officeLocation || null,
    details,
    status: 'pending',
  }]).select().single()

  if (error) {
    console.error('psy/book insert error:', error)
    return NextResponse.json({
      error: 'مشکلی در ثبت اطلاعات پیش آمد. لطفا دوباره تلاش کنید؛ اگر باز هم تکرار شد، با مجموعه تماس بگیرید.',
      detail: `${error.code || ''} ${error.message || ''}`.trim(),
    }, { status: 500 })
  }

  // اولین مرحله‌ی پرونده — همان که فرم ثبت می‌سازد. دیگر نوع ثابت «مصاحبه»
  // نیست؛ عنوانش را خود متخصص تعیین کرده (first_stage_label)، و فقط با فلگ
  // is_first مشخص می‌شود که این «اولین تماس» است. قیمت بر اساس آنلاین/حضوری.
  const firstPrice = resolvePrice(sessionType, await getResourcePricing(finalResourceId))
  const firstLabel = await getFirstStageLabel(finalResourceId)
  const { data: stage, error: stageErr } = await sb().from('psy_stages').insert({
    tenant_id: t.id, resource_id: finalResourceId, case_number: caseNumber,
    stage_type: 'custom', title: firstLabel, is_first: true, price: firstPrice, status: 'awaiting_payment',
  }).select().single()
  if (stageErr || !stage) {
    console.error('psy/book stage insert error:', stageErr)
    return NextResponse.json({
      error: 'مشکلی در ایجاد اولین مرحله پیش آمد. لطفا دوباره تلاش کنید.',
      detail: `${stageErr?.code || ''} ${stageErr?.message || ''}`.trim(),
    }, { status: 500 })
  }
  await sb().from('psy_cases').update({ current_stage_id: stage.id }).eq('id', data.id)

  // مجوز پرداخت محدود به همین پرونده (کوکی امضاشده‌ی 2ساعته) — تا مراجع تازه
  // بدون OTP بتواند فقط هزینه‌ی مصاحبه‌ی همین پرونده را پرداخت کند (auth.ts)
  const res = NextResponse.json({ success: true, id: data.id, caseNumber, stageId: stage.id })
  setPayCookie(res, caseNumber)
  return res
}
