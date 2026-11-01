-- 0050: doctor dashboard hardening (backend gaps found by the dashboard E2E).
--
-- 1. guard_appointment_update, doctor branch. Until now a doctor could change
--    anything on their own appointment except child / parent / doctor, so a
--    plain UPDATE could cancel a PAID consult (no refund: the refund only
--    happens in the consult-payment edge function) or move it to another
--    date / time (there is no reschedule flow: the slot, the parent's
--    reminders and the Meet event would all be wrong). Now a doctor may only
--    change status, cancel_reason, meet_link and summary_ready, and:
--      - may not set 'cancelled' while a payment for it is 'paid'
--        ("Cancel from the dashboard so the family is refunded.");
--      - may move the status only along upcoming -> completed / no_show /
--        cancelled, and completed <-> no_show (fixing a mis-click). A
--        closed or cancelled visit can never go back to upcoming: that
--        would let a consult that happened be cancelled and refunded, or
--        be held again;
--      - may set cancel_reason only to 'doctor', and only when cancelling.
--    The edge functions run as the service role (auth.uid() is null) and
--    are not affected.
-- 2. prescriptions:
--    a. doctor_name / registration_number / qualifications are copied from
--       the doctors row when the prescription is issued (BEFORE INSERT
--       trigger), so a prescription keeps showing who issued it, with which
--       registration number, even after the doctor edits their profile.
--       Existing rows are backfilled from the current doctors row. Clients
--       cannot change the snapshot afterwards.
--    b. create_prescription(header, items): the only way to issue one. Checks
--       the caller is the doctor of that visit (own, upcoming or completed)
--       or, without a visit, treats the child; that the doctor has a
--       registration number; field lengths. Header and items are written in
--       one transaction (before, a failed items insert left an empty
--       prescription: two such rows exist live). The direct INSERT policies
--       on prescriptions / prescription_items are dropped, and so are the
--       doctor UPDATE / DELETE policies (prescriptions_update_doctor,
--       prescription_items_update_doctor, prescription_items_delete_doctor):
--       an issued prescription is never changed (no client used them).
--    c. CHECK constraints with the same limits as the dashboard form
--       (doctor-dashboard/src/lib/prescription-limits.ts).
-- 3. appointments.meet_link must be a Google Meet room link (or null).
-- 4. A doctor reads a child's records (child row, allergies, conditions,
--    medications, growth, vaccinations, health notes, documents and their
--    files, the AI check-in, the parent's contact row) only while they have a
--    real consult with the child (upcoming / completed / no_show) or a chat
--    with the family. An unpaid hold (awaiting_payment) or a cancelled
--    booking no longer opens the records. One exception for starting a
--    chat (not for reading records): a consult the doctor cancelled AFTER
--    it was paid, so the dashboard can tell the family about the refund. An
--    unpaid hold the doctor dropped does not count.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. guard_appointment_update ─────────────────────────────────────────────
-- As 0045, with the doctor branch narrowed (see header).

