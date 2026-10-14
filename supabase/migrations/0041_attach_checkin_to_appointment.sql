-- R3-08: a parent finishes a check-in for a child who already has an
-- upcoming consult. The summary screen offers "Add this summary to your
-- consult with Dr X", so that doctor can read the new check-in.
--
-- A parent cannot do this with a plain UPDATE: guard_appointment_update
-- (0015) lets a parent change only the status (upcoming -> cancelled). This
-- function checks that the caller owns both the appointment and the check-in
-- session, that both are for the same child, and that the appointment is
-- still upcoming. It then sets a transaction-local flag naming that one
-- appointment, which the guard accepts for a change to ai_summary_id /
-- summary_ready only. The flag cannot be set through the API (set_config is
-- not exposed by PostgREST), and it is cleared before the function returns.
--
-- The doctor reads the session through checkin_sessions_select (an
-- appointment with that ai_summary_id and their doctor_id).

create or replace function public.guard_appointment_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Service role / SQL editor (edge functions, tests) are trusted.
  if auth.uid() is null then
    return new;
  end if;

  if new.child_id  is distinct from old.child_id
  or new.parent_id is distinct from old.parent_id
  or new.doctor_id is distinct from old.doctor_id then
    raise exception 'An appointment cannot be moved to another child, parent or doctor.'
      using errcode = '42501';
  end if;

  if old.doctor_id = public.current_doctor_id() then
    return new;
  end if;

  -- attach_checkin_to_appointment (below) for this one appointment: only the
  -- summary link may change.
  if coalesce(current_setting('lilsteps.attach_summary_appt', true), '') = old.id::text
     and (to_jsonb(new) - 'ai_summary_id' - 'summary_ready')
       = (to_jsonb(old) - 'ai_summary_id' - 'summary_ready') then
    return new;
  end if;

  -- Parent: only status may change, and only upcoming -> cancelled.
  if (to_jsonb(new) - 'status') <> (to_jsonb(old) - 'status') then
    raise exception 'Only cancelling is allowed.' using errcode = '42501';
  end if;
  if new.status <> old.status
     and not (old.status = 'upcoming' and new.status = 'cancelled') then
    raise exception 'Only an upcoming appointment can be cancelled.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_appointment_update() from public, anon, authenticated;

create or replace function public.attach_checkin_to_appointment(
  p_appointment_id uuid,
  p_session_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  select true into v_ok
    from public.appointments a
    join public.checkin_sessions s on s.child_id = a.child_id
   where a.id = p_appointment_id
     and s.id = p_session_id
     and a.parent_id = v_uid
     and s.parent_id = v_uid
     and a.status = 'upcoming';

  if not coalesce(v_ok, false) then
    raise exception 'This consult or check-in is not yours, or they are for different children.'
      using errcode = '42501';
  end if;

  perform set_config('lilsteps.attach_summary_appt', p_appointment_id::text, true);
  update public.appointments
     set ai_summary_id = p_session_id,
         summary_ready = true
   where id = p_appointment_id;
  perform set_config('lilsteps.attach_summary_appt', '', true);
  return true;
end;
$$;

revoke execute on function public.attach_checkin_to_appointment(uuid, uuid) from public, anon;
grant execute on function public.attach_checkin_to_appointment(uuid, uuid) to authenticated;
