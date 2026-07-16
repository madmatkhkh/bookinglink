import { sb } from '@/lib/supabase'

// ── slot_locks: تنها مرجع ضدتداخل زمان (راه‌حل اساسی، migration 0030) ────────
// اصل: هیچ نقطه‌ی رزروی «اول چک کن گرفته‌شده؟» نمی‌کند — که در همزمانی می‌شکند.
// به‌جایش قفل را با INSERT اتمی می‌گیرد. 23505 = گرفته‌شده. این بین‌جدولی است:
// مصاحبه و جلسه‌ی پکیج و جلسه‌ی جایگزین همه یک فضای قفل مشترک دارند.

const PENDING_TTL_MINUTES = 15

export type LockSlot = { session_date: string; session_time: string }

function isUniqueViolation(err: any): boolean {
  return !!err && (err.code === '23505' || err.code === 23505)
}

// یک قفل فعال (رزرو نهایی). موفق → true. گرفته‌شده → false. خطای دیگر → throw.
export async function acquireActiveLock(
  tenantId: string, resourceId: string, slot: LockSlot,
  source: { table: string; id?: string | null; caseNumber?: string | null }
): Promise<boolean> {
  const { error } = await sb().from('slot_locks').insert({
    tenant_id: tenantId, resource_id: resourceId,
    session_date: slot.session_date, session_time: slot.session_time,
    status: 'active', source_table: source.table, source_id: source.id || null,
    case_number: source.caseNumber || null,
  })
  if (!error) return true
  if (isUniqueViolation(error)) return false
  throw error
}

// چند اسلات را اتمی‌وار به‌صورت active قفل می‌کند (برای پکیج چندجلسه‌ای وقتی
// نیازی به مرحله‌ی پرداخت نیست). اگر هرکدام گرفته‌شده باشد، همه‌ی قفل‌های همین
// فراخوانی را برمی‌گرداند و اسلات متضاد را گزارش می‌کند (all-or-nothing).
export async function acquireActiveLocksAtomic(
  tenantId: string, resourceId: string, slots: LockSlot[],
  source: { table: string; caseNumber?: string | null }
): Promise<{ ok: true } | { ok: false; conflict: LockSlot }> {
  const acquired: LockSlot[] = []
  for (const slot of slots) {
    const got = await acquireActiveLock(tenantId, resourceId, slot, { table: source.table, caseNumber: source.caseNumber })
    if (!got) {
      await releaseLocks(tenantId, resourceId, acquired) // rollback دستی
      return { ok: false, conflict: slot }
    }
    acquired.push(slot)
  }
  return { ok: true }
}

// قفل موقت پرداخت: مثل active ولی status=pending و expires_at دارد. اگر مراجع
// پرداخت را رها کند، خودکار (توسط sweepExpiredLocks یا INSERT بعدی) آزاد می‌شود.
export async function acquirePendingLocksAtomic(
  tenantId: string, resourceId: string, slots: LockSlot[],
  source: { table: string; caseNumber?: string | null }
): Promise<{ ok: true } | { ok: false; conflict: LockSlot }> {
  // اول قفل‌های منقضی‌شده‌ی همین resource را پاک کن تا اسلات رهاشده دوباره آزاد شود
  await sweepExpiredLocks(tenantId, resourceId)
  const expiresAt = new Date(Date.now() + PENDING_TTL_MINUTES * 60_000).toISOString()
  const acquired: LockSlot[] = []
  for (const slot of slots) {
    const { error } = await sb().from('slot_locks').insert({
      tenant_id: tenantId, resource_id: resourceId,
      session_date: slot.session_date, session_time: slot.session_time,
      status: 'pending', expires_at: expiresAt,
      source_table: source.table, case_number: source.caseNumber || null,
    })
    if (error) {
      if (isUniqueViolation(error)) { await releaseLocks(tenantId, resourceId, acquired); return { ok: false, conflict: slot } }
      await releaseLocks(tenantId, resourceId, acquired); throw error
    }
    acquired.push(slot)
  }
  return { ok: true }
}

// قفل‌های pending یک پرونده را به active ارتقا می‌دهد (بعد از پرداخت موفق).
// اسلات‌هایی که هنوز pending و منقضی‌نشده‌اند فعال می‌شوند.
export async function activatePendingLocks(
  tenantId: string, resourceId: string, caseNumber: string, source: { table: string }
): Promise<void> {
  await sb().from('slot_locks')
    .update({ status: 'active', expires_at: null })
    .eq('tenant_id', tenantId).eq('resource_id', resourceId)
    .eq('case_number', caseNumber).eq('status', 'pending').eq('source_table', source.table)
}

// آزادسازی قفل چند اسلات مشخص (rollback یا لغو).
export async function releaseLocks(tenantId: string, resourceId: string, slots: LockSlot[]): Promise<void> {
  for (const slot of slots) {
    await sb().from('slot_locks').delete()
      .eq('tenant_id', tenantId).eq('resource_id', resourceId)
      .eq('session_date', slot.session_date).eq('session_time', slot.session_time)
  }
}

// آزادسازی قفل یک رزرو با source (هنگام لغو یک جلسه/مرحله).
export async function releaseLockBySource(sourceTable: string, sourceId: string): Promise<void> {
  await sb().from('slot_locks').delete().eq('source_table', sourceTable).eq('source_id', sourceId)
}

// آزادسازی قفل با مختصات دقیق اسلات (هنگام لغو وقتی source_id در قفل ثبت نشده).
export async function releaseLockBySlot(tenantId: string, resourceId: string, slot: LockSlot): Promise<void> {
  await releaseLocks(tenantId, resourceId, [slot])
}

// به‌روزرسانی source_id یک قفل active بعد از ساخته‌شدن ردیف واقعی (اختیاری،
// برای اینکه لغو بعدی بتواند با source قفل را پیدا کند).
export async function attachSourceId(
  tenantId: string, resourceId: string, slot: LockSlot, sourceId: string
): Promise<void> {
  await sb().from('slot_locks').update({ source_id: sourceId })
    .eq('tenant_id', tenantId).eq('resource_id', resourceId)
    .eq('session_date', slot.session_date).eq('session_time', slot.session_time)
}

// پاک‌سازی قفل‌های pending منقضی‌شده. بدون resourceId → کل tenant (برای cron).
export async function sweepExpiredLocks(tenantId?: string, resourceId?: string): Promise<void> {
  let q = sb().from('slot_locks').delete().eq('status', 'pending').lt('expires_at', new Date().toISOString())
  if (tenantId) q = q.eq('tenant_id', tenantId)
  if (resourceId) q = q.eq('resource_id', resourceId)
  await q
}