create or replace function public.guard_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / SQL editor (edge functions, tests) are trusted.
  if auth.uid() is null then
    return new;
  end if;

  -- expire_payment_holds (0045), possibly run inside someone else's
  -- hold_slot: only awaiting_payment -> cancelled/payment_expired, nothing else.
  if coalesce(current_setting('lilsteps.expiring_holds', true), '') = 'on'
     and old.status = 'awaiting_payment' and new.status = 'cancelled'
     and new.cancel_reason = 'payment_expired'
     and (to_jsonb(new) - 'status' - 'cancel_reason' - 'hold_expires_at')
       = (to_jsonb(old) - 'status' - 'cancel_reason' - 'hold_expires_at') then
    return new;
  end if;

  if new.child_id  is distinct from old.child_id
  or new.parent_id is distinct from old.parent_id
  or new.doctor_id is distinct from old.doctor_id then
    raise exception 'An appointment cannot be moved to another child, parent or doctor.'
      using errcode = '42501';
  end if;

  if old.doctor_id = public.current_doctor_id() then
    if old.status = 'awaiting_payment' or new.status = 'awaiting_payment' then
      raise exception 'This booking is waiting for payment.' using errcode = '42501';
    end if;
    if new.date is distinct from old.date or new.time is distinct from old.time then
      raise exception 'A consult cannot be moved to another time yet. Cancel it from the dashboard and ask the family to book again.'
        using errcode = '42501';
    end if;
    if (to_jsonb(new) - 'status' - 'cancel_reason' - 'meet_link' - 'summary_ready')
       <> (to_jsonb(old) - 'status' - 'cancel_reason' - 'meet_link' - 'summary_ready') then
      raise exception 'Only the visit status and video link can be changed.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if old.status = 'cancelled' then
        raise exception 'A cancelled consult cannot be reopened.' using errcode = '42501';
      end if;
      -- Only forward from upcoming, or between the two closed states.
      if not (
        (old.status = 'upcoming' and new.status in ('completed', 'no_show', 'cancelled'))
        or (old.status in ('completed', 'no_show') and new.status in ('completed', 'no_show'))
      ) then
        raise exception 'A closed visit cannot be reopened.' using errcode = '42501';
      end if;
      if new.status = 'cancelled' and exists (
        select 1 from public.payments
         where appointment_id = old.id and status = 'paid'
      ) then
        raise exception 'Cancel from the dashboard so the family is refunded.' using errcode = '42501';
      end if;
    end if;
    if new.cancel_reason is distinct from old.cancel_reason
       and not (old.status <> 'cancelled' and new.status = 'cancelled'
                and new.cancel_reason is not distinct from 'doctor') then
      raise exception 'A cancel reason is only set when cancelling.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- attach_checkin_to_appointment (0041) for this one appointment: only the
  -- summary link may change.
  if coalesce(current_setting('lilsteps.attach_summary_appt', true), '') = old.id::text
     and (to_jsonb(new) - 'ai_summary_id' - 'summary_ready')
       = (to_jsonb(old) - 'ai_summary_id' - 'summary_ready') then
    return new;
  end if;

  -- Parent: only status (and, when cancelling, why) may change, and only to
  -- cancelled.
  if (to_jsonb(new) - 'status' - 'cancel_reason') <> (to_jsonb(old) - 'status' - 'cancel_reason') then
    raise exception 'Only cancelling is allowed.' using errcode = '42501';
  end if;
  if new.status <> old.status
     and not (old.status in ('upcoming', 'awaiting_payment') and new.status = 'cancelled') then
    raise exception 'Only an upcoming appointment can be cancelled.' using errcode = '42501';
  end if;
  if new.cancel_reason is distinct from old.cancel_reason
     and not (old.status <> 'cancelled' and new.status = 'cancelled'
              and new.cancel_reason is not distinct from 'parent') then
    raise exception 'Only cancelling is allowed.' using errcode = '42501';
  end if;
  if new.status = 'cancelled' and old.status = 'upcoming' and exists (
    select 1 from public.payments
     where appointment_id = old.id and status = 'paid'
  ) then
    raise exception 'Please cancel from the app so we can refund you.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_appointment_update() from public, anon, authenticated;

-- ── 3. appointments.meet_link: Google Meet rooms only ───────────────────────
-- Calendar events and the clinic Meet API both return meet.google.com/xxx-xxxx-xxx.

alter table public.appointments
  drop constraint if exists appointments_meet_link_is_meet;
alter table public.appointments
  add constraint appointments_meet_link_is_meet check (
    meet_link is null
    or meet_link ~ '^https://meet\.google\.com/([a-z]{3}-[a-z]{4}-[a-z]{3}|lookup/[A-Za-z0-9_-]+)$'
  ) not valid;
alter table public.appointments validate constraint appointments_meet_link_is_meet;

-- ── 4. Doctor access to a child's records ───────────────────────────────────
-- One rule everywhere: a real consult (upcoming / completed / no_show) with
-- this doctor, or a chat with this doctor.

create or replace function private.doctor_has_appointment_with_child(p_child_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.appointments a
    where a.child_id = p_child_id
      and a.doctor_id = private.current_doctor_id()
      and a.status in ('upcoming', 'completed', 'no_show')
  ) or exists (
    select 1 from public.conversations c
    where c.child_id = p_child_id
      and c.doctor_id = private.current_doctor_id()
  );
$$;

