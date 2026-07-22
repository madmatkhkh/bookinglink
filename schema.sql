-- ═════════════════════════════════════════════════════════════════════════════
-- نوبت‌لینک — اسکیمای کاملِ «ساخت از صفر» (تا migration 0050) — نسخه‌ی اصلاح‌شده
--
-- ⚠️ این فایل همه‌ی جدول‌های اپ را DROP و از نو می‌سازد. فقط روی دیتابیسِ خالی
--    اجرا کن (داده پاک می‌شود). اگر دیتابیست الان چیزی دارد که نمی‌خواهی از دست
--    بدهی، به‌جای این، فایل nobatlink-schema-catchup.sql را اجرا کن (غیرمخرب).
--
-- نسبت به نسخه‌ی قبلی: اشیایی که schema.sql جا انداخته بود (is_test روی tenants،
-- جدول‌های slot_locks / appointment_requests / settlement_items و…) با افزودن کاملِ
-- migrationهای 0029..0044 در انتها اضافه شده‌اند. همه idempotent‌اند.
-- بدون اکستنشن، بدون دستور psql — مستقیم در SQL Editor سوپابیس اجرا می‌شود.
-- ═════════════════════════════════════════════════════════════════════════════

drop table if exists public.psy_cancelled_slots, public.psy_patient_messages cascade;

-- ═════════════════════════════════════════════════════════════════════════════
-- نوبت‌لینک — اسکیمای کامل و یکپارچه (تنها فایل SQL پروژه)
--
-- این فایل جایگزین supabase-schema.sql و کل پوشه‌ی migrations/ (0002 تا 0028) شد.
-- محتوایش دست‌ساز نیست: یک Postgres خالی بالا آمد، اسکیمای قدیمی و بعد همه‌ی
-- migrationها به ترتیب رویش اجرا شدند، و از نتیجه pg_dump گرفته شد. پس این
-- دقیقا همان چیزی است که دیتابیس بعد از اجرای همه‌ی migrationها می‌شد - نه
-- بازنویسی دستی که ممکن است چیزی از قلم بیندازد.
--
-- ⚠️ دو باگی که همین کار لو داد (و در دیتابیس زنده هم بودند):
--   1. supabase-schema.sql روی یک دیتابیس خالی اصلا اجرا نمی‌شد: یک ایندکس روی
--      ستون psy_cases.phone داشت که در migration 0018 به contact_phone تغییر نام
--      داده بود. یعنی آن فایل از 0018 به بعد هیچ‌وقت واقعا تست نشده بود.
--   2. همان فایل 5 جدول (psy_waitlist, psy_reviews, psy_clinical_notes,
--      psy_campaigns, contact_messages)، کلی ستون، و - مهم‌تر از همه - هر دو
--      unique index اسلات (psy_sessions_slot_uniq, psy_stages_slot_uniq) را
--      نداشت. همان‌هایی که کل محافظت در برابر رزرو دوگانه به آن‌ها تکیه دارد.
--
-- ⚠️ این فایل همه‌چیز را DROP می‌کند. روی دیتابیسی که داده‌ی واقعی دارد اجرا نکن.
--
-- ── دو تله‌ای که هنگام تولید این فایل با pg_dump باید حواست باشد ─────────────
--
-- 1) نسخه‌های تازه‌ی pg_dump دو خط `\restrict` و `\unrestrict` اضافه می‌کنند.
--    آن‌ها دستور psql هستند، نه SQL — در ترمینال psql کار می‌کنند ولی SQL Editor
--    سوپابیس متن را مستقیم به سرور می‌فرستد و سرور با
--    `syntax error at or near "\"` ردشان می‌کند. باید حذف شوند.
--
-- 2) هیچ اکستنشنی لازم نیست و هیچ‌جا هم به اکستنشن ارجاع نشده. کلیدها با
--    gen_random_uuid() ساخته می‌شوند که از Postgres 13 داخل خود هسته است.
--    عمدا از uuid_generate_v4() استفاده نشده: آن از اکستنشن uuid-ossp می‌آید و
--    سوپابیس اکستنشن‌ها را در اسکیمای `extensions` نصب می‌کند نه `public` — پس
--    ارجاع qualified که pg_dump تولید می‌کند (`public.uuid_generate_v4()`) آن‌جا
--    وجود ندارد و با `function does not exist` می‌شکند. اگر روزی این فایل را با
--    pg_dump بازتولید کردی و دوباره uuid_generate_v4 دیدی، دستی به
--    gen_random_uuid() برش گردان.
--
-- این فایل روی یک دیتابیس بدون هیچ اکستنشنی (فقط plpgsql) تست شده است.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── پاک‌سازی کامل ────────────────────────────────────────────────────────────
drop table if exists
  public.auth_throttle,
  public.bookings,
  public.client_records,
  public.contact_messages,
  public.ledger_entries,
  public.modules,
  public.niches,
  public.otps,
  public.psy_campaigns,
  public.psy_cases,
  public.psy_clinic_settings,
  public.psy_clinical_notes,
  public.psy_discount_codes,
  public.psy_intake_forms,
  public.psy_packages,
  public.psy_payment_intents,
  public.psy_resource_profiles,
  public.psy_reviews,
  public.psy_schedules,
  public.psy_sessions,
  public.psy_stages,
  public.psy_waitlist,
  public.resources,
  public.schedule_overrides,
  public.service_resources,
  public.services,
  public.settlements,
  public.support_tickets,
  public.tenant_features,
  public.tenant_profiles,
  public.tenants,
  public.weekly_schedules
cascade;

-- Name: auth_throttle; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.auth_throttle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: bookings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    service_id uuid NOT NULL,
    booking_date text NOT NULL,
    booking_time text NOT NULL,
    booking_ts bigint NOT NULL,
    client_name text NOT NULL,
    client_phone text NOT NULL,
    status text DEFAULT 'pending_payment'::text NOT NULL,
    payment_ref text,
    price_snapshot bigint DEFAULT 0 NOT NULL,
    client_note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_sent boolean DEFAULT false NOT NULL,
    CONSTRAINT bookings_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'payment_submitted'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text])))
);

-- Name: client_records; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.client_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    client_phone text NOT NULL,
    client_name text DEFAULT ''::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.contact_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    message text NOT NULL,
    ip text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: ledger_entries; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ledger_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    case_number text,
    purpose text NOT NULL,
    method text NOT NULL,
    direction text DEFAULT 'inflow'::text NOT NULL,
    amount bigint NOT NULL,
    commission_amount bigint DEFAULT 0 NOT NULL,
    doctor_amount bigint DEFAULT 0 NOT NULL,
    source_table text,
    source_id uuid,
    payment_intent_id uuid,
    split_applied boolean DEFAULT false NOT NULL,
    recorded_by text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: modules; Type: TABLE; Schema: public; Owner: -
-- کاتالوگ ماژول‌ها (قابلیت = محصول) — فاز 1 سیستم ماژولار (MODULES.md).
-- seed کامل در migrations/0029_module_catalog.sql

CREATE TABLE public.modules (
    key text NOT NULL,
    display_name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    scope text DEFAULT 'platform'::text NOT NULL,
    depends_on jsonb DEFAULT '[]'::jsonb NOT NULL,
    default_on boolean DEFAULT false NOT NULL,
    enforced boolean DEFAULT false NOT NULL,
    pricing_type text DEFAULT 'included'::text NOT NULL,
    price bigint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

-- Name: niches; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.niches (
    key text NOT NULL,
    display_name text NOT NULL,
    tagline text DEFAULT ''::text NOT NULL,
    icon text DEFAULT ''::text NOT NULL,
    client_label text DEFAULT 'مراجع'::text NOT NULL,
    resource_label text DEFAULT 'ارائه‌دهنده'::text NOT NULL,
    booking_label text DEFAULT 'نوبت'::text NOT NULL,
    default_theme text DEFAULT '13 148 136'::text NOT NULL,
    record_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    default_features jsonb DEFAULT '[]'::jsonb NOT NULL,
    sample_services jsonb DEFAULT '[]'::jsonb NOT NULL,
    setup_price bigint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

-- Name: otps; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone text NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text DEFAULT 'sms'::text NOT NULL
);

-- Name: psy_campaigns; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    channel text NOT NULL,
    segment text NOT NULL,
    message text NOT NULL,
    recipient_count integer DEFAULT 0 NOT NULL,
    sent_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: psy_cases; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_number text NOT NULL,
    client_name text DEFAULT ''::text NOT NULL,
    client_name_en text,
    birth_date text,
    grade text,
    contact_name text,
    contact_phone text,
    contact2_name text,
    contact2_phone text,
    reason text,
    session_type text,
    office_location text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    reject_reason text,
    current_stage_id uuid,
    doctor_notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    resource_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contact_email text,
    contact2_email text
);

