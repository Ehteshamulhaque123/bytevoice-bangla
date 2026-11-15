-- Short spoken serial number for each booking, and per-call client metadata (salted IP hash for rate limiting).
alter table public.appointments add column ref_code text;
create index appointments_ref_idx on public.appointments (clinic_id, ref_code);
alter table public.calls add column client_meta jsonb not null default '{}'::jsonb;
create index calls_ip_hash_idx on public.calls ((client_meta->>'ip_hash'), started_at);
-- client_meta is internal; keep it out of the portal role's column grants (calls select is column-scoped).
