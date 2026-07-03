// ─────────────────────────────────────────────────────────────────────────────
// نیچ (تمپلیت): محتوای پیش‌فرضِ هر نوع کسب‌وکار به‌صورتِ دیتا.
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
}

export async function getNiche(key: string): Promise<Niche | null> {
  const { data } = await sb().from('niches').select('*').eq('key', key).single()
  return (data as Niche) ?? null
}

export async function listNiches(): Promise<Niche[]> {
  const { data } = await sb().from('niches').select('*').eq('is_active', true).order('sort_order')
  return (data || []) as Niche[]
}
