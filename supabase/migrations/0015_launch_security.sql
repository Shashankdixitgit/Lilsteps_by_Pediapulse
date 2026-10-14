-- ─────────────────────────────────────────────────────────────────────────────
-- Launch security hardening
--
-- 1. Atomic booking. `book_slot()` checks the caller owns the child, locks the
--    slot row (FOR UPDATE), fails if it is taken or in the past, then marks it
--    booked and creates the appointment in one transaction. A partial unique
--    index backs it up so two live appointments can never share a slot.
--    Parents can no longer write time_slots or insert appointments directly;
--    the open "any authenticated user can update time_slots" policy (0001,
--    kept by 0008) is replaced with a doctor-own-slots policy.
-- 2. Cancelling (or deleting) an appointment frees its slot via a trigger, so
--    it works the same whether the parent or the doctor cancels.
-- 3. Parents may only cancel their own upcoming appointment — every other
--    column is immutable for them. Nobody can move an appointment to another
--    child, parent or doctor.
-- 4. Doctors can read the parents row (name, phone, email) of parents they
--    have an appointment or conversation with. The push token column is no
--    longer readable through the API by anyone (edge functions use the
--    service role and are unaffected).
-- 5. Conversations can only be opened for your own child. Message content is
--    immutable; only the recipient can set read_at.
-- 6. Doctors can only write prescriptions / consultations for children they
--    actually treat.
-- 7. Advisor fixes: fixed search_path on three functions; anon can no longer
--    execute the SECURITY DEFINER RLS helpers; TRUNCATE/TRIGGER/REFERENCES
--    revoked from the API roles.
--
-- doctor_auth stays readable by all signed-in users (0007): the parent app's
-- doctor list (hooks/useDoctors.ts) inner-joins doctors -> doctor_auth to hide
-- seed doctors. The only thing exposed is a doctor's auth user id, which a
-- parent already sees as messages.sender_id. The dashboard itself only reads
-- its own row.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 7. Function + grant hygiene ──────────────────────────────────────────────

alter function public.vaccine_status_for(date) set search_path = public;
alter function public.touch_doctor_google_tokens() set search_path = public;

-- Runs as owner so the last_message_at bump works without giving parents or
-- doctors a general UPDATE on conversations.
alter function public.bump_conversation_last_message() security definer;
alter function public.bump_conversation_last_message() set search_path = public;
revoke execute on function public.bump_conversation_last_message() from public, anon, authenticated;

-- RLS helpers: signed-in users need them (policies call them as the caller),
-- anon never does — anon has no policies anywhere.
revoke execute on function public.current_doctor_id() from public, anon;
revoke execute on function public.is_doctor() from public, anon;
revoke execute on function public.is_child_owner(uuid) from public, anon;
revoke execute on function public.doctor_has_appointment_with_child(uuid) from public, anon;
grant execute on function public.current_doctor_id() to authenticated;
grant execute on function public.is_doctor() to authenticated;
grant execute on function public.is_child_owner(uuid) to authenticated;
grant execute on function public.doctor_has_appointment_with_child(uuid) to authenticated;

-- TRUNCATE is not covered by RLS; nothing in the API needs these.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- Does the signed-in doctor treat this child (appointment or chat)?
create or replace function public.doctor_treats_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.appointments a
    where a.child_id = p_child_id and a.doctor_id = public.current_doctor_id()
  ) or exists (
    select 1 from public.conversations c
    where c.child_id = p_child_id and c.doctor_id = public.current_doctor_id()
  );
$$;
revoke execute on function public.doctor_treats_child(uuid) from public, anon;
grant execute on function public.doctor_treats_child(uuid) to authenticated;

-- ── 1. time_slots: doctors manage their own; parents book via book_slot() ────

drop policy if exists "time_slots_update_booking" on public.time_slots;
drop policy if exists "time_slots_update_doctor" on public.time_slots;
create policy "time_slots_update_doctor" on public.time_slots
  for update to authenticated
  using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

-- Backstop: one live appointment per doctor/date/time.
create unique index if not exists appointments_active_slot_uidx
  on public.appointments (doctor_id, date, time)
  where status <> 'cancelled';

create or replace function public.book_slot(
  p_slot_id       uuid,
  p_child_id      uuid,
  p_ai_summary_id uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_slot public.time_slots;
  v_appt public.appointments;
begin
  if v_uid is null then
    raise exception 'Please sign in again to book.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.children where id = p_child_id and parent_id = v_uid
  ) then
    raise exception 'Child not found.' using errcode = '42501';
  end if;

  if p_ai_summary_id is not null and not exists (
    select 1 from public.checkin_sessions
    where id = p_ai_summary_id and parent_id = v_uid and child_id = p_child_id
  ) then
    raise exception 'Check-in not found.' using errcode = '42501';
  end if;

  -- Lock the slot: a second booking for the same slot waits here, then sees
  -- is_available = false.
  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found then
    raise exception 'This slot no longer exists.' using errcode = 'P0002';
  end if;
  if not v_slot.is_available then
    raise exception 'This slot was just taken.' using errcode = 'P0001';
  end if;
  -- Clinic time is IST (see lib nowInClinic()).
  if (v_slot.date + v_slot.time) <= (now() at time zone 'Asia/Kolkata') then
    raise exception 'This slot has already passed.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.doctors where id = v_slot.doctor_id and is_available
  ) then
    raise exception 'This doctor is not taking bookings right now.' using errcode = 'P0001';
  end if;

  update public.time_slots set is_available = false where id = v_slot.id;

  begin
    insert into public.appointments (
      child_id, parent_id, doctor_id, date, time, status, summary_ready, ai_summary_id
    ) values (
      p_child_id, v_uid, v_slot.doctor_id, v_slot.date, v_slot.time, 'upcoming',
      p_ai_summary_id is not null, p_ai_summary_id
    )
    returning * into v_appt;
  exception when unique_violation then
    raise exception 'This slot was just taken.' using errcode = 'P0001';
  end;

  return v_appt;
