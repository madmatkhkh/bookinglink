import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'
import { getSmsAllowance } from '@/lib/smsQuota'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ─────────────────────────────────────────────────────────────────────────────
// فاز P3 قیمت‌گذاری — شارژ دستی اعتبار پیامکی توسط سوپرادمین (MODULES.md 9.3:
// «فروش بسته‌ی شارژ، فاز اول: شارژ دستی سوپرادمین، فاکتور بیرون سیستم»).
// هر شارژ یک ردیف تغییرناپذیر در sms_credits است (همان فلسفه‌ی ledger).
// مقدار منفی هم مجاز است (اصلاح اشتباه) — ولی مانده هرگز زیر صفر حساب نمی‌شود.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount, note } = await req.json().catch(() => ({}))
  const n = Number(amount)
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 100000)
    return NextResponse.json({ error: 'تعداد پیامک نامعتبر است (عدد صحیح غیرصفر، حداکثر 100000)' }, { status: 400 })

  const { data: tenant } = await sb().from('tenants').select('id, plan').eq('id', params.id).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  const { error } = await sb().from('sms_credits').insert({
    tenant_id: tenant.id, amount: n, note: String(note || '').slice(0, 200) || null, created_by: 'super',
  })
  if (error) return NextResponse.json({ error: 'ثبت شارژ ناموفق بود (migration 0047 اجرا شده؟)' }, { status: 500 })

  const allowance = await getSmsAllowance(tenant.id, tenant.plan)
  return NextResponse.json({ success: true, sms_allowance: allowance })
}
