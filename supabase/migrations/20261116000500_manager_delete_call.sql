-- Managers can permanently delete a call. Removes the call, its transcript, extracted fields,
-- event log and callbacks (FK cascade) and any appointment that was booked during that call,
-- so the slot becomes free again. Appointments it only rescheduled/cancelled are kept.
create or replace function public.is_clinic_manager(p_clinic uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid() and s.clinic_id = p_clinic and s.role in ('manager','admin'));
$$;
revoke all on function public.is_clinic_manager(uuid) from public;
grant execute on function public.is_clinic_manager(uuid) to authenticated;

create or replace function public.delete_call(p_call uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_clinic uuid; v_appts int;
begin
  select clinic_id into v_clinic from public.calls where id = p_call;
  if v_clinic is null then raise exception 'call_not_found' using errcode = 'P0002'; end if;
  if not public.is_clinic_manager(v_clinic) then raise exception 'not_allowed' using errcode = '42501'; end if;
  delete from public.appointments where call_id = p_call;
  get diagnostics v_appts = row_count;
  delete from public.calls where id = p_call;
  return jsonb_build_object('deleted', true, 'appointments_removed', v_appts);
end;
$$;
revoke all on function public.delete_call(uuid) from public;
grant execute on function public.delete_call(uuid) to authenticated;
revoke execute on function public.delete_call(uuid) from anon;
revoke execute on function public.is_clinic_manager(uuid) from anon;