end;
$$;

revoke execute on function public.book_slot(uuid, uuid, uuid) from public, anon;
grant execute on function public.book_slot(uuid, uuid, uuid) to authenticated;

-- ── 2/3. appointments: no direct inserts/deletes; parents may only cancel ────

drop policy if exists "appointments_insert_own" on public.appointments;
drop policy if exists "appointments_delete_own" on public.appointments;

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

drop trigger if exists guard_appointment_update on public.appointments;
create trigger guard_appointment_update
  before update on public.appointments
  for each row execute function public.guard_appointment_update();

-- Free the slot when an appointment is cancelled or removed.
create or replace function public.release_appointment_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled')
  or (tg_op = 'DELETE' and old.status = 'upcoming') then
    update public.time_slots t
       set is_available = true
     where t.doctor_id = old.doctor_id
       and t.date = old.date
       and t.time = old.time
       and not exists (
         select 1 from public.appointments a
         where a.doctor_id = old.doctor_id and a.date = old.date and a.time = old.time
           and a.status <> 'cancelled' and a.id <> old.id
       );
  end if;
  return null;
end;
$$;
revoke execute on function public.release_appointment_slot() from public, anon, authenticated;

drop trigger if exists release_appointment_slot on public.appointments;
create trigger release_appointment_slot
  after update of status or delete on public.appointments
  for each row execute function public.release_appointment_slot();

-- ── 4. parents: doctors read their patients' parents; hide push token ────────

drop policy if exists "parents_select_doctor" on public.parents;
create policy "parents_select_doctor" on public.parents
  for select to authenticated
  using (
    exists (
      select 1 from public.appointments a
      where a.parent_id = parents.id and a.doctor_id = public.current_doctor_id()
    )
    or exists (
      select 1 from public.conversations c
      where c.parent_id = parents.id and c.doctor_id = public.current_doctor_id()
    )
  );

revoke select on public.parents from anon, authenticated;
grant select (id, email, name, phone, created_at) on public.parents to authenticated;

-- ── 5. conversations + messages ──────────────────────────────────────────────

drop policy if exists "conversations_insert_parent" on public.conversations;
create policy "conversations_insert_parent" on public.conversations
  for insert to authenticated
  with check (
    parent_id = auth.uid()
    and public.is_child_owner(child_id)
    and (
      appointment_id is null
      or exists (
        select 1 from public.appointments a
        where a.id = appointment_id
          and a.parent_id = auth.uid()
          and a.child_id = conversations.child_id
      )
    )
  );

-- Neither app updates conversations directly; last_message_at is bumped by
-- the (now SECURITY DEFINER) message trigger.
drop policy if exists "conversations_update_parent" on public.conversations;
drop policy if exists "conversations_update_doctor" on public.conversations;

-- Only the recipient can touch a message (to mark it read).
drop policy if exists "messages_update_own" on public.messages;
drop policy if exists "messages_update_recipient" on public.messages;
create policy "messages_update_recipient" on public.messages
  for update to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (
          (messages.sender = 'parent' and c.doctor_id = public.current_doctor_id())
          or (messages.sender = 'doctor' and c.parent_id = auth.uid())
        )
    )
  )
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (
          (messages.sender = 'parent' and c.doctor_id = public.current_doctor_id())
          or (messages.sender = 'doctor' and c.parent_id = auth.uid())
        )
    )
  );

create or replace function public.guard_message_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (to_jsonb(new) - 'read_at') <> (to_jsonb(old) - 'read_at') then
    raise exception 'Messages cannot be edited.' using errcode = '42501';
  end if;
  if old.read_at is not null and new.read_at is distinct from old.read_at then
    raise exception 'A read message cannot be marked unread.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_message_update() from public, anon, authenticated;

drop trigger if exists guard_message_update on public.messages;
create trigger guard_message_update
  before update on public.messages
  for each row execute function public.guard_message_update();

-- ── 6. Doctor writes scoped to children they treat ───────────────────────────

drop policy if exists "prescriptions_insert_doctor" on public.prescriptions;
create policy "prescriptions_insert_doctor" on public.prescriptions
  for insert to authenticated
  with check (
    doctor_id = public.current_doctor_id()
    and public.doctor_treats_child(child_id)
  );

drop policy if exists "prescriptions_update_doctor" on public.prescriptions;
create policy "prescriptions_update_doctor" on public.prescriptions
  for update to authenticated
  using (doctor_id = public.current_doctor_id())
  with check (
    doctor_id = public.current_doctor_id()
    and public.doctor_treats_child(child_id)
  );

drop policy if exists "consultations_insert_doctor" on public.consultations;
create policy "consultations_insert_doctor" on public.consultations
  for insert to authenticated
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = consultations.appointment_id
        and a.doctor_id = public.current_doctor_id()
        and a.child_id = consultations.child_id
    )
  );

drop policy if exists "consultations_update_doctor" on public.consultations;
create policy "consultations_update_doctor" on public.consultations
  for update to authenticated
  using (
    exists (
      select 1 from public.appointments a
      where a.id = consultations.appointment_id
        and a.doctor_id = public.current_doctor_id()
    )
  )
  with check (
    exists (
      select 1 from public.appointments a
      where a.id = consultations.appointment_id
        and a.doctor_id = public.current_doctor_id()
        and a.child_id = consultations.child_id
    )
  );
