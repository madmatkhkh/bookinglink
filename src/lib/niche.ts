// ─────────────────────────────────────────────────────────────────────────────
// نیچ (تمپلیت): محتوای پیش‌فرض هر نوع کسب‌وکار به‌صورت دیتا.
// هسته این را می‌خواند تا بداند برچسب‌ها، فیلدهای پرونده و ماژول‌های پیش‌فرض چیست.
// ─────────────────────────────────────────────────────────────────────────────
import { sb } from './supabase'

export type RecordField = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select'
  options?: string[]
}
export type SampleService = { name: string; duration_minutes: number; price: number; mode: string }

export type Niche = {
  key: string
  display_name: string
  tagline: string
  icon: string
  client_label: string        // «مراجع» / «مشتری»
  resource_label: string      // «درمانگر» / «آرایشگر»
  booking_label: string       // «جلسه» / «رزرو»
  default_theme: string
  record_fields: RecordField[]
  default_features: string[]
  sample_services: SampleService[]
  setup_price: number
  sort_order: number
  is_active: boolean
}

export async function getNiche(key: string): Promise<Niche | null> {
  const { data } = await sb().from('niches').select('*').eq('key', key).single()
  return (data as Niche) ?? null
}

// همه‌ی نیچ‌ها (فعال و غیرفعال) — برای لندینگ/ثبت‌نام، تا تمپلیت‌های
// «به‌زودی» هم دیده شوند (فقط غیرقابل‌انتخاب)، نه اینکه کامل پنهان باشند.
// فیلتر «فقط فعال» دیگر این‌جا اعمال نمی‌شود؛ فرانت‌اند بر اساس is_active
// تصمیم می‌گیرد کلیک‌پذیر باشد یا با نشان «به‌زودی» غیرفعال نمایش داده شود.
export async function listNiches(): Promise<Niche[]> {
  const { data } = await sb().from('niches').select('*').order('sort_order')
  return (data || []) as Niche[]
}

// 'psychology_clinic' یک نیچ واقعا جدا نیست — همان تمپلیت روانشناسی است، فقط
// با فلگ multi_therapist از قبل روشن (تنانت کلینیک). هرجا کد باید تصمیم بگیرد
// «این تنانت از خانواده‌ی روانشناسی است یا نه» (کدام Admin/جدول‌ها/آمار)، باید
// از این هلپر استفاده کند، نه مقایسه‌ی مستقیم با رشته‌ی 'psychology' — وگرنه
// تنانت‌های کلینیک از قلم می‌افتند.
export function isPsychologyNiche(nicheKey: string | null | undefined): boolean {
  return nicheKey === 'psychology' || nicheKey === 'psychology_clinic'
}