-- Name: psy_clinic_settings; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_clinic_settings (
    tenant_id uuid NOT NULL,
    office_locations jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: psy_clinical_notes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_clinical_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_number text NOT NULL,
    resource_id uuid,
    session_id uuid,
    stage_id uuid,
    format text DEFAULT 'soap'::text NOT NULL,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: psy_discount_codes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_discount_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    code text NOT NULL,
    discount_type text DEFAULT 'percent'::text NOT NULL,
    discount_value numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: psy_intake_forms; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_intake_forms (
    resource_id uuid NOT NULL,
    schema jsonb DEFAULT '{"sections": []}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: psy_packages; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_number text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    month text,
    year text,
    primary_sessions integer DEFAULT 0 NOT NULL,
    primary_session_type text DEFAULT 'offline'::text,
    secondary_sessions integer DEFAULT 0 NOT NULL,
    secondary_session_type text DEFAULT 'offline'::text,
    price bigint DEFAULT 0 NOT NULL,
    paid boolean DEFAULT false,
    payment_submitted boolean DEFAULT false,
    payment_ref text,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    resource_id uuid,
    discount_code text,
    original_price bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_reject_reason text
);

-- Name: psy_patient_messages; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_patient_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    case_number text NOT NULL,
    kind text DEFAULT 'general'::text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: psy_payment_intents; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_payment_intents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    case_number text NOT NULL,
    phone text NOT NULL,
    purpose text NOT NULL,
    ref_id uuid,
    amount integer NOT NULL,
    authority text,
    status text DEFAULT 'pending'::text NOT NULL,
    commission_percent numeric,
    commission_amount bigint,
    settlement_sheba text,
    split_applied boolean DEFAULT false NOT NULL,
    discount_code_id uuid,
    discount_code text,
    discount_amount bigint,
    original_amount bigint,
    booking_date text,
    booking_time text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: psy_resource_profiles; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_resource_profiles (
    resource_id uuid NOT NULL,
    badges jsonb DEFAULT '[]'::jsonb NOT NULL,
    session_modes text DEFAULT 'both'::text NOT NULL,
    cards jsonb DEFAULT '[]'::jsonb NOT NULL,
    cancellation_policy jsonb DEFAULT '{"enabled": true, "threshold_hours": 12, "late_refund_percent": 0, "early_refund_percent": 50}'::jsonb NOT NULL,
    payment_methods jsonb DEFAULT '{"online": false, "card_to_card": true}'::jsonb NOT NULL,
    settlement_sheba text DEFAULT ''::text NOT NULL,
    settlement_sheba_holder_name text DEFAULT ''::text NOT NULL,
    pricing jsonb DEFAULT '{"online": 850000, "offline": 1200000}'::jsonb NOT NULL,
    quick_times jsonb DEFAULT '["8:00", "9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]'::jsonb NOT NULL,
    companion_label text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    meet_link text DEFAULT ''::text NOT NULL,
    meet_channels jsonb DEFAULT '[]'::jsonb NOT NULL
);

-- Name: psy_reviews; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    case_number text NOT NULL,
    rating integer NOT NULL,
    comment text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT psy_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

-- Name: psy_schedules; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    date text NOT NULL,
    available_times jsonb DEFAULT '[]'::jsonb NOT NULL,
    slot_types jsonb DEFAULT '{}'::jsonb NOT NULL,
    slot_locs jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_off boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: psy_sessions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_number text NOT NULL,
    package_id uuid,
    title text,
    session_number integer DEFAULT 1 NOT NULL,
    session_date text DEFAULT ''::text NOT NULL,
    session_time text DEFAULT ''::text NOT NULL,
    session_type text,
    attendee text,
    price bigint DEFAULT 0,
    paid boolean DEFAULT false,
    payment_submitted boolean DEFAULT false,
    payment_ref text,
    status text DEFAULT 'confirmed'::text NOT NULL,
    doctor_note_for_patient text,
    delay_minutes integer,
    refund_status text,
    refund_percent integer DEFAULT 0,
    refund_amount bigint DEFAULT 0,
    refund_card text,
    notes text,
    resource_id uuid,
    discount_code text,
    original_price bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_sent boolean DEFAULT false NOT NULL,
    payment_reject_reason text,
    meet_link text,
    cancelled_by text
);

-- Name: psy_stages; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    case_number text NOT NULL,
    stage_type text NOT NULL,
    title text,
    status text DEFAULT 'awaiting_payment'::text NOT NULL,
    price bigint DEFAULT 0 NOT NULL,
    paid boolean DEFAULT false,
    payment_submitted boolean DEFAULT false,
    payment_ref text,
    session_date text DEFAULT ''::text,
    session_time text DEFAULT ''::text,
    held boolean DEFAULT false,
    notes text,
    cancel_notice text,
    delay_minutes integer,
    resource_id uuid,
    discount_code text,
    original_price bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_sent boolean DEFAULT false NOT NULL,
    payment_reject_reason text,
    meet_link text,
    session_type text,
    meet_channel text,
    refund_percent integer,
    refund_status text,
    refund_card text,
    refund_ref text,
    cancelled_by text
);

CREATE TABLE public.psy_cancelled_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    case_number text NOT NULL,
    session_date text NOT NULL,
    session_time text NOT NULL,
    cancelled_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: psy_waitlist; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.psy_waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    case_number text NOT NULL,
    contact_phone text DEFAULT ''::text NOT NULL,
    contact_email text DEFAULT ''::text NOT NULL,
    session_type text,
    note text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: resources; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    avatar_url text,
    is_active boolean DEFAULT true NOT NULL,
    is_selectable boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    phone text,
    owner_session uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: schedule_overrides; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.schedule_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    date text NOT NULL,
    type text NOT NULL,
    start_time text,
    end_time text,
    mode text DEFAULT 'both'::text,
    CONSTRAINT schedule_overrides_mode_check CHECK ((mode = ANY (ARRAY['online'::text, 'in_person'::text, 'both'::text]))),
    CONSTRAINT schedule_overrides_type_check CHECK ((type = ANY (ARRAY['closed'::text, 'custom'::text])))
);

-- Name: service_resources; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.service_resources (
    service_id uuid NOT NULL,
    resource_id uuid NOT NULL
);

-- Name: services; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    duration_minutes integer DEFAULT 60 NOT NULL,
    price bigint DEFAULT 0 NOT NULL,
    mode text DEFAULT 'online'::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT services_duration_minutes_check CHECK (((duration_minutes >= 10) AND (duration_minutes <= 480))),
    CONSTRAINT services_mode_check CHECK ((mode = ANY (ARRAY['online'::text, 'in_person'::text, 'both'::text])))
);

-- Name: settlements; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.settlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    amount bigint NOT NULL,
    method text DEFAULT 'manual'::text NOT NULL,
    covers_from timestamp with time zone,
    covers_to timestamp with time zone,
    reference text,
    note text,
    recorded_by text DEFAULT 'super'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid,
    submitted_by_name text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    admin_reply text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: tenant_features; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.tenant_features (
    tenant_id uuid NOT NULL,
    feature_key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    expires_at timestamp with time zone
);

-- Name: tenant_profiles; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.tenant_profiles (
    tenant_id uuid NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    bio text DEFAULT ''::text NOT NULL,
    avatar_url text,
    theme_color text DEFAULT '13 148 136'::text NOT NULL,
    theme_mode text DEFAULT 'preset'::text NOT NULL,
    logo_url text,
    location_text text DEFAULT ''::text NOT NULL,
    instagram_handle text,
    card_number text DEFAULT ''::text NOT NULL,
    card_holder_name text DEFAULT ''::text NOT NULL,
    CONSTRAINT tenant_profiles_theme_mode_check CHECK ((theme_mode = ANY (ARRAY['preset'::text, 'logo'::text])))
);

-- Name: tenants; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    custom_domain text,
    domain_verified boolean DEFAULT false NOT NULL,
    niche_key text DEFAULT 'psychology'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    owner_phone text NOT NULL,
    owner_session uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_email text,
    CONSTRAINT tenants_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'pro'::text]))),
    CONSTRAINT tenants_slug_check CHECK ((slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'::text)),
    CONSTRAINT tenants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'pending'::text])))
);

-- Name: weekly_schedules; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.weekly_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    weekday integer NOT NULL,
    start_time text NOT NULL,
    end_time text NOT NULL,
    mode text DEFAULT 'both'::text NOT NULL,
    CONSTRAINT weekly_schedules_mode_check CHECK ((mode = ANY (ARRAY['online'::text, 'in_person'::text, 'both'::text]))),
    CONSTRAINT weekly_schedules_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);

-- Name: auth_throttle auth_throttle_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.auth_throttle
    ADD CONSTRAINT auth_throttle_pkey PRIMARY KEY (id);

-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);

-- Name: client_records client_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.client_records
    ADD CONSTRAINT client_records_pkey PRIMARY KEY (id);

-- Name: client_records client_records_tenant_id_client_phone_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.client_records
    ADD CONSTRAINT client_records_tenant_id_client_phone_key UNIQUE (tenant_id, client_phone);

-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);

-- Name: ledger_entries ledger_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_pkey PRIMARY KEY (id);

-- Name: niches niches_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.niches
    ADD CONSTRAINT niches_pkey PRIMARY KEY (key);

-- Name: otps otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_pkey PRIMARY KEY (id);

-- Name: psy_campaigns psy_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_campaigns
    ADD CONSTRAINT psy_campaigns_pkey PRIMARY KEY (id);

-- Name: psy_cases psy_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_cases
    ADD CONSTRAINT psy_cases_pkey PRIMARY KEY (id);

-- Name: psy_cases psy_cases_tenant_id_case_number_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_cases
    ADD CONSTRAINT psy_cases_tenant_id_case_number_key UNIQUE (tenant_id, case_number);

-- Name: psy_clinic_settings psy_clinic_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_clinic_settings
    ADD CONSTRAINT psy_clinic_settings_pkey PRIMARY KEY (tenant_id);

-- Name: psy_clinical_notes psy_clinical_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_clinical_notes
    ADD CONSTRAINT psy_clinical_notes_pkey PRIMARY KEY (id);

-- Name: psy_discount_codes psy_discount_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_discount_codes
    ADD CONSTRAINT psy_discount_codes_pkey PRIMARY KEY (id);

-- Name: psy_intake_forms psy_intake_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_intake_forms
    ADD CONSTRAINT psy_intake_forms_pkey PRIMARY KEY (resource_id);

-- Name: psy_packages psy_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_packages
    ADD CONSTRAINT psy_packages_pkey PRIMARY KEY (id);

-- Name: psy_payment_intents psy_payment_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_payment_intents
    ADD CONSTRAINT psy_payment_intents_pkey PRIMARY KEY (id);

-- Name: psy_resource_profiles psy_resource_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_resource_profiles
    ADD CONSTRAINT psy_resource_profiles_pkey PRIMARY KEY (resource_id);

-- Name: psy_reviews psy_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_reviews
    ADD CONSTRAINT psy_reviews_pkey PRIMARY KEY (id);

-- Name: psy_reviews psy_reviews_tenant_id_case_number_resource_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_reviews
    ADD CONSTRAINT psy_reviews_tenant_id_case_number_resource_id_key UNIQUE (tenant_id, case_number, resource_id);

-- Name: psy_schedules psy_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_schedules
    ADD CONSTRAINT psy_schedules_pkey PRIMARY KEY (id);

-- Name: psy_schedules psy_schedules_tenant_id_resource_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_schedules
    ADD CONSTRAINT psy_schedules_tenant_id_resource_id_date_key UNIQUE (tenant_id, resource_id, date);

-- Name: psy_sessions psy_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_sessions
    ADD CONSTRAINT psy_sessions_pkey PRIMARY KEY (id);

-- Name: psy_stages psy_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_stages
    ADD CONSTRAINT psy_stages_pkey PRIMARY KEY (id);

-- Name: psy_waitlist psy_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_waitlist
    ADD CONSTRAINT psy_waitlist_pkey PRIMARY KEY (id);

-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (id);

-- Name: schedule_overrides schedule_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.schedule_overrides
    ADD CONSTRAINT schedule_overrides_pkey PRIMARY KEY (id);

