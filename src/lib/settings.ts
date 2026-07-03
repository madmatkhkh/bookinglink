// ─────────────────────────────────────────────────────────────────────────────
// پلِ سازگاری: پنلِ روانشناسی (منتقل‌شده از psych-booking) این تایپ‌ها را از
// '@/lib/settings' می‌خواهد. منبعِ حقیقت حالا psy.ts است.
// ─────────────────────────────────────────────────────────────────────────────
export type { SessionMode, OfficeLocation, PaymentCardInfo, ClinicSettings } from './psy'
import { DEFAULT_CLINIC } from './psy'
import type { ClinicSettings } from './psy'
export const DEFAULT_SETTINGS: ClinicSettings = DEFAULT_CLINIC