create or replace function private.doctor_treats_child(p_child_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.doctor_has_appointment_with_child(p_child_id); $$;

create or replace function private.doctor_can_read_document_object(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.children c
    where c.parent_id::text = (storage.foldername(p_name))[1]
      and c.id::text        = (storage.foldername(p_name))[2]
      and private.doctor_has_appointment_with_child(c.id)
  );
$$;

revoke execute on function private.doctor_has_appointment_with_child(uuid) from public, anon;
revoke execute on function private.doctor_treats_child(uuid) from public, anon;
revoke execute on function private.doctor_can_read_document_object(text) from public, anon;
grant execute on function private.doctor_has_appointment_with_child(uuid) to authenticated, service_role;
grant execute on function private.doctor_treats_child(uuid) to authenticated, service_role;
grant execute on function private.doctor_can_read_document_object(text) to authenticated, service_role;

-- allergies / conditions / medications / growth_measurements / vaccinations /
-- health_notes / documents already call doctor_has_appointment_with_child.
-- The policies below checked appointments inline; give them the same rule.

drop policy if exists "children_select" on public.children;
drop policy if exists "children_select_own" on public.children;
drop policy if exists "children_select_doctor" on public.children;
create policy "children_select" on public.children
  for select to authenticated
  using (
    parent_id = (select auth.uid())
    or public.doctor_has_appointment_with_child(id)
  );

drop policy if exists "parents_select" on public.parents;
drop policy if exists "parents_select_own" on public.parents;
drop policy if exists "parents_select_doctor" on public.parents;
create policy "parents_select" on public.parents
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.appointments a
      where a.parent_id = parents.id
        and a.doctor_id = (select public.current_doctor_id())
        and a.status in ('upcoming', 'completed', 'no_show')
    )
    or exists (
      select 1 from public.conversations c
      where c.parent_id = parents.id
        and c.doctor_id = (select public.current_doctor_id())
    )
  );

drop policy if exists "checkin_sessions_select" on public.checkin_sessions;
drop policy if exists "checkin_sessions_select_own" on public.checkin_sessions;
drop policy if exists "checkin_sessions_select_doctor" on public.checkin_sessions;
create policy "checkin_sessions_select" on public.checkin_sessions
  for select to authenticated
  using (
    parent_id = (select auth.uid())
    or exists (
      select 1 from public.appointments a
      where a.ai_summary_id = checkin_sessions.id
        and a.doctor_id = (select public.current_doctor_id())
        and a.status in ('upcoming', 'completed', 'no_show')
    )
  );

drop policy if exists "checkin_messages_select" on public.checkin_messages;
drop policy if exists "checkin_messages_select_own" on public.checkin_messages;
drop policy if exists "checkin_messages_select_doctor" on public.checkin_messages;
create policy "checkin_messages_select" on public.checkin_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.checkin_sessions s
      where s.id = checkin_messages.session_id
        and s.parent_id = (select auth.uid())
    )
    or exists (
      select 1 from public.appointments a
      where a.ai_summary_id = checkin_messages.session_id
        and a.doctor_id = (select public.current_doctor_id())
        and a.status in ('upcoming', 'completed', 'no_show')
    )
  );

-- conversations_insert: doctor_treats_child now needs a real consult or a
-- chat. The one extra case is a PAID consult the doctor cancelled
-- (cancel_reason 'doctor' and a payment row that was paid, whatever its
-- refund state now): the dashboard tells the family about the refund in
-- chat, which may need a new thread. An unpaid hold the doctor dropped
-- (also cancel_reason 'doctor') does NOT open a chat, so cancelling a
-- stranger's hold can't be used to reach their child's records. The parent
-- branch is unchanged.
-- Whether money was ever captured for this booking (paid, or paid and now
-- being / been refunded). Security definer: payments are readable by the
-- parent only, and this is needed inside a doctor's policy.
create or replace function private.appointment_was_paid(p_appointment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.payments p
     where p.appointment_id = p_appointment_id
       and p.status in ('paid', 'refund_due', 'refund_pending', 'refunded', 'refund_failed')
  );
$$;
revoke execute on function private.appointment_was_paid(uuid) from public, anon;
grant execute on function private.appointment_was_paid(uuid) to authenticated, service_role;

drop policy if exists "conversations_insert" on public.conversations;
drop policy if exists "conversations_insert_parent" on public.conversations;
drop policy if exists "conversations_insert_doctor" on public.conversations;
create policy "conversations_insert" on public.conversations
  for insert to authenticated
  with check (
    (
      doctor_id = (select public.current_doctor_id())
      and (
        (
          public.doctor_treats_child(child_id)
          and exists (
            select 1 from public.children c
            where c.id = conversations.child_id and c.parent_id = conversations.parent_id
          )
          and (
            appointment_id is null
            or exists (
              select 1 from public.appointments a
              where a.id = conversations.appointment_id
                and a.doctor_id = (select public.current_doctor_id())
                and a.child_id = conversations.child_id
            )
          )
        )
        or exists (
          select 1 from public.appointments a
          where a.id = conversations.appointment_id
            and a.doctor_id = (select public.current_doctor_id())
            and a.child_id = conversations.child_id
            and a.parent_id = conversations.parent_id
            and a.status = 'cancelled'
            and a.cancel_reason = 'doctor'
            and private.appointment_was_paid(a.id)
        )
      )
    )
    or (
      parent_id = (select auth.uid())
      and public.is_child_owner(child_id)
      and (
        appointment_id is null
        or exists (
          select 1 from public.appointments a
          where a.id = conversations.appointment_id
            and a.parent_id = (select auth.uid())
            and a.child_id = conversations.child_id
        )
      )
    )
  );