-- Name: service_resources service_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.service_resources
    ADD CONSTRAINT service_resources_pkey PRIMARY KEY (service_id, resource_id);

-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);

-- Name: settlements settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_pkey PRIMARY KEY (id);

-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);

-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (key);

-- Name: tenant_features tenant_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.tenant_features
    ADD CONSTRAINT tenant_features_pkey PRIMARY KEY (tenant_id, feature_key);

-- Name: tenant_profiles tenant_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.tenant_profiles
    ADD CONSTRAINT tenant_profiles_pkey PRIMARY KEY (tenant_id);

-- Name: tenants tenants_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_custom_domain_key UNIQUE (custom_domain);

-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);

-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);

-- Name: weekly_schedules weekly_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.weekly_schedules
    ADD CONSTRAINT weekly_schedules_pkey PRIMARY KEY (id);

-- Name: auth_throttle_key_time; Type: INDEX; Schema: public; Owner: -

CREATE INDEX auth_throttle_key_time ON public.auth_throttle USING btree (key, created_at);

-- Name: bookings_reminder_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX bookings_reminder_idx ON public.bookings USING btree (booking_date) WHERE (reminder_sent = false);

-- Name: bookings_slot_unique; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX bookings_slot_unique ON public.bookings USING btree (tenant_id, resource_id, booking_date, booking_time) WHERE (status <> 'cancelled'::text);

-- Name: bookings_tenant_id_booking_date_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX bookings_tenant_id_booking_date_idx ON public.bookings USING btree (tenant_id, booking_date);

-- Name: bookings_tenant_id_client_phone_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX bookings_tenant_id_client_phone_idx ON public.bookings USING btree (tenant_id, client_phone);

-- Name: bookings_tenant_id_resource_id_booking_date_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX bookings_tenant_id_resource_id_booking_date_idx ON public.bookings USING btree (tenant_id, resource_id, booking_date);

-- Name: bookings_tenant_id_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX bookings_tenant_id_status_idx ON public.bookings USING btree (tenant_id, status);

-- Name: client_records_tenant_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX client_records_tenant_id_idx ON public.client_records USING btree (tenant_id);

-- Name: ledger_created_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ledger_created_idx ON public.ledger_entries USING btree (created_at);

-- Name: ledger_resource_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ledger_resource_idx ON public.ledger_entries USING btree (resource_id);

-- Name: ledger_source_uniq; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX ledger_source_uniq ON public.ledger_entries USING btree (source_table, source_id, purpose) WHERE ((source_table IS NOT NULL) AND (source_id IS NOT NULL));

-- Name: ledger_tenant_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ledger_tenant_idx ON public.ledger_entries USING btree (tenant_id);

-- Name: otps_phone_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX otps_phone_idx ON public.otps USING btree (phone);

-- Name: psy_cases_resource_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_cases_resource_idx ON public.psy_cases USING btree (tenant_id, resource_id);

-- Name: psy_cases_tenant_id_contact_phone_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_cases_tenant_id_contact_phone_idx ON public.psy_cases USING btree (tenant_id, contact_phone);

-- Name: psy_cases_tenant_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_cases_tenant_id_idx ON public.psy_cases USING btree (tenant_id);

-- Name: psy_cases_tenant_id_resource_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_cases_tenant_id_resource_id_idx ON public.psy_cases USING btree (tenant_id, resource_id);

-- Name: psy_clinical_notes_case_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_clinical_notes_case_idx ON public.psy_clinical_notes USING btree (tenant_id, case_number);

-- Name: psy_discount_codes_uniq; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX psy_discount_codes_uniq ON public.psy_discount_codes USING btree (resource_id, code);

-- Name: psy_packages_resource_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_packages_resource_idx ON public.psy_packages USING btree (tenant_id, resource_id);

-- Name: psy_packages_tenant_id_case_number_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_packages_tenant_id_case_number_idx ON public.psy_packages USING btree (tenant_id, case_number);

-- Name: psy_packages_tenant_id_resource_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_packages_tenant_id_resource_id_idx ON public.psy_packages USING btree (tenant_id, resource_id);

-- Name: psy_payment_intents_tenant_id_authority_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_payment_intents_tenant_id_authority_idx ON public.psy_payment_intents USING btree (tenant_id, authority);

-- Name: psy_reviews_resource_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_reviews_resource_idx ON public.psy_reviews USING btree (resource_id, status);

-- Name: psy_schedules_resource_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_schedules_resource_idx ON public.psy_schedules USING btree (tenant_id, resource_id);

-- Name: psy_schedules_tenant_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_schedules_tenant_id_idx ON public.psy_schedules USING btree (tenant_id);

-- Name: psy_schedules_tenant_id_resource_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_schedules_tenant_id_resource_id_idx ON public.psy_schedules USING btree (tenant_id, resource_id);

-- Name: psy_schedules_tenant_resource_date_key; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX psy_schedules_tenant_resource_date_key ON public.psy_schedules USING btree (tenant_id, resource_id, date);

-- Name: psy_sessions_reminder_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_sessions_reminder_idx ON public.psy_sessions USING btree (session_date) WHERE (reminder_sent = false);

-- Name: psy_sessions_resource_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_sessions_resource_idx ON public.psy_sessions USING btree (tenant_id, resource_id);

-- Name: psy_sessions_slot_uniq; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX psy_sessions_slot_uniq ON public.psy_sessions USING btree (tenant_id, resource_id, session_date, session_time) WHERE ((session_date IS NOT NULL) AND (session_date <> ''::text) AND (session_time IS NOT NULL) AND (session_time <> ''::text));

-- Name: psy_sessions_tenant_id_case_number_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_sessions_tenant_id_case_number_idx ON public.psy_sessions USING btree (tenant_id, case_number);

-- Name: psy_sessions_tenant_id_resource_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_sessions_tenant_id_resource_id_idx ON public.psy_sessions USING btree (tenant_id, resource_id);

-- Name: psy_sessions_tenant_id_session_date_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_sessions_tenant_id_session_date_idx ON public.psy_sessions USING btree (tenant_id, session_date);

-- Name: psy_stages_reminder_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_stages_reminder_idx ON public.psy_stages USING btree (session_date) WHERE (reminder_sent = false);

-- Name: psy_stages_slot_uniq; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX psy_stages_slot_uniq ON public.psy_stages USING btree (tenant_id, resource_id, session_date, session_time) WHERE ((session_date IS NOT NULL) AND (session_date <> ''::text) AND (session_time IS NOT NULL) AND (session_time <> ''::text));

-- Name: psy_stages_tenant_id_case_number_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_stages_tenant_id_case_number_idx ON public.psy_stages USING btree (tenant_id, case_number);

-- Name: psy_stages_tenant_id_resource_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_stages_tenant_id_resource_id_idx ON public.psy_stages USING btree (tenant_id, resource_id);

-- Name: psy_stages_tenant_id_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_stages_tenant_id_status_idx ON public.psy_stages USING btree (tenant_id, status);

-- Name: psy_waitlist_tenant_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX psy_waitlist_tenant_idx ON public.psy_waitlist USING btree (tenant_id, resource_id, status);

-- Name: resources_tenant_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX resources_tenant_id_idx ON public.resources USING btree (tenant_id);

-- Name: resources_tenant_phone_key; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX resources_tenant_phone_key ON public.resources USING btree (tenant_id, phone) WHERE (phone IS NOT NULL);

-- Name: schedule_overrides_tenant_id_resource_id_date_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX schedule_overrides_tenant_id_resource_id_date_idx ON public.schedule_overrides USING btree (tenant_id, resource_id, date);

-- Name: services_tenant_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX services_tenant_id_idx ON public.services USING btree (tenant_id);

-- Name: settlements_resource_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX settlements_resource_idx ON public.settlements USING btree (resource_id);

-- Name: settlements_tenant_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX settlements_tenant_idx ON public.settlements USING btree (tenant_id);

-- Name: support_tickets_status_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX support_tickets_status_idx ON public.support_tickets USING btree (status);

-- Name: support_tickets_tenant_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX support_tickets_tenant_idx ON public.support_tickets USING btree (tenant_id);

-- Name: tenants_custom_domain_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX tenants_custom_domain_idx ON public.tenants USING btree (custom_domain);

-- Name: tenants_niche_key_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX tenants_niche_key_idx ON public.tenants USING btree (niche_key);

-- Name: weekly_schedules_tenant_id_resource_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX weekly_schedules_tenant_id_resource_id_idx ON public.weekly_schedules USING btree (tenant_id, resource_id);

-- Name: bookings bookings_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id);

-- Name: bookings bookings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id);

-- Name: bookings bookings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: client_records client_records_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.client_records
    ADD CONSTRAINT client_records_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: ledger_entries ledger_entries_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id);

-- Name: ledger_entries ledger_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT ledger_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_campaigns psy_campaigns_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_campaigns
    ADD CONSTRAINT psy_campaigns_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: psy_campaigns psy_campaigns_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_campaigns
    ADD CONSTRAINT psy_campaigns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_cases psy_cases_current_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_cases
    ADD CONSTRAINT psy_cases_current_stage_id_fkey FOREIGN KEY (current_stage_id) REFERENCES public.psy_stages(id) ON DELETE SET NULL;

-- Name: psy_cases psy_cases_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_cases
    ADD CONSTRAINT psy_cases_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id);

-- Name: psy_cases psy_cases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_cases
    ADD CONSTRAINT psy_cases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_clinic_settings psy_clinic_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_clinic_settings
    ADD CONSTRAINT psy_clinic_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_clinical_notes psy_clinical_notes_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_clinical_notes
    ADD CONSTRAINT psy_clinical_notes_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: psy_clinical_notes psy_clinical_notes_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_clinical_notes
    ADD CONSTRAINT psy_clinical_notes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.psy_sessions(id) ON DELETE SET NULL;

-- Name: psy_clinical_notes psy_clinical_notes_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_clinical_notes
    ADD CONSTRAINT psy_clinical_notes_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.psy_stages(id) ON DELETE SET NULL;

-- Name: psy_clinical_notes psy_clinical_notes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_clinical_notes
    ADD CONSTRAINT psy_clinical_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_discount_codes psy_discount_codes_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_discount_codes
    ADD CONSTRAINT psy_discount_codes_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: psy_discount_codes psy_discount_codes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_discount_codes
    ADD CONSTRAINT psy_discount_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_intake_forms psy_intake_forms_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_intake_forms
    ADD CONSTRAINT psy_intake_forms_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: psy_packages psy_packages_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_packages
    ADD CONSTRAINT psy_packages_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id);

