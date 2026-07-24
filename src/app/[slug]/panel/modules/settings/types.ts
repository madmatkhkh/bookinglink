// ── تایپ‌های مشترک بخش تنظیمات ───────────────────────────────────────────────
// قبلا داخل PsychologyAdmin.tsx بودند (بدون export). با جداشدن زیرتب‌های
// تنظیمات به ماژول، این‌ها هم باید جایی مشترک می‌بودند تا هم والد هم
// ماژول‌ها از یک تعریف واحد بخوانند — نه دو کپی که می‌توانند از هم جدا بیفتند.
//
// مثل modules/types.ts، این فایل هم فقط تایپ است: نه کد اجرایی دارد، نه اثر
// runtime، نه چرخه‌ی وابستگی.

import { SessionMode, PaymentCardInfo } from '@/lib/settings'
import { CancellationPolicy, PaymentMethods, Pricing, TermsSettings } from '@/lib/psy'
import { MeetChannel } from '@/lib/meet'

// کدام زیرمجموعه‌ی تنظیمات الان باز است (null = نمای کلی تنظیمات)
export type SettingsSub = 'profile' | 'payments' | 'pricing' | 'terms' | 'appearance' | 'form' | 'patient_panel'

// پروفایل per-resource که در تب تنظیمات ویرایش می‌شود
export type ResourceProfileView = {
 resource_id: string
 name: string
 title: string
 avatar_url: string
 phone?: string | null
 badges: string[]
 session_modes: SessionMode
 cards: PaymentCardInfo[]
 cancellation_policy: CancellationPolicy
 payment_methods: PaymentMethods
 quick_times: string[]
 settlement_sheba: string
 settlement_sheba_holder_name: string
 pricing: Pricing
 companion_label: string
 meet_channels: MeetChannel[]
 terms: TermsSettings
 first_stage_label: string
 stage_presets: string[]
}
