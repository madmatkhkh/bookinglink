import { NextRequest, NextResponse } from 'next/server'
import { sb } from '@/lib/supabase'
import { isSuperAuthed } from '@/lib/auth'
import { MULTI_THERAPIST_FEATURE_KEY, CARD_TO_CARD_FEATURE_KEY } from '@/lib/psy'
import { getModuleCatalog, getEnabledModules, unmetDependencies, dependentsBlockedBy, dependencyLabel } from '@/lib/modules'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// PATCH { feature_key, enabled } → سوپرادمین هر ماژول کاتالوگ را برای این
// tenant روشن/خاموش می‌کند. از فاز 1 سیستم ماژولار (MODULES.md):
//   - کلید باید در کاتالوگ modules وجود داشته باشد (مگر کاتالوگ خالی باشد —
//     یعنی migration 0029 هنوز اجرا نشده → مثل قبل بدون اعتبارسنجی، fail-open).
//   - روشن‌کردن: وابستگی‌های depends_on باید برآورده باشند.
//   - خاموش‌کردن: اگر ماژول فعال دیگری به این وابسته است، اول باید آن خاموش شود.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSuperAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = params.id
  const { feature_key, enabled } = await req.json().catch(() => ({}))
  if (!feature_key || typeof feature_key !== 'string')
    return NextResponse.json({ error: 'feature_key لازم است' }, { status: 400 })

  const { data: tenant } = await sb().from('tenants').select('id').eq('id', id).maybeSingle()
  if (!tenant) return NextResponse.json({ error: 'یافت نشد' }, { status: 404 })

  // ── اعتبارسنجی از روی کاتالوگ + وابستگی‌ها ─────────────────────────────
  const catalog = await getModuleCatalog()
  if (catalog.length > 0) {
    const mod = catalog.find(m => m.key === feature_key)
    if (!mod) return NextResponse.json({ error: 'کلید ماژول در کاتالوگ وجود ندارد' }, { status: 400 })
    if (!mod.is_active && enabled)
      return NextResponse.json({ error: 'این ماژول در سطح پلتفرم غیرفعال است' }, { status: 400 })

    const current = await getEnabledModules(id)
    if (enabled) {
      const unmet = unmetDependencies(mod, current)
      if (unmet.length) {
        const need = unmet.map(d => `«${dependencyLabel(d, catalog)}»`).join(' و ')
        return NextResponse.json({ error: `پیش‌نیاز این ماژول فعال نیست: اول ${need} را روشن کنید` }, { status: 400 })
      }
    } else {
      const blocked = dependentsBlockedBy(feature_key, catalog, current)
      if (blocked.length) {
        const names = blocked.map(m => `«${m.display_name}»`).join(' و ')
        return NextResponse.json({ error: `ماژول‌های ${names} به این وابسته‌اند — اول آنها را خاموش کنید` }, { status: 400 })
      }
    }
  }

  const { data: existing } = await sb().from('tenant_features').select('tenant_id')
    .eq('tenant_id', id).eq('feature_key', feature_key).maybeSingle()

  // برای «حالت کلینیک»: تصمیم سوپرادمین (چه تایید چه رد دستی) همیشه هر
  // درخواست معلقی را هم پاک می‌کند — دیگر چیزی برای نمایش «در انتظار» نمی‌ماند.
  const patch: Record<string, any> = { enabled: !!enabled }
  if (feature_key === MULTI_THERAPIST_FEATURE_KEY) patch.config = { requested: false }

  let { error } = existing
    ? await sb().from('tenant_features').update(patch).eq('tenant_id', id).eq('feature_key', feature_key)
    : await sb().from('tenant_features').insert({ tenant_id: id, feature_key, source: 'manual', ...patch })
  // fail-open قبل از migration 0029: اگر ستون source هنوز نیست، بدون آن retry
  if (error && !existing) {
    const retry = await sb().from('tenant_features').insert({ tenant_id: id, feature_key, ...patch })
    error = retry.error
  }

  if (error) {
    console.error('super/tenants/[id]/features PATCH error:', error)
    return NextResponse.json({ error: 'ذخیره‌ی تغییرات ناموفق بود' }, { status: 500 })
  }

  // خاموش‌شدن کارت‌به‌کارت: دیتای ذخیره‌شده‌ی درمانگرها هم به فقط-آنلاین برگردانده
  // می‌شود (پاکیزگی) — دفاع واقعی همچنان effectivePaymentMethods در لحظه‌ی مصرف است.
  if (feature_key === CARD_TO_CARD_FEATURE_KEY && !enabled) {
    const { data: resources } = await sb().from('resources').select('id').eq('tenant_id', id)
    const ids = (resources || []).map(r => r.id)
    if (ids.length) {
      const { data: profiles } = await sb().from('psy_resource_profiles')
        .select('resource_id, payment_methods').in('resource_id', ids)
      const needsFixIds = (profiles || [])
        .filter(p => (p.payment_methods as any)?.card_to_card || !(p.payment_methods as any)?.online)
        .map(p => p.resource_id)
      if (needsFixIds.length) {
        await sb().from('psy_resource_profiles')
          .update({ payment_methods: { card_to_card: false, online: true }, updated_at: new Date().toISOString() })
          .in('resource_id', needsFixIds)
      }
    }
  }

  return NextResponse.json({ success: true })
}