-- Name: psy_packages psy_packages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_packages
    ADD CONSTRAINT psy_packages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_payment_intents psy_payment_intents_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_payment_intents
    ADD CONSTRAINT psy_payment_intents_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id);

-- Name: psy_payment_intents psy_payment_intents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_payment_intents
    ADD CONSTRAINT psy_payment_intents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_resource_profiles psy_resource_profiles_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_resource_profiles
    ADD CONSTRAINT psy_resource_profiles_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: psy_reviews psy_reviews_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_reviews
    ADD CONSTRAINT psy_reviews_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: psy_reviews psy_reviews_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_reviews
    ADD CONSTRAINT psy_reviews_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_schedules psy_schedules_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_schedules
    ADD CONSTRAINT psy_schedules_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: psy_schedules psy_schedules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_schedules
    ADD CONSTRAINT psy_schedules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_sessions psy_sessions_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_sessions
    ADD CONSTRAINT psy_sessions_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.psy_packages(id) ON DELETE SET NULL;

-- Name: psy_sessions psy_sessions_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_sessions
    ADD CONSTRAINT psy_sessions_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id);

-- Name: psy_sessions psy_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_sessions
    ADD CONSTRAINT psy_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_stages psy_stages_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_stages
    ADD CONSTRAINT psy_stages_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id);

-- Name: psy_stages psy_stages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_stages
    ADD CONSTRAINT psy_stages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: psy_waitlist psy_waitlist_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_waitlist
    ADD CONSTRAINT psy_waitlist_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: psy_waitlist psy_waitlist_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.psy_waitlist
    ADD CONSTRAINT psy_waitlist_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: resources resources_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: schedule_overrides schedule_overrides_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.schedule_overrides
    ADD CONSTRAINT schedule_overrides_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: schedule_overrides schedule_overrides_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.schedule_overrides
    ADD CONSTRAINT schedule_overrides_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: service_resources service_resources_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.service_resources
    ADD CONSTRAINT service_resources_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: service_resources service_resources_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.service_resources
    ADD CONSTRAINT service_resources_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

-- Name: services services_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: settlements settlements_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id);

-- Name: settlements settlements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: support_tickets support_tickets_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id);

-- Name: support_tickets support_tickets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: tenant_features tenant_features_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.tenant_features
    ADD CONSTRAINT tenant_features_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: tenant_profiles tenant_profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.tenant_profiles
    ADD CONSTRAINT tenant_profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: tenants tenants_niche_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_niche_key_fkey FOREIGN KEY (niche_key) REFERENCES public.niches(key);

-- Name: weekly_schedules weekly_schedules_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.weekly_schedules
    ADD CONSTRAINT weekly_schedules_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE CASCADE;

-- Name: weekly_schedules weekly_schedules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.weekly_schedules
    ADD CONSTRAINT weekly_schedules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Name: auth_throttle; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;

-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Name: client_records; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.client_records ENABLE ROW LEVEL SECURITY;

-- Name: contact_messages; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Name: niches; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.niches ENABLE ROW LEVEL SECURITY;

-- Name: otps; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.otps ENABLE ROW LEVEL SECURITY;

-- Name: psy_campaigns; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_campaigns ENABLE ROW LEVEL SECURITY;

-- Name: psy_cases; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_cases ENABLE ROW LEVEL SECURITY;

-- Name: psy_clinic_settings; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_clinic_settings ENABLE ROW LEVEL SECURITY;

-- Name: psy_clinical_notes; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_clinical_notes ENABLE ROW LEVEL SECURITY;

-- Name: psy_intake_forms; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_intake_forms ENABLE ROW LEVEL SECURITY;

-- Name: psy_packages; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_packages ENABLE ROW LEVEL SECURITY;

-- Name: psy_payment_intents; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_payment_intents ENABLE ROW LEVEL SECURITY;

-- Name: psy_resource_profiles; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_resource_profiles ENABLE ROW LEVEL SECURITY;

-- Name: psy_reviews; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_reviews ENABLE ROW LEVEL SECURITY;

-- Name: psy_schedules; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_schedules ENABLE ROW LEVEL SECURITY;

-- Name: psy_sessions; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_sessions ENABLE ROW LEVEL SECURITY;

-- Name: psy_stages; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_stages ENABLE ROW LEVEL SECURITY;

-- Name: psy_waitlist; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.psy_waitlist ENABLE ROW LEVEL SECURITY;

-- Name: resources; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- Name: schedule_overrides; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.schedule_overrides ENABLE ROW LEVEL SECURITY;

-- Name: service_resources; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.service_resources ENABLE ROW LEVEL SECURITY;

-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Name: tenant_features; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

-- Name: tenant_profiles; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.tenant_profiles ENABLE ROW LEVEL SECURITY;

-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Name: weekly_schedules; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.weekly_schedules ENABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════════════════════
-- داده‌ی اولیه — نیچ‌ها (تمپلیت هر نوع کسب‌وکار؛ ساختار = کد، محتوا = دیتا)
-- ═════════════════════════════════════════════════════════════════════════════
INSERT INTO public.niches (key, display_name, tagline, icon, client_label, resource_label, booking_label, default_theme, record_fields, default_features, sample_services, setup_price, is_active, sort_order) VALUES ('psychology', 'روانشناسی و روان‌پزشکی', 'صفحه‌ی نوبت‌دهی اختصاصی برای رواندرمانگرها، مشاورها و روان‌پزشک‌ها', 'brain', 'مراجع', 'درمانگر', 'جلسه', '124 58 237', '[{"key": "diagnosis", "type": "text", "label": "تشخیص / علت مراجعه"}, {"key": "medication", "type": "textarea", "label": "داروهای فعلی"}, {"key": "session_count", "type": "number", "label": "تعداد جلسات گذشته"}, {"key": "notes", "type": "textarea", "label": "یادداشت درمانگر"}]', '[]', '[{"mode": "both", "name": "جلسه‌ی مشاوره‌ی فردی", "price": 0, "duration_minutes": 60}, {"mode": "both", "name": "مصاحبه‌ی اولیه", "price": 0, "duration_minutes": 45}]', 0, true, 1);
INSERT INTO public.niches (key, display_name, tagline, icon, client_label, resource_label, booking_label, default_theme, record_fields, default_features, sample_services, setup_price, is_active, sort_order) VALUES ('psychology_clinic', 'روانشناسی (کلینیک چند‌درمانگر)', 'برای مجموعه‌هایی با چند درمانگر — مدیریت تیم، تقویم مشترک و تسویه‌ی جدا برای هرکدام', 'brain', 'مراجع', 'درمانگر', 'جلسه', '124 58 237', '[]', '[]', '[]', 0, false, 2);
INSERT INTO public.niches (key, display_name, tagline, icon, client_label, resource_label, booking_label, default_theme, record_fields, default_features, sample_services, setup_price, is_active, sort_order) VALUES ('beauty_salon', 'سالن زیبایی', 'رزرو آنلاین برای سالن‌های زیبایی، آرایشگاه‌ها و مراکز مراقبت پوست', 'sparkles', 'مشتری', 'آرایشگر', 'رزرو', '212 83 126', '[{"key": "skin_hair_type", "type": "text", "label": "نوع پوست / مو"}, {"key": "allergies", "type": "textarea", "label": "حساسیت‌ها"}, {"key": "past_services", "type": "textarea", "label": "سرویس‌های قبلی"}, {"key": "notes", "type": "textarea", "label": "یادداشت"}]', '["multi_resource"]', '[{"mode": "in_person", "name": "کوتاهی و اصلاح", "price": 0, "duration_minutes": 45}, {"mode": "in_person", "name": "رنگ و مش", "price": 0, "duration_minutes": 120}, {"mode": "in_person", "name": "میکاپ", "price": 0, "duration_minutes": 90}]', 0, false, 3);

-- seed کاتالوگ ماژول‌ها (قابلیت = محصول) — همسان با migrations/0029_module_catalog.sql
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('pay_online', 'پرداخت آنلاین (زیبال)', 'درگاه زیبال، تایید خودکار، کمیسیون پلتفرم', 'platform', '[]', false, false, 10);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('card_to_card', 'پرداخت کارت‌به‌کارت', 'کارت‌به‌کارت با رسید + تب تایید پرداخت‌ها', 'platform', '[]', false, true, 20);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('patient_self_cancel', 'کنسل توسط مراجع', 'کنسل از پنل مراجع طبق سیاست کنسلی هر متخصص', 'platform', '[]', true, true, 30);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('patient_buy_extra_session', 'خرید جلسه‌ی جایگزین', 'خرید جلسه‌ی اضافه از پنل مراجع', 'platform', '["pay_online|card_to_card"]', true, true, 40);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('discount_codes', 'کدهای تخفیف', 'ساخت و مدیریت کد تخفیف', 'platform', '["pay_online|card_to_card"]', true, true, 50);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('waitlist', 'لیست انتظار', 'ثبت‌نام مراجع وقتی ظرفیت خالی نیست + اطلاع‌رسانی دستی', 'platform', '[]', true, true, 60);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('reviews', 'نظرات و امتیاز مراجعان', 'ثبت نظر توسط مراجع + مدیریت و انتشار', 'platform', '[]', true, true, 70);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('analytics', 'تحلیل کسب‌وکار', 'داشبورد درآمد، no-show، رشد پرونده‌ها', 'platform', '[]', true, true, 80);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('campaigns', 'کمپین پیامک/ایمیل', 'پیام گروهی به مراجعان (سگمنت غیرفعال 30/90 روز)', 'platform', '[]', true, true, 90);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('reminders', 'یادآور پیامکی نوبت', 'ارسال خودکار یادآور قبل از نوبت (cron)', 'platform', '[]', true, false, 100);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('online_meeting', 'جلسه‌ی آنلاین (لینک)', 'لینک Meet/Zoom/WhatsApp/Bale/تلفن برای جلسه‌های آنلاین', 'platform', '[]', true, false, 110);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('multi_therapist', 'حالت کلینیک (چندپرسنلی)', 'ورود مستقل پرسنل، تب پرسنل، انتخابگر متخصص در رزرو', 'platform', '[]', false, true, 120);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, is_active, sort_order) VALUES ('custom_domain', 'دامنه‌ی اختصاصی', 'اتصال دامنه‌ی خود مشتری (هنوز ساخته نشده)', 'platform', '[]', false, false, false, 130);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('psy_stages', 'مراحل پیش‌ازدرمان', 'فلوی آزاد و تکرارپذیر مصاحبه/ارزیابی/دلخواه', 'psychology', '[]', true, false, 210);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('psy_packages', 'پروتکل‌های درمان', 'پکیج جلسات ماهانه', 'psychology', '[]', true, false, 220);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('clinical_notes', 'یادداشت بالینی (SOAP/DAP)', 'یادداشت ساختاریافته‌ی بالینی per-جلسه', 'psychology', '[]', true, false, 230);
INSERT INTO public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) VALUES ('intake_form', 'فرم‌بیلدر رزرو', 'بخش/سوال/منطق شرطی — کاندید ارتقا به سطح پلتفرم', 'psychology', '[]', true, false, 240);
-- ───────────────────────────────────────────────────────────────────────────
-- 0029_module_catalog.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0029 — کاتالوگ ماژول‌ها (قابلیت = محصول) — فاز 1 سند MODULES.md
-- کاملا additive و امن روی دیتابیس زنده. هیچ drop/rename ندارد.
-- اگر شماره‌ی 0029 قبلا محلی استفاده شده، فقط نام فایل را به شماره‌ی آزاد بعدی تغییر بده.

