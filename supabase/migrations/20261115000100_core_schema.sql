-- ByteVoice Bangla — core schema
-- All timestamps are timestamptz (stored UTC, displayed in Asia/Dhaka).
-- Writes happen only through Edge Functions using the service role.
-- Reads are restricted to authenticated clinic staff (see staff table + RLS).

create extension if not exists pgcrypto;

-- ───────────────────────── Reference data ─────────────────────────

create table public.clinics (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name_bn       text not null,
  name_en       text not null,
  phone         text not null,
  address_bn    text not null,
  address_en    text not null,
  directions_bn text,
  timezone      text not null default 'Asia/Dhaka',
  slot_minutes  int  not null default 30 check (slot_minutes between 10 and 120),
  created_at    timestamptz not null default now()
);

create table public.doctors (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  full_name_bn text not null,
  full_name_en text not null,
  title_bn     text not null,           -- e.g. "জেনারেল ডেন্টিস্ট"
  title_en     text not null,
  active       boolean not null default true
);

-- Weekly opening pattern per doctor. weekday: 0=Sunday … 6=Saturday (JS/Postgres dow).
create table public.doctor_schedules (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctors(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time)
);

create table public.services (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  code         text not null,          -- machine key used by the voice agent: scaling, filling …
  name_bn      text not null,
  name_en      text not null,
  fee_from_bdt int  not null check (fee_from_bdt >= 0),
  fee_to_bdt   int  check (fee_to_bdt is null or fee_to_bdt >= fee_from_bdt),
  duration_min int  not null default 30,
  prep_bn      text,                   -- how to prepare for the visit
  unique (clinic_id, code)
);

-- ───────────────────────── People ─────────────────────────

create table public.patients (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  full_name_bn text not null,           -- as spoken, Bangla script
  full_name_en text,                    -- romanised for search / SMS
  phone_e164   text not null check (phone_e164 ~ '^\+8801[3-9][0-9]{8}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (clinic_id, phone_e164)        -- one patient per phone per clinic
);

-- Clinic staff who may log in to the portal.
create table public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  full_name  text not null,
  role       text not null default 'reception' check (role in ('reception','manager','admin')),
  created_at timestamptz not null default now()
);

-- ───────────────────────── Calls ─────────────────────────

create table public.calls (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  patient_id    uuid references public.patients(id) on delete set null,
  channel       text not null default 'web' check (channel in ('web','phone')),
  direction     text not null default 'inbound' check (direction in ('inbound','outbound')),
  started_at    timestamptz not null default now(),
  connected_at  timestamptz,
  ended_at      timestamptz,
  duration_s    int generated always as (
                  case when ended_at is null then null
                       else greatest(0, extract(epoch from (ended_at - started_at))::int) end
                ) stored,
  status        text not null default 'in_progress' check (status in
                  ('in_progress','booked','rescheduled','cancelled','enquiry','follow_up','incomplete','failed')),
  end_reason    text check (end_reason in ('caller_hangup','agent_ended','error','timeout','abandoned')),
  summary_bn    text,
  summary_en    text,
  language      text not null default 'bn-BD',
  model         text,                  -- voice model used for this call
  recording_url text,                  -- not recorded in the demo (privacy); column reserved
  -- Per-call secret so only the browser that started the call can write to it.
  session_secret_hash text not null,
  error_detail  text,
  finalized_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index calls_clinic_started_idx on public.calls (clinic_id, started_at desc);
create index calls_status_idx on public.calls (status);

create table public.transcript_turns (
  id         bigint generated always as identity primary key,
  call_id    uuid not null references public.calls(id) on delete cascade,
  seq        int  not null,                     -- order within the call
  speaker    text not null check (speaker in ('agent','caller','system')),
  text_bn    text not null,                     -- original (Bangla / mixed) as transcribed
  text_en    text,                              -- English gloss, filled at finalisation
  offset_ms  int  not null check (offset_ms >= 0),  -- ms since call start
  ts         timestamptz not null,              -- absolute time of the turn
  interrupted boolean not null default false,   -- agent turn cut off by caller barge-in
  unique (call_id, seq)
);

-- One structured record per call. Raw values are kept next to normalised ones
-- so staff can see exactly what was heard and what was stored.
create table public.call_extractions (
  call_id              uuid primary key references public.calls(id) on delete cascade,
  intent               text check (intent in ('book','reschedule','cancel','enquiry','callback','other')),
  patient_name_bn      text,
  patient_name_en      text,
  phone_raw            text,              -- as spoken/typed, may contain Bangla digits
  phone_e164           text check (phone_e164 is null or phone_e164 ~ '^\+8801[3-9][0-9]{8}$'),
  phone_valid          boolean,
  reason_for_visit     text,              -- caller's words, short
  service_code         text,              -- normalised to services.code
  doctor_id            uuid references public.doctors(id) on delete set null,
  preferred_text_raw   text,              -- e.g. "সামনের রবিবার সন্ধ্যায়"
  preferred_date       date,
  preferred_time       time,
  outcome              text check (outcome in ('booked','rescheduled','cancelled','enquiry','follow_up','incomplete','failed')),
  needs_human          boolean not null default false,
  confirmed_by_caller  boolean not null default false,
  notes                text,
  validation           jsonb not null default '{}'::jsonb,   -- per-field validation results
  extracted_by         text,              -- model name
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.appointments (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  doctor_id   uuid not null references public.doctors(id),
  service_id  uuid references public.services(id),
  call_id     uuid references public.calls(id) on delete set null,      -- call that created it
  updated_by_call_id uuid references public.calls(id) on delete set null, -- last call that changed it
  slot_start  timestamptz not null,
  slot_end    timestamptz not null,
  status      text not null default 'booked' check (status in ('booked','rescheduled','cancelled','completed','no_show')),
  reason      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (slot_end > slot_start)
);
-- No double booking: a doctor can hold only one active appointment per start time.
create unique index appointments_no_double_booking
  on public.appointments (doctor_id, slot_start)
  where status in ('booked','rescheduled');
create index appointments_patient_idx on public.appointments (patient_id, slot_start desc);

create table public.callbacks (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  call_id     uuid references public.calls(id) on delete cascade,
  patient_id  uuid references public.patients(id) on delete set null,
  phone_e164  text,
  reason      text not null,
  category    text not null default 'other' check (category in ('medical_question','billing','complaint','emergency','other')),
  priority    text not null default 'normal' check (priority in ('normal','urgent')),
  status      text not null default 'open' check (status in ('open','done')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- Audit log of everything the agent did during a call (tool calls, errors).
create table public.call_events (
  id         bigint generated always as identity primary key,
  call_id    uuid not null references public.calls(id) on delete cascade,
  type       text not null,          -- tool:check_availability, tool:book_appointment, error, state …
  payload    jsonb not null default '{}'::jsonb,
  result     jsonb,
  ok         boolean not null default true,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index call_events_call_idx on public.call_events (call_id, id);

-- Demo requests from the landing page form.
create table public.demo_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  organisation text not null check (char_length(organisation) between 2 and 160),
  phone       text not null check (char_length(phone) between 6 and 30),
  org_type    text check (org_type in ('dental','diagnostic','hospital','other')),
  message     text check (message is null or char_length(message) <= 1000),
  created_at  timestamptz not null default now()
);

-- updated_at triggers
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger patients_touch before update on public.patients for each row execute function public.touch_updated_at();
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();
create trigger extractions_touch before update on public.call_extractions for each row execute function public.touch_updated_at();