-- ── 2a. prescriptions: doctor snapshot ──────────────────────────────────────

alter table public.prescriptions
  add column if not exists doctor_name         text,
  add column if not exists registration_number text,
  add column if not exists qualifications      text;

comment on column public.prescriptions.doctor_name is
  'Issuing doctor''s name as it was when the prescription was issued (copied from doctors).';
comment on column public.prescriptions.registration_number is
  'Issuing doctor''s medical council registration number at issue time (copied from doctors).';
comment on column public.prescriptions.qualifications is
  'Issuing doctor''s qualifications at issue time (copied from doctors).';

create or replace function private.snapshot_prescription_doctor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Always from the doctors row, whatever the client sent.
    select d.name, nullif(btrim(d.registration_number), ''), nullif(btrim(d.qualifications), '')
      into new.doctor_name, new.registration_number, new.qualifications
      from public.doctors d
     where d.id = new.doctor_id;
    return new;
  end if;

  -- UPDATE: an issued prescription keeps its snapshot. Only the service role
  -- / SQL editor (auth.uid() is null: backfills, support fixes) may change it.
  if auth.uid() is not null then
    new.doctor_name         := old.doctor_name;
    new.registration_number := old.registration_number;
    new.qualifications      := old.qualifications;
  end if;
  return new;
end;
$$;
revoke execute on function private.snapshot_prescription_doctor() from public, anon, authenticated;

drop trigger if exists snapshot_prescription_doctor on public.prescriptions;
create trigger snapshot_prescription_doctor
  before insert or update on public.prescriptions
  for each row execute function private.snapshot_prescription_doctor();

-- Backfill from the doctor's current row (the best we have for old rows).
update public.prescriptions p
   set doctor_name         = d.name,
       registration_number = nullif(btrim(d.registration_number), ''),
       qualifications      = nullif(btrim(d.qualifications), '')
  from public.doctors d
 where d.id = p.doctor_id
   and p.doctor_name is null;

alter table public.prescriptions alter column doctor_name set not null;

-- ── 2c. CHECK constraints (same limits as the dashboard form) ───────────────
-- Live data was checked before writing this (longest: medicine 37, dose 22,
-- frequency 42, duration 6, item notes 33, notes 87; no blank fields).

alter table public.prescription_items drop constraint if exists prescription_items_medicine_check;
alter table public.prescription_items add constraint prescription_items_medicine_check
  check (btrim(medicine) <> '' and char_length(medicine) <= 120) not valid;
alter table public.prescription_items drop constraint if exists prescription_items_dose_check;
alter table public.prescription_items add constraint prescription_items_dose_check
  check (btrim(dose) <> '' and char_length(dose) <= 80) not valid;
alter table public.prescription_items drop constraint if exists prescription_items_frequency_check;
alter table public.prescription_items add constraint prescription_items_frequency_check
  check (btrim(frequency) <> '' and char_length(frequency) <= 80) not valid;
alter table public.prescription_items drop constraint if exists prescription_items_duration_check;
alter table public.prescription_items add constraint prescription_items_duration_check
  check (duration is null or char_length(duration) <= 80) not valid;
alter table public.prescription_items drop constraint if exists prescription_items_notes_check;
alter table public.prescription_items add constraint prescription_items_notes_check
  check (notes is null or char_length(notes) <= 300) not valid;
alter table public.prescriptions drop constraint if exists prescriptions_notes_check;
alter table public.prescriptions add constraint prescriptions_notes_check
  check (notes is null or char_length(notes) <= 1000) not valid;

alter table public.prescription_items validate constraint prescription_items_medicine_check;
alter table public.prescription_items validate constraint prescription_items_dose_check;
alter table public.prescription_items validate constraint prescription_items_frequency_check;
alter table public.prescription_items validate constraint prescription_items_duration_check;
alter table public.prescription_items validate constraint prescription_items_notes_check;
alter table public.prescriptions validate constraint prescriptions_notes_check;

-- ── 2b. create_prescription ─────────────────────────────────────────────────
-- header: { child_id, appointment_id?, notes? }
-- items:  [ { medicine, dose, frequency, duration?, notes? }, ... ] (1-30)
-- Returns the new prescription id. Messages are shown to the doctor as-is.