-- 1) کاتالوگ محصولات نوبت‌لینک -----------------------------------------------
create table if not exists public.modules (
  key           text primary key,
  display_name  text not null,
  description   text not null default '',
  scope         text not null default 'platform',   -- 'platform' | 'psychology' | ...
  depends_on    jsonb not null default '[]',         -- آرایه؛ عضو 'a|b' یعنی «حداقل یکی»
  default_on    boolean not null default false,      -- برای tenantهایی که ردیف tenant_features ندارند
  enforced      boolean not null default false,      -- آیا کد واقعا این کلید را گیت می‌کند؟ (فقط اینها در سوپرادمین سوییچ می‌گیرند)
  pricing_type  text not null default 'included',    -- 'included' | 'addon_monthly' | 'addon_once'
  price         bigint not null default 0,           -- تومان، فعلا فقط نمایشی/فاکتور دستی
  is_active     boolean not null default true,       -- خاموش‌کردن ماژول از کل پلتفرم
  sort_order    integer not null default 0
);

-- 2) ارتقای tenant_features (بدون rename) -------------------------------------
alter table public.tenant_features
  add column if not exists source text not null default 'manual';
  -- 'niche_default' | 'addon' | 'trial' | 'manual'
alter table public.tenant_features
  add column if not exists expires_at timestamptz;

-- 3) seed کاتالوگ — کلیدهای زنده‌ی فعلی عینا حفظ شده‌اند ------------------------
-- enforced=true یعنی گارد سرور همین الان (بعد از این جلسه) فعال است؛
-- بقیه با فازهای بعد (سایدبار داینامیک/جداسازی تب‌ها) enforced می‌شوند.
insert into public.modules (key, display_name, description, scope, depends_on, default_on, enforced, sort_order) values
  ('pay_online',                'پرداخت آنلاین (زیبال)',        'درگاه زیبال، تایید خودکار، کمیسیون پلتفرم',                'platform', '[]',                                false /*per-resource فعلا*/, false, 10),
  ('card_to_card',              'پرداخت کارت‌به‌کارت',           'کارت‌به‌کارت با رسید + تب تایید پرداخت‌ها',                 'platform', '[]',                                false, true,  20),
  ('patient_self_cancel',       'کنسل توسط مراجع',              'کنسل از پنل مراجع طبق سیاست کنسلی هر متخصص',               'platform', '[]',                                true,  true,  30),
  ('patient_buy_extra_session', 'خرید جلسه‌ی جایگزین',           'خرید جلسه‌ی اضافه از پنل مراجع',                            'platform', '["pay_online|card_to_card"]',       true,  true,  40),
  ('discount_codes',            'کدهای تخفیف',                  'ساخت و مدیریت کد تخفیف',                                    'platform', '["pay_online|card_to_card"]',       true,  true,  50),
  ('waitlist',                  'لیست انتظار',                  'ثبت‌نام مراجع وقتی ظرفیت خالی نیست + اطلاع‌رسانی دستی',      'platform', '[]',                                true,  true,  60),
  ('reviews',                   'نظرات و امتیاز مراجعان',       'ثبت نظر توسط مراجع + مدیریت و انتشار',                       'platform', '[]',                                true,  true,  70),
  ('analytics',                 'تحلیل کسب‌وکار',               'داشبورد درآمد، no-show، رشد پرونده‌ها',                      'platform', '[]',                                true,  true,  80),
  ('campaigns',                 'کمپین پیامک/ایمیل',            'پیام گروهی به مراجعان (سگمنت غیرفعال 30/90 روز)',            'platform', '[]',                                true,  true,  90),
  ('reminders',                 'یادآور پیامکی نوبت',           'ارسال خودکار یادآور قبل از نوبت (cron)',                     'platform', '[]',                                true,  false, 100),
  ('online_meeting',            'جلسه‌ی آنلاین (لینک)',          'لینک Meet/Zoom/WhatsApp/Bale/تلفن برای جلسه‌های آنلاین',     'platform', '[]',                                true,  false, 110),
  ('multi_therapist',           'حالت کلینیک (چندپرسنلی)',      'ورود مستقل پرسنل، تب پرسنل، انتخابگر متخصص در رزرو',        'platform', '[]',                                false, true,  120),
  ('custom_domain',             'دامنه‌ی اختصاصی',              'اتصال دامنه‌ی خود مشتری (هنوز ساخته نشده)',                  'platform', '[]',                                false, false, 130),
  ('psy_stages',                'مراحل پیش‌ازدرمان',            'فلوی آزاد و تکرارپذیر مصاحبه/ارزیابی/دلخواه',                'psychology', '[]',                              true,  false, 210),
  ('psy_packages',              'پروتکل‌های درمان',             'پکیج جلسات ماهانه',                                          'psychology', '[]',                              true,  false, 220),
  ('clinical_notes',            'یادداشت بالینی (SOAP/DAP)',    'یادداشت ساختاریافته‌ی بالینی per-جلسه',                      'psychology', '[]',                              true,  false, 230),
  ('intake_form',               'فرم‌بیلدر رزرو',               'بخش/سوال/منطق شرطی — کاندید ارتقا به سطح پلتفرم',            'psychology', '[]',                              true,  false, 240)
on conflict (key) do nothing;

-- custom_domain هنوز وجود خارجی ندارد — در کاتالوگ هست ولی از پلتفرم خاموش:
update public.modules set is_active = false where key = 'custom_domain' and enforced = false;


-- ───────────────────────────────────────────────────────────────────────────
-- 0030_slot_locks.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0030 — slot_locks: تنها مرجع ضدتداخل زمان (راه‌حل اساسی برای مقیاس بالا)
-- کاملا additive و امن روی دیتابیس زنده.
--
-- ایده: هر رزرو (مصاحبه/ارزیابی/جلسه‌ی پکیج/جلسه‌ی جایگزین) قبل از هرچیز باید
-- یک ردیف در این جدول بگیرد. UNIQUE روی (tenant, resource, date, time) تضمین
-- می‌کند دو رزرو — از هر جدولی — هرگز یک اسلات را هم‌زمان نگیرند. برنامه دیگر
-- «اول چک کن گرفته‌شده؟» نمی‌کند (که در همزمانی می‌شکند)؛ فقط INSERT می‌زند و
-- 23505 یعنی گرفته‌شده. این اتمی و بین‌جدولی است.
--
-- status:
--   'pending' → قفل موقت (مراجع در حال پرداخت است)؛ با expires_at منقضی می‌شود.
--   'active'  → رزرو نهایی (پرداخت شد / رایگان بود / دکتر تایید کرد).
-- source_table/source_id → این قفل به کدام ردیف واقعی تعلق دارد (psy_stages/psy_sessions).

create table if not exists public.slot_locks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  resource_id   uuid not null,
  session_date  text not null,
  session_time  text not null,
  status        text not null default 'active',      -- 'pending' | 'active'
  source_table  text,                                -- 'psy_stages' | 'psy_sessions'
  source_id     uuid,
  case_number   text,
  expires_at    timestamptz,                         -- فقط برای pending
  created_at    timestamptz not null default now()
);

-- قلب سیستم: یک اسلات فعال/معلق فقط یک‌بار. INSERT دوم → 23505.
create unique index if not exists slot_locks_uniq
  on public.slot_locks (tenant_id, resource_id, session_date, session_time);

-- برای پاک‌سازی سریع قفل‌های منقضی‌شده
create index if not exists slot_locks_expiry
  on public.slot_locks (expires_at) where (status = 'pending');

-- برای یافتن قفل یک رزرو هنگام لغو/آزادسازی
create index if not exists slot_locks_source
  on public.slot_locks (source_table, source_id);

-- ── Backfill: رزروهای موجود که تاریخ/ساعت دارند → قفل active ─────────────────
-- ابتدا مرحله‌ها (مصاحبه/ارزیابی booked)، سپس جلسه‌ها. on conflict do nothing
-- تا اگر تداخل تاریخی وجود دارد (نباید باشد) اجرا نشکند.
insert into public.slot_locks (tenant_id, resource_id, session_date, session_time, status, source_table, source_id, case_number)
select tenant_id, resource_id, session_date, session_time, 'active', 'psy_stages', id, case_number
from public.psy_stages
where session_date is not null and session_date <> '' and session_time is not null and session_time <> ''
  and resource_id is not null
on conflict (tenant_id, resource_id, session_date, session_time) do nothing;

insert into public.slot_locks (tenant_id, resource_id, session_date, session_time, status, source_table, source_id, case_number)
select tenant_id, resource_id, session_date, session_time, 'active', 'psy_sessions', id, case_number
from public.psy_sessions
where session_date is not null and session_date <> '' and session_time is not null and session_time <> ''
  and resource_id is not null
on conflict (tenant_id, resource_id, session_date, session_time) do nothing;

-- ── اسلات‌های انتخاب‌شده‌ی پروتکل قبل از پرداخت (گزینه الف) ──────────────────
-- پرداخت آنلاین پروتکل حالا «اول انتخاب همه‌ی جلسات، بعد پرداخت» است. اسلات‌های
-- انتخاب‌شده اینجا (روی intent) نگه داشته می‌شوند تا callback بعد از پرداخت
-- موفق، جلسات واقعی را از رویشان بسازد.
alter table public.psy_payment_intents
  add column if not exists package_slots jsonb;



