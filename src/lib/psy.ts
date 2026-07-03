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

export type ClinicSettings = {
  doctor_name: string
  doctor_title: string
  avatar_url: string
  badges: string[]
  session_modes: SessionMode
  office_locations: OfficeLocation[]
  cards: PaymentCardInfo[]
}

export const DEFAULT_CLINIC: ClinicSettings = {
  doctor_name: '',
  doctor_title: '',
  avatar_url: '',
  badges: [],
  session_modes: 'both',
  office_locations: [],
  cards: [],
}

// هر فیلدِ ناقص را با پیش‌فرض پر می‌کند (مقاوم در برابر دیتای ناقص)
export function mergeClinic(raw: Partial<ClinicSettings> | null | undefined): ClinicSettings {
  if (!raw) return DEFAULT_CLINIC
  const mode: SessionMode =
    raw.session_modes === 'online' || raw.session_modes === 'offline' ? raw.session_modes : 'both'
  return {
    doctor_name: raw.doctor_name || '',
    doctor_title: raw.doctor_title || '',
    avatar_url: raw.avatar_url || '',
    badges: Array.isArray(raw.badges) ? raw.badges : [],
    session_modes: mode,
    office_locations: Array.isArray(raw.office_locations) ? raw.office_locations : [],
    cards: Array.isArray(raw.cards) ? raw.cards : [],
  }
}

// تنظیماتِ کلینیکِ یک tenant را می‌خواند (per-tenant، جایگزینِ clinic_settings تک‌ردیفی)
export async function getClinicSettings(tenantId: string): Promise<ClinicSettings> {
  try {
    const { data } = await sb().from('psy_clinic_settings').select('*').eq('tenant_id', tenantId).maybeSingle()
    return mergeClinic(data as Partial<ClinicSettings> | null)
  } catch {
    return DEFAULT_CLINIC
  }
}

export const onlineAvailable = (m: SessionMode) => m === 'both' || m === 'online'
export const offlineAvailable = (m: SessionMode) => m === 'both' || m === 'offline'