create or replace function public.create_prescription(header jsonb, items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor   uuid := private.current_doctor_id();
  v_child    uuid;
  v_appt     uuid;
  v_notes    text;
  v_reg      text;
  v_rx       uuid;
  v_item     jsonb;
  v_medicine text;
  v_dose     text;
  v_freq     text;
  v_duration text;
  v_inotes   text;
  v_pos      integer := 0;
begin
  if v_doctor is null then
    raise exception 'Not signed in as a doctor.' using errcode = '42501';
  end if;
  if header is null or jsonb_typeof(header) <> 'object' then
    raise exception 'Missing prescription details.' using errcode = '22023';
  end if;

  begin
    v_child := nullif(btrim(header->>'child_id'), '')::uuid;
    v_appt  := nullif(btrim(header->>'appointment_id'), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Missing child or visit.' using errcode = '22023';
  end;
  if v_child is null then
    raise exception 'Missing child.' using errcode = '22023';
  end if;

  select nullif(btrim(d.registration_number), '') into v_reg
    from public.doctors d where d.id = v_doctor;
  if v_reg is null then
    raise exception 'Add your medical council registration number in Settings before issuing a prescription. It must be printed on every prescription.'
      using errcode = 'P0001';
  end if;

  if v_appt is not null then
    -- Only this doctor's own, real visit with this child.
    perform 1 from public.appointments a
     where a.id = v_appt
       and a.doctor_id = v_doctor
       and a.child_id = v_child
       and a.status in ('upcoming', 'completed');
    if not found then
      raise exception 'This visit is not one of yours for this child, so the prescription cannot be attached to it.'
        using errcode = '42501';
    end if;
  elsif not private.doctor_treats_child(v_child) then
    raise exception 'You can only prescribe for a child you have a consult or chat with.' using errcode = '42501';
  end if;

  v_notes := nullif(btrim(coalesce(header->>'notes', '')), '');
  if char_length(v_notes) > 1000 then
    raise exception 'Notes can be up to 1000 characters.' using errcode = '22023';
  end if;

  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Add at least one medicine.' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 30 then
    raise exception 'A prescription can have up to 30 medicines.' using errcode = '22023';
  end if;

  insert into public.prescriptions (child_id, doctor_id, appointment_id, notes)
  values (v_child, v_doctor, v_appt, v_notes)
  returning id into v_rx;

  for v_item in select value from jsonb_array_elements(items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each medicine needs name, dose, and frequency.' using errcode = '22023';
    end if;
    v_medicine := btrim(coalesce(v_item->>'medicine', ''));
    v_dose     := btrim(coalesce(v_item->>'dose', ''));
    v_freq     := btrim(coalesce(v_item->>'frequency', ''));
    v_duration := nullif(btrim(coalesce(v_item->>'duration', '')), '');
    v_inotes   := nullif(btrim(coalesce(v_item->>'notes', '')), '');
    if v_medicine = '' or v_dose = '' or v_freq = '' then
      raise exception 'Each medicine needs name, dose, and frequency.' using errcode = '22023';
    end if;
    if char_length(v_medicine) > 120 or char_length(v_dose) > 80 or char_length(v_freq) > 80
       or char_length(v_duration) > 80 or char_length(v_inotes) > 300 then
      raise exception 'Keep each medicine short: name up to 120 characters, dose, frequency and duration up to 80, special instructions up to 300.'
        using errcode = '22023';
    end if;
    insert into public.prescription_items (prescription_id, medicine, dose, frequency, duration, notes, position)
    values (v_rx, v_medicine, v_dose, v_freq, v_duration, v_inotes, v_pos);
    v_pos := v_pos + 1;
  end loop;

  return v_rx;
end;
$$;
revoke execute on function public.create_prescription(jsonb, jsonb) from public, anon;
grant execute on function public.create_prescription(jsonb, jsonb) to authenticated;

-- Issuing goes through create_prescription only.
drop policy if exists "prescriptions_insert_doctor" on public.prescriptions;
drop policy if exists "prescriptions_insert" on public.prescriptions;
drop policy if exists "prescription_items_insert_doctor" on public.prescription_items;
drop policy if exists "prescription_items_insert" on public.prescription_items;
-- An issued prescription is never edited or deleted from a client.
drop policy if exists "prescriptions_update_doctor" on public.prescriptions;
drop policy if exists "prescription_items_update_doctor" on public.prescription_items;
drop policy if exists "prescription_items_delete_doctor" on public.prescription_items;

notify pgrst, 'reload schema';