-- ───────────────────────────────────────────────────────────────────────────
-- 0031_extra_charges_and_refunds.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0031 — شارژ اضافه (ارسال لینک پرداخت) + بازپرداخت دستی
-- کاملا additive و امن روی دیتابیس زنده. هیچ drop/rename ندارد.
-- اگر شماره‌ی 0031 قبلا محلی استفاده شده، فقط نام فایل را به شماره‌ی آزاد بعدی تغییر بده.

-- 1) شارژ اضافه — دکتر یک مبلغ دلخواه برای پرونده تعریف می‌کند، در پنل مراجع
--    قابل‌پرداخت (آنلاین یا کارت‌به‌کارت) می‌شود. کاملا مستقل از فلوی
--    مصاحبه/ارزیابی/پروتکل — هیچ نوبتی به آن گره نمی‌خورد و قفل اسلات لازم ندارد.
create table if not exists public.psy_extra_charges (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  resource_id           uuid references public.resources(id) on delete set null,
  case_number           text not null,
  title                 text not null,                          -- بابت چه چیزی («هزینه‌ی ۱۵ دقیقه اضافه»)
  amount                bigint not null check (amount > 0),
  status                text not null default 'awaiting_payment', -- awaiting_payment | payment_submitted | paid
  payment_ref           text,                                    -- متن فیش کارت‌به‌کارت
  payment_reject_reason text,
  created_at            timestamptz not null default now()
);
create index if not exists psy_extra_charges_case_idx on public.psy_extra_charges (tenant_id, case_number);

-- 2) بازپرداخت دستی — برای وقتی دکتر (نه به‌خاطر کنسلی نوبت، بلکه به هر دلیل
--    دیگری) مبلغی به مراجع برمی‌گرداند. برخلاف شارژ اضافه، این یک عمل قطعی و
--    همان لحظه است (نه چیزی که مراجع باید تایید/پرداخت کند) — پس همان لحظه‌ی
--    ثبت هم در این جدول هم در ledger_entries (direction='outflow') می‌نشیند.
create table if not exists public.psy_refunds (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  resource_id  uuid references public.resources(id) on delete set null,
  case_number  text not null,
  amount       bigint not null check (amount > 0),
  note         text,
  recorded_by  text,
  created_at   timestamptz not null default now()
);
create index if not exists psy_refunds_case_idx on public.psy_refunds (tenant_id, case_number);


-- ───────────────────────────────────────────────────────────────────────────
-- 0032_payment_terms.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0032 — شرایط و مقررات قبل از پرداخت (اختیاری، به‌ازای هر متخصص)
-- additive و امن روی دیتابیس زنده.

alter table public.psy_resource_profiles
  add column if not exists terms jsonb not null default '{"enabled": false, "extra": ""}'::jsonb;


-- ───────────────────────────────────────────────────────────────────────────
-- 0033_accounting_foundation.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0033 — پایه‌ی حسابداری شفاف: مرجع بانکی، کمیسیون قابل‌تنظیم، تسویه‌ی ردیابی‌شونده
-- کاملا additive و امن روی دیتابیس زنده. هیچ drop/rename/تغییر نوع ندارد.

-- ── تسک ۱: شماره پیگیری بانکی (refNumber زیبال) ──────────────────────────────
-- این عدد را زیبال موقع verify برمی‌گرداند ولی تا الان هیچ‌جا ذخیره نمی‌شد و
-- برای همیشه از دست می‌رفت. برای تطبیق با صورت‌حساب بانکی و ارائه به مالیات
-- حیاتی است. هم روی intent (منبع پرداخت) هم روی ledger (منبع حقیقت حسابداری).
alter table public.psy_payment_intents add column if not exists bank_ref_number text;
alter table public.ledger_entries       add column if not exists bank_ref_number text;

-- ── تسک ۲: کمیسیون سراسری قابل‌تغییر + override به‌ازای هر متخصص ──────────────
-- کمیسیون سراسری تا الان یک ثابت هاردکد در کد (config.ts = 7) بود. برای این‌که
-- بدون دیپلوی مجدد قابل تغییر باشد، به یک ردیف در platform_settings منتقل می‌شود.
-- جدول key/value ساده — هر تنظیم سراسری بعدی هم همین‌جا می‌نشیند.
create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
-- مقدار اولیه = همان ۷٪ فعلی، تا رفتار عوض نشود. اگر ردیف از قبل باشد دست نمی‌خورد.
insert into public.platform_settings (key, value)
  values ('commission_percent', '7'::jsonb)
  on conflict (key) do nothing;

-- override اختیاری per-متخصص: null یعنی «از سراسری تبعیت کن». عددی بین 0 تا 100.
alter table public.psy_resource_profiles
  add column if not exists commission_percent_override numeric;

-- ── تسک ۳: تسویه‌ی ردیابی‌شونده و متصل به تراکنش ─────────────────────────────
-- ستون‌های تازه‌ی settlements: شماره پیگیری بانکی واریز + تاریخ واقعی واریز +
-- وضعیت (تا بشود «ثبت‌شده ولی هنوز واریزنشده» را هم نگه داشت).
alter table public.settlements add column if not exists bank_ref_number text;
alter table public.settlements add column if not exists paid_at         timestamptz;
alter table public.settlements add column if not exists status          text not null default 'paid';

-- جدول واسط: هر تسویه به دقیقا کدام ردیف‌های ledger (تراکنش‌ها) مربوط است.
-- این همان چیزی است که حسابرس می‌خواهد — «این واریز پوشش‌دهنده‌ی این ۴۷ تراکنش».
-- unique روی ledger_entry_id: یک تراکنش نباید در دو تسویه‌ی مختلف حساب شود.
create table if not exists public.settlement_items (
  id              uuid primary key default gen_random_uuid(),
  settlement_id   uuid not null references public.settlements(id) on delete cascade,
  ledger_entry_id uuid not null references public.ledger_entries(id),
  doctor_amount   bigint not null,
  created_at      timestamptz not null default now(),
  unique (ledger_entry_id)
);
create index if not exists settlement_items_settlement_idx on public.settlement_items (settlement_id);


-- ───────────────────────────────────────────────────────────────────────────
-- 0034_refund_bank_ref.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0034 — شماره پیگیری بانکی روی بازپرداخت‌ها
-- additive و امن. متخصص هنگام ثبت بازپرداخت باید شماره پیگیری واریز را بدهد تا
-- در پنل مراجع نمایش داده شود (شفافیت دوطرفه).

alter table public.psy_refunds add column if not exists bank_ref_number text;


-- ───────────────────────────────────────────────────────────────────────────
-- 0035_test_tenants.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0035 — مجموعه‌ی تستی/دمو
-- additive و امن. مجموعه‌هایی که is_test=true دارند:
--  • پرداخت آنلاین‌شان شبیه‌سازی می‌شود (بدون درگاه واقعی، بدون پول واقعی)
--  • از محاسبات مالی واقعی (تسویه، حسابداری سوپر) کنار گذاشته می‌شوند
--  • همه‌جا نشان «تستی» می‌گیرند تا سوءاستفاده نشود

alter table public.tenants add column if not exists is_test boolean not null default false;


-- ───────────────────────────────────────────────────────────────────────────
-- 0036_appointment_requests.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0036 — درخواست نوبت جدید توسط مراجع
-- additive و امن. مراجعی که مرحله‌ی بازی ندارد (تمام‌شده یا برگشته) می‌تواند
-- درخواست نوبت جدید با یک توضیح ثبت کند؛ دکتر تأیید یا رد می‌کند. تأیید یعنی
-- دکتر یک مرحله‌ی جدید برای پرونده می‌سازد (همان فلوی موجود).

create table if not exists public.psy_appointment_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  resource_id   uuid references public.resources(id) on delete set null,
  case_number   text not null,
  note          text,                                  -- توضیح مراجع درباره‌ی درخواست
  status        text not null default 'pending',        -- pending | approved | rejected
  reject_reason text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists psy_appointment_requests_case_idx on public.psy_appointment_requests (tenant_id, case_number);
create index if not exists psy_appointment_requests_pending_idx on public.psy_appointment_requests (tenant_id, status);


-- ───────────────────────────────────────────────────────────────────────────
-- 0037_free_stage_types.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0037 — آزادسازی مرحله‌ها از نوع‌های ثابت (سطح ۳ نوع الف)
-- دیگر «مصاحبه/ارزیابی» نوع اسم‌دار خاص نیستند. هر مرحله فقط عنوان دلخواه دارد.
-- ولی نقش فنی «اولین تماس» حفظ می‌شود — با یک فلگ ساده، نه یک اسم ثابت.

-- فلگ اولین مرحله‌ی پرونده (همان که فرم اولیه می‌سازد). فقط نقش فنی دارد:
-- می‌گوید کدام مرحله «اولین تماس» است، بدون تحمیل نامی به آن.
alter table public.psy_stages add column if not exists is_first boolean not null default false;

-- عنوان پیش‌فرض اولین مرحله برای هر متخصص. مراجع جدید که فرم را پر می‌کند،
-- اولین مرحله‌اش این عنوان را می‌گیرد (مثلا «ویزیت اول» یا «جلسه‌ی مشاوره»).
-- پیش‌فرض «مصاحبه» تا رفتار فعلی حفظ شود.
alter table public.psy_resource_profiles
  add column if not exists first_stage_label text not null default 'مصاحبه';

-- عنوان‌های پیشنهادی مرحله برای هر متخصص (قالب‌های آماده). آرایه‌ی متن ساده؛
-- موقع دادن نوبت، دکتر می‌تواند از این‌ها انتخاب کند یا عنوان تازه بنویسد.
alter table public.psy_resource_profiles
  add column if not exists stage_presets jsonb not null default '[]'::jsonb;


-- ───────────────────────────────────────────────────────────────────────────
-- 0038_patient_messages.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0038 — پیام‌های متخصص برای مراجع (دارو / تجویز / توصیه / عمومی)
-- کاملا additive و امن روی دیتابیس زنده. هیچ drop/rename ندارد.
-- یک کانال یک‌طرفه متخصص→مراجع، جدا از «یادداشت بالینی» (که خصوصی است و هرگز
-- به مراجع نشان داده نمی‌شود) و جدا از «یادداشت برای مراجع» هر جلسه (که به یک
-- جلسه‌ی خاص گره خورده). این‌جا پیام مستقل از جلسه است — مثل تجویز دارو یا توصیه.

create table if not exists public.psy_patient_messages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  resource_id  uuid references public.resources(id) on delete set null,
  case_number  text not null,
  kind         text not null default 'general',   -- medication | prescription | recommendation | general
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists psy_patient_messages_case_idx on public.psy_patient_messages (tenant_id, case_number);


