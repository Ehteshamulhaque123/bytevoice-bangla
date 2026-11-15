-- Row Level Security: portal users can only read data for the clinic they belong to.
-- No insert/update/delete policies for staff on call data: the call pipeline
-- (Edge Functions, service role) is the single writer, which keeps the record trustworthy.

create or replace function public.is_clinic_staff(p_clinic uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.clinic_id = p_clinic);
$$;
revoke all on function public.is_clinic_staff(uuid) from public;
grant execute on function public.is_clinic_staff(uuid) to authenticated;

alter table public.clinics          enable row level security;
alter table public.doctors          enable row level security;
alter table public.doctor_schedules enable row level security;
alter table public.services         enable row level security;
alter table public.patients         enable row level security;
alter table public.staff            enable row level security;
alter table public.calls            enable row level security;
alter table public.transcript_turns enable row level security;
alter table public.call_extractions enable row level security;
alter table public.appointments     enable row level security;
alter table public.callbacks        enable row level security;
alter table public.call_events      enable row level security;
alter table public.demo_requests    enable row level security;

create policy staff_read_clinic   on public.clinics   for select to authenticated using (public.is_clinic_staff(id));
create policy staff_read_doctors  on public.doctors   for select to authenticated using (public.is_clinic_staff(clinic_id));
create policy staff_read_sched    on public.doctor_schedules for select to authenticated
  using (exists (select 1 from public.doctors d where d.id = doctor_id and public.is_clinic_staff(d.clinic_id)));
create policy staff_read_services on public.services  for select to authenticated using (public.is_clinic_staff(clinic_id));
create policy staff_read_patients on public.patients  for select to authenticated using (public.is_clinic_staff(clinic_id));
create policy staff_read_self     on public.staff     for select to authenticated using (user_id = auth.uid());
create policy staff_read_calls    on public.calls     for select to authenticated using (public.is_clinic_staff(clinic_id));
create policy staff_read_turns    on public.transcript_turns for select to authenticated
  using (exists (select 1 from public.calls c where c.id = call_id and public.is_clinic_staff(c.clinic_id)));
create policy staff_read_extr     on public.call_extractions for select to authenticated
  using (exists (select 1 from public.calls c where c.id = call_id and public.is_clinic_staff(c.clinic_id)));
create policy staff_read_appts    on public.appointments for select to authenticated using (public.is_clinic_staff(clinic_id));
create policy staff_read_cb       on public.callbacks for select to authenticated using (public.is_clinic_staff(clinic_id));
-- Staff may mark a callback as done (the only staff-side write).
create policy staff_update_cb     on public.callbacks for update to authenticated
  using (public.is_clinic_staff(clinic_id)) with check (public.is_clinic_staff(clinic_id));
create policy staff_read_events   on public.call_events for select to authenticated
  using (exists (select 1 from public.calls c where c.id = call_id and public.is_clinic_staff(c.clinic_id)));
-- Landing-page demo form: anyone may submit, only staff may read.
create policy anon_insert_demo    on public.demo_requests for insert to anon, authenticated with check (true);
create policy staff_read_demo     on public.demo_requests for select to authenticated
  using (exists (select 1 from public.staff s where s.user_id = auth.uid()));

-- Hide the per-call write secret from the portal even though staff can read calls.
-- (Column privileges only bite once the table-level grant is removed.)
revoke select on public.calls from authenticated, anon;
grant select (id, clinic_id, patient_id, channel, direction, started_at, connected_at, ended_at,
              duration_s, status, end_reason, summary_bn, summary_en, language, model,
              recording_url, error_detail, finalized_at, created_at)
  on public.calls to authenticated;
-- Anonymous visitors get nothing beyond the demo form.
revoke all on all tables in schema public from anon;
grant insert on public.demo_requests to anon;

-- Column-level: staff may only flip status/resolved_at on callbacks.
revoke update on public.callbacks from authenticated;
grant update (status, resolved_at) on public.callbacks to authenticated;

-- ───────────────────────── Availability ─────────────────────────
-- Free slots for a clinic on a local date, optionally for one doctor and a
-- local time window. Excludes booked slots and anything less than 30 minutes away.
create or replace function public.available_slots(
  p_clinic uuid, p_date date, p_doctor uuid default null,
  p_from time default null, p_to time default null
) returns table (doctor_id uuid, doctor_name_bn text, doctor_name_en text, slot_start timestamptz, local_time time)
language sql stable set search_path = '' as $$
  with c as (select id, timezone, slot_minutes from public.clinics where id = p_clinic),
  raw as (
    select d.id as doctor_id, d.full_name_bn, d.full_name_en,
           gs as local_ts
    from c
    join public.doctors d on d.clinic_id = c.id and d.active
    join public.doctor_schedules s on s.doctor_id = d.id and s.weekday = extract(dow from p_date)::int
    cross join lateral generate_series(
      p_date + s.start_time,
      p_date + s.end_time - make_interval(mins => c.slot_minutes),
      make_interval(mins => c.slot_minutes)) gs
    where (p_doctor is null or d.id = p_doctor)
  )
  select r.doctor_id, r.full_name_bn, r.full_name_en,
         (r.local_ts at time zone c.timezone) as slot_start,
         r.local_ts::time as local_time
  from raw r cross join c
  where (p_from is null or r.local_ts::time >= p_from)
    and (p_to   is null or r.local_ts::time <  p_to)
    and (r.local_ts at time zone c.timezone) > now() + interval '30 minutes'
    and not exists (
      select 1 from public.appointments a
      where a.doctor_id = r.doctor_id
        and a.slot_start = (r.local_ts at time zone c.timezone)
        and a.status in ('booked','rescheduled'))
  order by r.local_ts, r.full_name_en;
$$;
revoke all on function public.available_slots(uuid, date, uuid, time, time) from public, anon, authenticated;
grant execute on function public.available_slots(uuid, date, uuid, time, time) to service_role;

-- Portal convenience view: one row per call with the key extracted fields.
create or replace view public.call_overview with (security_invoker = true) as
select c.id, c.clinic_id, c.started_at, c.ended_at, c.duration_s, c.status, c.channel, c.end_reason,
       c.summary_bn, c.summary_en, c.model, c.finalized_at,
       coalesce(e.patient_name_bn, p.full_name_bn) as caller_name_bn,
       coalesce(e.patient_name_en, p.full_name_en) as caller_name_en,
       coalesce(e.phone_e164, p.phone_e164)        as caller_phone,
       e.intent, e.reason_for_visit, e.service_code, e.preferred_date, e.preferred_time,
       e.needs_human, e.phone_valid,
       (select count(*) from public.transcript_turns t where t.call_id = c.id) as turn_count
from public.calls c
left join public.call_extractions e on e.call_id = c.id
left join public.patients p on p.id = c.patient_id;
grant select on public.call_overview to authenticated;
