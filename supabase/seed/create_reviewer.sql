-- Creates the portal reviewer login and links it to the demo clinic as a manager.
-- Run with psql:  psql "$DB_URL" -v reviewer_password='…' -f supabase/seed/create_reviewer.sql
-- (The password is passed in, never stored in the repo.)
with u as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    'reviewer@bytevoice.demo', extensions.crypt(:'reviewer_password', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"StrategyByte Reviewer"}', now(), now(), '', '', '', '')
  returning id, email
), i as (
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now() from u
  returning user_id
)
insert into public.staff (user_id, clinic_id, full_name, role)
select i.user_id, c.id, 'StrategyByte Reviewer', 'manager' from i, public.clinics c where c.slug = 'hashi-dental';