-- ───────────────────────────────────────────────────────────────────────────
-- 0039_clinical_notes_and_stage_session_type.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0039 — دو کار additive و امن روی دیتابیس زنده:
--  (الف) تضمین وجود جدول یادداشت بالینی و ستون‌های session_id/stage_id.
--        بدون این ستون‌ها، یادداشت بالینی گره‌خورده به یک جلسه ذخیره/بازیابی
--        نمی‌شد و دکتر بعد از ثبت آن را نمی‌دید.
--  (ب) افزودن session_type به psy_stages تا نوع هر جلسه (آنلاین/حضوری) مستقل
--        از نوع کلی پرونده تعیین شود. null یعنی از نوع پرونده ارث می‌برد.

create table if not exists public.psy_clinical_notes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  case_number text not null,
  resource_id uuid,
  session_id  uuid,
  stage_id    uuid,
  format      text not null default 'soap',
  fields      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.psy_clinical_notes add column if not exists session_id uuid;
alter table public.psy_clinical_notes add column if not exists stage_id uuid;
create index if not exists psy_clinical_notes_case_idx on public.psy_clinical_notes (tenant_id, case_number);

alter table public.psy_stages add column if not exists session_type text;


-- ───────────────────────────────────────────────────────────────────────────
-- 0040_stage_meet_channel.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0040 — پلتفرم آنلاین انتخابی مراجع برای هر جلسه.
-- مراجع هنگام پرداخت جلسه‌ی آنلاین، از میان روش‌های فعال متخصص (گوگل‌میت/زوم/
-- واتساپ/بله/تلفن) یکی را انتخاب می‌کند و همان روی جلسه ذخیره می‌شود؛ سپس فقط
-- همان روش به او نشان داده می‌شود. null یعنی هنوز انتخاب نکرده (همه‌ی روش‌ها نشان
-- داده می‌شوند — رفتار قبلی).
alter table public.psy_stages add column if not exists meet_channel text;


-- ───────────────────────────────────────────────────────────────────────────
-- 0041_stage_cancellation_refunds.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0041 — کنسلی جلسات تکی (مرحله‌ای) توسط مراجع، هم‌تراز با جلسات پروتکل.
-- مرحله‌ها تا امروز ستون بازپرداخت نداشتند؛ این ستون‌ها همان الگوی psy_sessions را
-- می‌آورند تا کنسلی مراجع + تسویه‌ی بازپرداخت توسط دکتر برای مرحله هم کار کند.
alter table public.psy_stages add column if not exists refund_percent integer;
alter table public.psy_stages add column if not exists refund_status text;
alter table public.psy_stages add column if not exists refund_card text;
alter table public.psy_stages add column if not exists refund_ref text;


-- ───────────────────────────────────────────────────────────────────────────
-- 0042_cancelled_slots.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0042 — فلگ نوبت‌های لغوشده در برنامه‌ی نوبت‌های متخصص.
-- وقتی نوبتی لغو می‌شود، زمان خود جلسه پاک می‌شود (تا مراجع بتواند دوباره وقت
-- بگیرد)؛ برای همین برای نشان‌دادن فلگ روی همان خانه‌ی زمانی، یک رکورد سبک جدا
-- نگه می‌داریم: چه کسی لغو کرده (مطب/مراجع) و چه زمانی. آزاد/بلاک‌بودن اسلات با
-- slot_locks مدیریت می‌شود (لغو توسط مطب → قفل می‌ماند و بلاک؛ لغو توسط مراجع →
-- قفل آزاد می‌شود).
create table if not exists public.psy_cancelled_slots (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  resource_id   uuid,
  case_number   text not null,
  session_date  text not null,
  session_time  text not null,
  cancelled_by  text not null,   -- 'doctor' | 'client'
  created_at    timestamptz not null default now()
);
create index if not exists psy_cancelled_slots_lookup
  on public.psy_cancelled_slots (tenant_id, resource_id, session_date);


-- ───────────────────────────────────────────────────────────────────────────
-- 0043_row_cancelled_by.sql
-- ───────────────────────────────────────────────────────────────────────────
-- 0043 — نشانه‌ی اینکه یک جلسه/مرحله را چه کسی کنسل کرده، تا برچسب درست
-- («کنسل توسط مراجع») نشان داده شود و کنسل پرداخت‌نشده دیگر «منتظر پرداخت» نماند.
alter table public.psy_stages   add column if not exists cancelled_by text;
alter table public.psy_sessions add column if not exists cancelled_by text;


-- ───────────────────────────────────────────────────────────────────────────
-- 0044_package_location_channel.sql
-- ───────────────────────────────────────────────────────────────────────────
-- پروتکل درمان (پکیج): متخصص علاوه بر آنلاین/حضوری، «نوع» را هم مشخص می‌کند —
-- برای حضوری «کدام محل» و برای آنلاین «کدام کانال». per-پروتکل و برای هر دو
-- دسته (مراجع/همراه) جدا. مقادیر متنی و nullable (additive، امن برای دیتای زنده):
--   office_location = عنوان محل (مثل office_locations[].title)
--   meet_channel    = متد کانال (مثل MeetChannel.method: 'whatsapp'، 'google_meet'، ...)
ALTER TABLE public.psy_packages
  ADD COLUMN IF NOT EXISTS primary_office_location text,
  ADD COLUMN IF NOT EXISTS primary_meet_channel text,
  ADD COLUMN IF NOT EXISTS secondary_office_location text,
  ADD COLUMN IF NOT EXISTS secondary_meet_channel text;

-- ───────────────────────────────────────────────────────────────────────────
-- 0045 — فاز P1 قیمت‌گذاری (MODULES.md بخش 9): پلن‌ها + grandfathering
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent. هیچ رفتاری برای tenantهای موجود عوض نمی‌شود:
--   1) constraint پلن باز می‌شود تا 'base' و 'team' هم مجاز باشند
--      ('free' قدیمی می‌ماند و در کد alias پلن پایه است — UPDATE روی دیتای زنده نداریم).
--   2) دو اصلاح نمایشی کاتالوگ (بخش 9.2) — کلیدها دست‌نخورده.
--   3) grandfathering (بخش 9.7): برای هر tenant موجود، به‌ازای هر ماژول
--      پلتفرمی که امروز از راه default_on روشن است، یک ردیف صریح کاشته
--      می‌شود تا با اعمال preset پلن‌ها چیزی از دست ندهند.
--   4) کلید 'plans_enforced' در platform_settings: تا وقتی true نشده، کد
--      preset پلن را اصلا اعمال نمی‌کند (دیپلوی کد قبل از این migration
--      هیچ‌چیز را نمی‌شکند — همان الگوی fail-open ماژول‌ها).
-- ترتیب حل بعد از این migration (بخش 9.8):
--   is_active=false → خاموش ← ردیف tenant_features ← preset پلن ← default_on
-- ───────────────────────────────────────────────────────────────────────────

-- 1) پلن‌های جدید در constraint (free قدیمی حفظ می‌شود)
alter table public.tenants drop constraint if exists tenants_plan_check;
alter table public.tenants add constraint tenants_plan_check
  check (plan = any (array['free'::text, 'base'::text, 'pro'::text, 'team'::text]));

-- 2) اصلاح نمایشی کاتالوگ — واژگان نیچی از لایه‌ی پلتفرم حذف (بخش 9.2)
update public.modules set
  display_name = 'چندپرسنلی (تیم)',
  description  = 'ورود مستقل پرسنل، تب پرسنل، انتخابگر پرسنل در رزرو'
  where key = 'multi_therapist';
update public.modules set description = 'کنسل از پنل مشتری طبق سیاست کنسلی هر مجموعه'
  where key = 'patient_self_cancel';
update public.modules set description = 'خرید جلسه‌ی اضافه از پنل مشتری'
  where key = 'patient_buy_extra_session';
update public.modules set description = 'ثبت‌نام مشتری وقتی ظرفیت خالی نیست + اطلاع‌رسانی دستی'
  where key = 'waitlist';
update public.modules set display_name = 'نظرات و امتیاز مشتریان',
  description = 'ثبت نظر توسط مشتری + مدیریت و انتشار'
  where key = 'reviews';
update public.modules set description = 'پیام گروهی به مشتریان (سگمنت غیرفعال 30/90 روز)'
  where key = 'campaigns';

-- 3) grandfathering — ردیف صریح برای وضعیت روشن امروز (فقط ماژول‌های platform؛
--    ماژول‌های نیچی از preset پلن عبور نمی‌کنند و default_on برایشان کافی است).
--    ON CONFLICT: ردیف موجود (سوییچ دستی سوپرادمین) هرگز بازنویسی نمی‌شود.
insert into public.tenant_features (tenant_id, feature_key, enabled, source)
select t.id, m.key, true, 'manual'
from public.tenants t
cross join public.modules m
where m.scope = 'platform' and m.default_on = true and m.is_active = true
on conflict (tenant_id, feature_key) do nothing;

-- 4) از این به بعد کد اجازه‌ی اعمال preset پلن را دارد
insert into public.platform_settings (key, value)
  values ('plans_enforced', 'true'::jsonb)
  on conflict (key) do nothing;


-- ───────────────────────────────────────────────────────────────────────────
-- 0046 — فاز P2 قیمت‌گذاری (MODULES.md بخش 9.4 و 9.6): کارمزد سقف‌دار per-پلن
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent. تا این migration اجرا نشده، کد جدید عینا مدل قدیمی
-- (کمیسیون سراسری/override) را اجرا می‌کند و ستون‌های تفکیک را نمی‌نویسد —
-- استقرار از هر دو جهت امن است.
--
--   1) ستون‌های تفکیک کارمزد (پایه + مالیات بر ارزش افزوده) روی intent و ledger.
--      commission_amount همچنان «کل کسر» می‌ماند (پایه+VAT) — معنای ستون قدیمی
--      و همه‌ی گزارش‌های مالی موجود دست نمی‌خورد.
--   2) ردیف 'plan_fees' در platform_settings: درصد/کف/سقف per-پلن + نرخ VAT.
--      ساختار آینه‌ی خود زیبال (1%، کف 2000، سقف 20000 + 10% مالیات).
--      'free' قدیمی در کد alias پلن پایه است. تغییر عددها بدون دیپلوی: همین
--      ردیف را در SQL Editor ویرایش کن.
--
-- توجه: override per-متخصص (psy_resource_profiles.commission_percent_override)
-- همچنان برنده است و مدل قدیمی خالص می‌ماند (بدون کف/سقف/تفکیک) — معامله‌های
-- خاص موجود، از جمله معافیت (0)، عینا حفظ می‌شوند.
-- ───────────────────────────────────────────────────────────────────────────

