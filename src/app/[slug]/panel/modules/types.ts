// ── تایپ‌های مشترک پنل ───────────────────────────────────────────────────────
// این‌ها قبلا از `PsychologyAdmin.tsx` export می‌شدند و ماژول‌های جداشده‌ی فاز 4
// (`PatientsTab`, `BookingsTab`) مستقیم از والدشان import می‌کردند — یعنی با
// اینکه کدشان جدا شده بود، هنوز به فایل والد وابسته بودند و واقعا مستقل نبودند.
//
// این فایل عمدا هیچ import ای ندارد و هیچ کد اجرایی‌ای هم ندارد (فقط تایپ) —
// پس هیچ چرخه‌ی وابستگی، هیچ اثر runtime، و هیچ افزایشی در باندل ایجاد نمی‌کند.
//
// شکل تایپ‌ها عینا همان قبل است؛ این تغییر فقط «محل تعریف» را عوض می‌کند.

// یک پرونده‌ی کامل مراجع — هم ستون‌های واقعی جدول، هم پاسخ‌های فرم رزرو
export type Patient = {
 id: string
 case_number: string
 // هویت مراجع
 client_name: string
 client_name_en?: string
 birth_date: string
 birth_place?: string
 nationality?: string
 religion?: string
 grade?: string
 school_name?: string
 school_type?: string    // دولتی / خصوصی / غیرانتفاعی
 // شکایت اصلی
 reason: string
 complaint_duration?: string // مدت شکایت
 referred_by?: string     // معرف
 prev_visit?: string     // مراجعه قبلی
 prev_diagnosis?: string   // تشخیص قبلی
 prev_treatment?: string   // درمان قبلی
 // اطلاعات خانواده
 contact_name: string
 father_birth_year?: string
 father_education?: string
 father_job?: string
 contact_phone: string
 father_health?: string    // وضعیت سلامت پدر
 contact2_name: string
 mother_birth_year?: string
 mother_education?: string
 mother_job?: string
 contact2_phone: string
 mother_health?: string    // وضعیت سلامت مادر
 family_status?: string    // وضعیت زندگی والدین
 siblings_count?: string   // تعداد خواهر و برادر
 child_order?: string     // ترتیب تولد
 family_income?: string    // وضعیت اقتصادی
 home_address?: string
 siblings_info?: string    // سن و تحصیلات خواهر/برادر
 family_members_info?: string // اعضای دیگر ساکن
 // سابقه بارداری و تولد
 pregnancy_info?: string   // شرایط بارداری
 birth_type?: string     // نوع زایمان
 birth_weight?: string    // وزن هنگام تولد
 birth_complications?: string // عوارض هنگام تولد
 // رشد و تکامل
 walking_age?: string     // سن راه رفتن
 talking_age?: string     // سن صحبت کردن
 toilet_training?: string   // سن کنترل ادرار
 growth_info?: string     // مشکلات رشدی
 // سابقه پزشکی
 medical_info?: string    // بیماری‌های خاص
 medications?: string     // داروهای مصرفی
 allergies?: string      // آلرژی‌ها
 surgery_history?: string   // سابقه جراحی
 head_trauma?: string     // ضربه به سر
 // اطلاعات تکمیلی
 sleep_info?: string     // مشکلات خواب
 appetite_info?: string    // مشکلات اشتها
 sports_info?: string     // فعالیت ورزشی
 social_info?: string     // روابط اجتماعی
 academic_info?: string    // وضعیت تحصیلی
 parent_behavior?: string   // نحوه برخورد والدین
 family_stress?: string    // استرس‌های خانوادگی
 extra_notes?: string     // توضیحات اضافی
 // ستون‌هایی که فرم مصاحبه ذخیره می‌کند (رشته‌ای/ترکیبی)
 school_info?: string     // نام مدرسه | مؤسسه | پایه | تلفن
 child_conditions?: string  // ویژگی‌های مراجع (فقط اگر متخصص از فرم تفصیلی استفاده کند)
 session_type?: string    // online | offline
 // پاسخ‌های فرم رزرو که ستون اختصاصی ندارند (کاملا دیتایی، از فرم‌بیلدر)
 details?: Record<string, any>
 // وضعیت
 status: string
 created_at: string
 // مرحله‌ی جاری پیش‌ازدرمان (join از GET /cases) — قبلا در تایپ نبود ولی
 // در دیتای واقعی همیشه بود؛ برای چک «آیا الان مرحله‌ی باز دارد» لازم است.
 current_stage_id?: string | null
 current_stage?: CaseStage | null
}

// یک مرحله‌ی پیش‌ازدرمان (مصاحبه/ارزیابی) — هر پرونده هر تعداد از این‌ها می‌تواند داشته باشد
export type CaseStage = {
 id: string
 case_number: string
 stage_type: string
 title?: string | null
 is_first?: boolean
 status: 'awaiting_payment' | 'payment_submitted' | 'awaiting_booking' | 'booked' | 'cancelled'
 price: number
 paid: boolean
 payment_submitted?: boolean
 payment_ref?: string
 session_date?: string
 session_time?: string
 held?: boolean
 // «حاضر نشد» (migration 0054): کنار held می‌نشیند، جایگزینش نیست — جلسه‌ی
 // حضورنیافته هم مصرف‌شده حساب می‌شود و پرونده را آزاد می‌کند.
 no_show?: boolean
 notes?: string
 cancel_notice?: string
 payment_reject_reason?: string
 delay_minutes?: number | null
 resource_id?: string | null
 session_type?: 'online' | 'offline' | null
 meet_channel?: string | null
 cancelled_by?: string | null
 created_at: string
}

export type Booking = {
 id: string
 case_number: string
 client_name: string
 contact_name?: string
 contact2_name?: string
 contact_phone?: string
 contact2_phone?: string
 session_type: 'online' | 'offline'
 office_location?: string
 status: 'pending' | 'confirmed' | 'cancelled'
 doctor_notes?: string
 reject_reason?: string
 current_stage_id?: string | null
 current_stage?: CaseStage | null
 created_at: string
}

export type Package = {
 id: string
 case_number: string
 month: string
 year: string
 primary_sessions: number
 secondary_sessions: number
 primary_session_type: string
 secondary_session_type: string
 primary_office_location?: string | null
 primary_meet_channel?: string | null
 secondary_office_location?: string | null
 secondary_meet_channel?: string | null
 notes: string
 status: string
 price?: number
 paid: boolean
 payment_submitted?: boolean
 payment_ref?: string
 payment_reject_reason?: string
}

export type Session = {
 id: string
 package_id: string
 case_number: string
 title?: string
 session_number: number
 session_date: string
 session_time: string
 session_type: string
 attendee: string
 status: string
 session_goals: string
 session_summary: string
 doctor_notes_private: string
 doctor_note_for_patient: string
 price?: number
 paid: boolean
 payment_submitted?: boolean
 payment_ref?: string
 refund_percent?: number
 refund_card?: string
 payment_reject_reason?: string
 refund_status?: string
 refund_ref?: string
 cancelled_by?: string | null
}
