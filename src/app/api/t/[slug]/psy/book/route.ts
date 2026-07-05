import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { getActiveTenant } from '@/lib/tenant'
import { FLOW } from '@/lib/flow'
import { PSY_PRICING, getDefaultResourceId } from '@/lib/psy'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function genCase(): string {
  return `PRV-${Math.floor(1000 + Math.random() * 9000)}`
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const t = await getActiveTenant(params.slug)
  if (!t) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const b = await req.json()
  const {
    childName, birthDate, grade, reason, prevVisit,
    fatherName, fatherEducation, fatherJob, fatherPhone,
    motherName, motherEducation, motherJob, motherPhone,
    homeAddress, hasSiblings, siblingsInfo, otherResidents, otherResidentsInfo,
    familyStatus, childConditions,
    pregnancyAge, pregnancyCount, pregnancyStress, pregnancyDepression, pregnancyIssues, pregnancyAbortion, pregnancyNone,
    birthType, birthWeight,
    growthCrawl, growthCrawlDuration, growthWalk4, growthWalk4Duration, growthWalkAge, growthTalkAge, growthIssues,
    seizureHistory, currentMeds,
    schoolName, schoolInstitute, schoolGrade, schoolPhone,
    sportsActivity, sportsLimit,
    fatherBehavior, motherBehavior, mainSupervisor,
    extraNotes, sessionType, paymentRef, officeLocation, resourceId,
  } = b

  if (!childName || !fatherPhone || !motherPhone)
    return NextResponse.json({ error: 'اطلاعات ناقص است' }, { status: 400 })

  // فعلاً صفحه‌ی عمومی دکتری را انتخاب نمی‌گیرد (تک‌دکترها خودکار درست کار می‌کند)؛
  // اگر روزی UIِ انتخابِ دکتر اضافه شد، resourceId از بدنه می‌آید و همینجا اعتبارسنجی می‌شود.
  let finalResourceId: string | null = null
  if (resourceId) {
    const { data: r } = await sb().from('resources').select('id').eq('id', resourceId).eq('tenant_id', t.id).maybeSingle()
    finalResourceId = r?.id || null
  }
  if (!finalResourceId) finalResourceId = await getDefaultResourceId(t.id)

  let caseNumber = genCase()
  for (let i = 0; i < 6; i++) {
    const { data } = await sb().from('psy_cases').select('id')
      .eq('tenant_id', t.id).eq('case_number', caseNumber).maybeSingle()
    if (!data) break
    caseNumber = genCase()
  }

  // فیلدهای تفصیلی در details (jsonb) — همان محتوایی که قبلاً ستون‌های جدا بود
  const details = {
    grade, prev_visit: prevVisit,
    father_education: fatherEducation, father_job: fatherJob,
    mother_education: motherEducation, mother_job: motherJob,
    home_address: homeAddress,
    siblings_info: hasSiblings === 'بله' ? siblingsInfo : 'ندارد',
    family_members_info: otherResidents === 'بله' ? otherResidentsInfo : 'فقط اعضای اصلی خانواده',
    family_status: familyStatus?.join?.('، ') || '',
    child_conditions: childConditions?.join?.('، ') || '',
    pregnancy_info: pregnancyNone
      ? `سن: ${pregnancyAge}، تعداد: ${pregnancyCount}، موردی نداشت`
      : `سن: ${pregnancyAge}، تعداد: ${pregnancyCount}، ${[pregnancyStress, pregnancyDepression, pregnancyIssues, pregnancyAbortion].filter(Boolean).join('، ')}`,
    birth_type: birthType, birth_weight: birthWeight,
    growth_info: `سینه‌خیز: ${growthCrawl} ${growthCrawlDuration || ''} | چهار دست و پا: ${growthWalk4} ${growthWalk4Duration || ''} | راه رفتن: ${growthWalkAge} | حرف زدن: ${growthTalkAge} | ${growthIssues || ''}`,
    medical_info: `غش‌تشنج: ${seizureHistory} | داروها: ${currentMeds}`,
    school_info: `${schoolName} | ${schoolInstitute} | پایه: ${schoolGrade} | تلفن: ${schoolPhone}`,
    sports_info: `${sportsActivity} | محدودیت: ${sportsLimit}`,
    parent_behavior: `پدر: ${fatherBehavior} | مادر: ${motherBehavior} | ناظر اصلی: ${mainSupervisor}`,
    extra_notes: extraNotes,
  }

  const { data, error } = await sb().from('psy_cases').insert([{
    tenant_id: t.id,
    resource_id: finalResourceId,
    case_number: caseNumber,
    parent_name: fatherName || motherName,
    phone: fatherPhone || motherPhone,
    child_name: childName,
    birth_date: birthDate,
    reason,
    father_name: fatherName, father_phone: fatherPhone,
    mother_name: motherName, mother_phone: motherPhone,
    session_type: sessionType,
    office_location: officeLocation || null,
    details,
    interview_price: PSY_PRICING.interview,
    interview_payment_ref: paymentRef || null,
    flow_status: FLOW.INTERVIEW_AWAITING_PAYMENT,
    status: 'pending',
  }]).select().single()

  if (error) return NextResponse.json({ error: `خطا در ذخیره: ${error.message}` }, { status: 500 })
  return NextResponse.json({ success: true, id: data.id, caseNumber })
}
