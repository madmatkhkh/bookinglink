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
    meet_link text
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
    refund_ref text
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