-- 1) تفکیک پایه/مالیات کارمزد
alter table public.psy_payment_intents
  add column if not exists fee_base_amount bigint,
  add column if not exists fee_vat_amount  bigint;
alter table public.ledger_entries
  add column if not exists fee_base_amount bigint,
  add column if not exists fee_vat_amount  bigint;

-- 2) پارامترهای کارمزد per-پلن (تومان؛ درصدها بدون احتساب VAT اعلام می‌شوند)
insert into public.platform_settings (key, value) values ('plan_fees', '{
  "vat_percent": 10,
  "plans": {
    "base": {"pct": 3,   "floor": 3000, "cap": 120000},
    "pro":  {"pct": 2.5, "floor": 3000, "cap": 100000},
    "team": {"pct": 2,   "floor": 3000, "cap": 80000}
  }
}'::jsonb)
on conflict (key) do nothing;


-- ───────────────────────────────────────────────────────────────────────────
-- 0047 — فاز P3 قیمت‌گذاری (MODULES.md بخش 9.3): سهمیه‌ی پیامک + اعتبار شارژی
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent. تا این migration اجرا نشده، کد جدید ارسال پیامک را
-- نه می‌شمارد نه محدود می‌کند (fail-open) — استقرار از هر دو جهت امن.
--
-- مدل (فلسفه‌ی ledger — فقط INSERT):
--   sms_log:     یک ردیف به‌ازای هر پیامک واقعا ارسال‌شده.
--                charged: 'quota' (سهمیه‌ی ماه جلالی پلن) | 'credit' (بسته‌ی
--                شارژ) | 'over' (پیامک حیاتی مثل OTP که با اتمام هر دو باز هم
--                فرستاده شد — OTP هرگز بلاک نمی‌شود).
--   sms_credits: هر شارژ دستی سوپرادمین یک ردیف (منفی = اصلاح اشتباه).
--                مانده = sum(amount) - count(sms_log با charged='credit').
--
-- سیاست بلاک در کد: فقط ارسال‌های اختیاری (campaign / waitlist / reminder)
-- با اتمام سهمیه+اعتبار متوقف می‌شوند.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.sms_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  kind       text not null,   -- 'otp' | 'reminder' | 'campaign' | 'waitlist'
  charged    text not null default 'quota',  -- 'quota' | 'credit' | 'over'
  created_at timestamptz not null default now()
);
create index if not exists sms_log_tenant_month
  on public.sms_log (tenant_id, charged, created_at);

create table if not exists public.sms_credits (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  amount     integer not null,       -- تعداد پیامک؛ منفی مجاز (اصلاح)
  note       text,
  created_by text not null default 'super',
  created_at timestamptz not null default now()
);
create index if not exists sms_credits_tenant on public.sms_credits (tenant_id);

-- سهمیه‌ی ماهانه‌ی هر پلن (ماه جلالی) — بخش 9.3؛ 'free' قدیمی در کد = پایه.
-- تغییر عددها بدون دیپلوی: همین ردیف را در SQL Editor ویرایش کن.
insert into public.platform_settings (key, value)
  values ('plan_sms_quotas', '{"base": 150, "pro": 500, "team": 1500}'::jsonb)
  on conflict (key) do nothing;


-- ───────────────────────────────────────────────────────────────────────────
-- 0048 — فاز P4 قیمت‌گذاری (MODULES.md بخش 9.5): حق اشتراک ماهانه از تسویه
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent — هیچ تغییر اسکیمایی ندارد (ستون‌های تفکیک از 0046
-- بازاستفاده می‌شوند). فقط پارامترهای قیمت پلن seed می‌شود.
--
-- ⚠️ عمدا enabled=false: تا وقتی خودت آگاهانه true نکنی، cron اشتراک
-- (/api/cron/subscriptions، هر روز 04:30 ایران) هیچ tenantی را شارژ نمی‌کند.
-- روشن‌کردن بیلینگ باید تصمیم باشد، نه اثر جانبی دیپلوی — به‌خصوص که
-- tenantهای قدیمی همه plan='free' (معادل پایه) دارند.
--
-- قیمت‌ها تومان و «بدون احتساب مالیات» (بخش 9.6)؛ نرخ مالیات از
-- plan_fees.vat_percent خوانده می‌شود (یک منبع، بدون drift). قیمت <= 0 یا
-- حذف کلید یک پلن = آن پلن شارژ نمی‌شود. تغییرها بدون دیپلوی از SQL Editor:
--   update platform_settings set value = jsonb_set(value, '{enabled}', 'true')
--     where key = 'plan_prices';
--
-- مکانیزم ثبت: هر ماه جلالی یک entry با purpose='subscription_fee' در
-- ledger_entries (amount=0، commission=کل با مالیات، doctor_amount=منفی همان،
-- source_id = UUID قطعی از tenant+ماه → ایندکس یکتای ledger_source_uniq ثبت
-- تکراری را ساختارا غیرممکن می‌کند). قلم منفی در /super/settlements خودکار از
-- «معوق» متخصص کم و همراه تسویه‌ی بعدی وصول/لینک می‌شود. اگر معوق کمتر از
-- اشتراک باشد، جمع منفی/صفر می‌شود و ثبت تسویه رد می‌شود — اشتراک می‌ماند تا
-- تراکنش‌های بعدی پوششش بدهند (وصول فقط از محل تسویه، فاز اول بدون پیش‌پرداخت).
-- ───────────────────────────────────────────────────────────────────────────

insert into public.platform_settings (key, value) values ('plan_prices', '{
  "enabled": false,
  "base": 390000,
  "pro":  890000,
  "team": 1900000
}'::jsonb)
on conflict (key) do nothing;


-- ───────────────────────────────────────────────────────────────────────────
-- 0049 — فاز P5 قیمت‌گذاری (MODULES.md بخش 9.6/9.9): جدول فاکتورها
-- ───────────────────────────────────────────────────────────────────────────
-- additive و idempotent. فاکتور = صورت‌حساب ماه جلالی هر tenant، ساخته‌شده از
-- روی ledger (که تغییرناپذیر است، پس اعداد فاکتور پایدارند): حق اشتراک +
-- جمع کارمزدهای تراکنش همان ماه، همه با تفکیک پایه/مالیات بر ارزش افزوده.
--
-- صدور: در همان cron بیلینگ (/api/cron/subscriptions) — برای «ماه قبل» (که
-- کامل شده) اگر فاکتوری با اقلام غیرصفر قابل‌ساخت باشد و قبلا صادر نشده باشد.
-- idempotent با unique (tenant_id, period_key).
--
-- نکته: کارمزدهای «مدل قدیمی» (override per-متخصص یا پیش از 0046) ستون تفکیک
-- ندارند و روی فاکتور نمی‌آیند — فاکتور فقط مدل جدید را پوشش می‌دهد (مستند در
-- چنج‌لاگ). status فعلا همیشه 'issued' است؛ چرخه‌ی paid با تسویه در فاز بعد.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  period_key         text not null,                -- '1405/04' (ماه جلالی)
  status             text not null default 'issued',
  vat_rate           numeric not null default 10,  -- نرخ لحظه‌ی صدور (دیتا، نه هاردکد)
  subscription_base  bigint not null default 0,
  subscription_vat   bigint not null default 0,
  txn_fee_base       bigint not null default 0,
  txn_fee_vat        bigint not null default 0,
  txn_count          integer not null default 0,
  total_base         bigint not null default 0,
  total_vat          bigint not null default 0,
  total              bigint not null default 0,
  created_at         timestamptz not null default now()
);
create unique index if not exists invoices_tenant_period_uniq
  on public.invoices (tenant_id, period_key);


-- ───────────────────────────────────────────────────────────────────────────
-- 0050 — بازنگری کارمزد (حذف سقف) + برندسازی درگاه در کاتالوگ
-- ───────────────────────────────────────────────────────────────────────────
-- additive/اصلاحی و idempotent. تصمیم 1405/04/30 (بازنگری همان‌روز بخش 9.4):
--   1) کارمزد تراکنش فقط «کف» دارد، بدون سقف — کلیدهای cap از ردیف plan_fees
--      حذف می‌شوند (کد از قبل cap را نادیده می‌گیرد؛ این فقط پاک‌سازی است).
--   2) برندسازی: نام نمایشی درگاه در کاتالوگ ماژول‌ها «درگاه پرداخت نوبت‌لینک»
--      می‌شود (نام PSP زیرساختی از سطح کاربر حذف؛ کلید pay_online دست‌نخورده).
-- ───────────────────────────────────────────────────────────────────────────

-- 1) حذف سقف‌ها از plan_fees (اگر ردیف/کلید نبود، بی‌اثر)
update public.platform_settings
set value = ((value #- '{plans,base,cap}') #- '{plans,pro,cap}') #- '{plans,team,cap}',
    updated_at = now()
where key = 'plan_fees';

-- 2) برندسازی درگاه در کاتالوگ
update public.modules set
  display_name = 'درگاه پرداخت نوبت‌لینک',
  description  = 'درگاه پرداخت آنلاین اختصاصی، تایید خودکار، کارمزد پلتفرم'
where key = 'pay_online';


-- ───────────────────────────────────────────────────────────────────────────
-- 0051 — هم‌ترازسازی constraint نشانی (slug) با قاعده‌ی واقعی محصول
-- ───────────────────────────────────────────────────────────────────────────
-- constraint نسخه‌ی v1 فقط [a-z0-9-] را می‌پذیرفت، ولی SLUG_PATTERN در
-- src/lib/config.ts (و متنی که به کاربر نشان می‌دهیم) جداکننده‌های _ و - را
-- مجاز می‌داند. نتیجه: ثبت‌نام با نشانی‌ای مثل dr_matin در insert نهایی می‌شکست.
-- قاعده‌ی زیر دقیقا معادل SLUG_PATTERN است. NOT VALID عمدی است تا ردیف‌های
-- قدیمی احتمالی (مثلا a--b) مهاجرت را روی دیتابیس زنده نشکنند.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.tenants drop constraint if exists tenants_slug_check;
alter table public.tenants add constraint tenants_slug_check
  check (
    slug ~ '^[a-z0-9][a-z0-9_-]{1,38}[a-z0-9]$'
    and slug !~ '[_-]{2}'
  ) not valid;
