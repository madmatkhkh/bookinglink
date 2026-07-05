// ─────────────────────────────────────────────────────────────────────────────
// لایه‌ی مشترکِ نیچِ روانشناسی — قیمت‌گذاری، قوانین، و تنظیماتِ per-tenant.
// معادلِ config.ts + settings.ts در psych-booking، ولی چندمستاجری.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'

// قیمت‌گذاریِ پیش‌فرضِ مرحله‌ها (تومان) — هر tenant می‌تواند در تنظیماتش عوض کند
export const PSY_PRICING = {
  interview: 800000,
  assessment: 1500000,
  sessionOnline: 850000,
  sessionOffline: 1200000,
}

// قانونِ کنسلی: اگر ≥ partialHours ساعت مانده کنسل شود، partialPercent٪ سوخت
export const PSY_CANCEL = { partialHours: 12, partialPercent: 50 }

// نوبت‌گیری زودتر از این تعداد روز ممکن نیست (از فردا)
export const PSY_BOOKING = { minLeadDays: 1 }

export type SessionMode = 'both' | 'online' | 'offline'
export type OfficeLocation = { id: string; title: string; address: string }
export type PaymentCardInfo = { id: string; number: string; holder: string; bank?: string }

// ── سطحِ tenant/برند: چیزی که بینِ همه‌ی دکترهای همان مجموعه مشترک است ────────
export type ClinicSettings = {
  office_locations: OfficeLocation[]
}

export const DEFAULT_CLINIC: ClinicSettings = {
  office_locations: [],
}

export function mergeClinic(raw: Partial<ClinicSettings> | null | undefined): ClinicSettings {
  if (!raw) return DEFAULT_CLINIC
  return {
    office_locations: Array.isArray(raw.office_locations) ? raw.office_locations : [],
  }
}

// تنظیماتِ کلینیکِ یک tenant را می‌خواند (سطحِ tenant، مشترکِ همه‌ی دکترها)
export async function getClinicSettings(tenantId: string): Promise<ClinicSettings> {
  try {
    const { data } = await sb().from('psy_clinic_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
    return mergeClinic(data as Partial<ClinicSettings> | null)
  } catch {
    return DEFAULT_CLINIC
  }
}

// ── سطحِ resource/شخص: پروفایلِ هرکارمند (دکتر) — نام/عنوان/آواتار از خودِ
// جدولِ resources می‌آید (اینجا تکرار نشده)؛ این‌ها فقط چیزهایی‌اند که هر دکتر
// مستقل از بقیه مدیریت می‌کند.
export type ResourceProfile = {
  resource_id: string
  badges: string[]
  session_modes: SessionMode
  cards: PaymentCardInfo[]
}

export const DEFAULT_RESOURCE_PROFILE: Omit<ResourceProfile, 'resource_id'> = {
  badges: [],
  session_modes: 'both',
  cards: [],
}

export function mergeResourceProfile(resourceId: string, raw: Partial<ResourceProfile> | null | undefined): ResourceProfile {
  const mode: SessionMode =
    raw?.session_modes === 'online' || raw?.session_modes === 'offline' ? raw.session_modes : 'both'
  return {
    resource_id: resourceId,
    badges: Array.isArray(raw?.badges) ? raw!.badges : [],
    session_modes: mode,
    cards: Array.isArray(raw?.cards) ? raw!.cards : [],
  }
}

// پروفایلِ یک دکترِ مشخص (per-resource)
export async function getResourceProfile(resourceId: string): Promise<ResourceProfile> {
  try {
    const { data } = await sb().from('psy_resource_profiles').select('*').eq('resource_id', resourceId).maybeSingle()
    return mergeResourceProfile(resourceId, data as Partial<ResourceProfile> | null)
  } catch {
    return mergeResourceProfile(resourceId, null)
  }
}

// لیستِ دکترهای قابل‌انتخابِ یک tenant برای صفحه‌ی عمومی (نام/عنوان/آواتار از
// resources + بج/مدِ جلسه از پروفایلِ خودشان). تک‌دکترها یک آیتم می‌گیرند.
export type PublicDoctor = {
  id: string
  name: string
  title: string
  avatar_url: string | null
  badges: string[]
  session_modes: SessionMode
  cards: PaymentCardInfo[]
}

export async function listPublicDoctors(tenantId: string): Promise<PublicDoctor[]> {
  const { data: resources } = await sb().from('resources').select('id, name, title, avatar_url, sort_order')
    .eq('tenant_id', tenantId).eq('is_active', true).eq('is_selectable', true)
    .order('sort_order').order('created_at')
  const list = resources || []
  if (list.length === 0) return []
  const { data: profiles } = await sb().from('psy_resource_profiles').select('*')
    .in('resource_id', list.map(r => r.id))
  const byId = new Map((profiles || []).map(p => [p.resource_id, p]))
  return list.map(r => {
    const prof = mergeResourceProfile(r.id, byId.get(r.id) || null)
    return { id: r.id, name: r.name, title: r.title, avatar_url: r.avatar_url, badges: prof.badges, session_modes: prof.session_modes, cards: prof.cards }
  })
}

// وقتی tenant دقیقاً یک منبعِ فعال دارد (اکثریتِ الانِ tenantها)، تعیینِ resourceId
// برای رزروِ عمومی نیازی به انتخابِ کاربر ندارد — خودکار همان یکی است.
export async function getDefaultResourceId(tenantId: string): Promise<string | null> {
  const { data } = await sb().from('resources').select('id')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .order('sort_order').order('created_at').limit(1).maybeSingle()
  return data?.id || null
}

// کلیدهای ماژول‌هایی که مراجع در پنلِ خودش می‌بیند — پیش‌فرض همه روشن
export const PATIENT_FEATURE_KEYS = ['patient_buy_extra_session', 'patient_self_cancel'] as const

export const onlineAvailable = (m: SessionMode) => m === 'both' || m === 'online'
export const offlineAvailable = (m: SessionMode) => m === 'both' || m === 'offline'
