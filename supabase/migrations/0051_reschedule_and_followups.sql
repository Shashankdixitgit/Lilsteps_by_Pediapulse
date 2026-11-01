-- 0051: free rescheduling and paid follow-ups.
--
-- 1. appointments gains:
--      reschedule_count  how many times this consult was moved (max 3)
--      rescheduled_at    when it was last moved
--      last_rescheduled_by  who made that move: 'parent' or 'doctor'
--      followup_of       the completed consult a doctor-booked follow-up
--                        comes from (null for a family's own booking)
-- 2. reschedule_appointment(appointment, new slot): the parent or the doctor
--    moves an upcoming, PAID consult to another open slot of the same
--    doctor. Free: the payment stays with the consult. Rules:
--      - parent: at least 2 hours before the current start (the same 2-hour
--        line as the refund rule in consult-payment's cancel), and the
--        doctor must be taking bookings;
--      - doctor: any time before the start;
--      - the new slot: same doctor, open, and at least 2 hours from now
--        (for the doctor too: a family must not find their consult moved
--        to a time they can't make, or past the 2-hour cancel line);
--      - at most 3 moves per consult.
--    Who moved it is recorded: a parent cancelling less than 2 hours before
--    the start still gets a full refund when the DOCTOR moved the consult in
--    the last 24 hours (consult-payment cancel).
--    Both slot rows are locked (in id order, so two moves never deadlock),
--    the old one re-opens, the new one is taken, and the consult's date /
--    time change in one transaction. The Meet room is kept: rooms are open
--    and not tied to a time. A short note goes into the family's chat with
--    the doctor, from whoever moved it. The email is sent by the
--    consult-payment edge function, which calls this.
--    guard_appointment_update lets exactly this change through for exactly
--    this consult via a transaction-local flag (as 0041 / 0045 do).
-- 3. book_followup(completed consult, slot): the doctor books a follow-up
--    for a child they have seen into one of their own open slots. It is an
--    unpaid hold ('awaiting_payment') for the family: held for 24 hours, but
--    only until 1 hour before the slot, so the slot must be at least 2 hours
--    away. One open follow-up per child per doctor, and at most 3 follow-ups
--    booked per child per doctor per day (any status; so cancel-and-rebook
--    can't spam the family with payment emails). Paying it goes through
--    the normal consult-payment / webhook path (confirm_consult_payment).
-- 4. hold_slot: a doctor-booked follow-up does not count towards the
--    family's limit of two unpaid bookings (otherwise a doctor's follow-up
--    could stop a family booking).
-- 5. notification_log one-message index (0046) learns the consult's start
--    time and move count (payload.starts_at = "YYYY-MM-DDTHH:MM#n", n =
--    reschedule_count): a reschedule email per move, and the reminders again
--    after each move, even a move back to an earlier time.
--    'followup_payment_request' is one per booking.
-- 6. guard_appointment_update, doctor branch: status only moves forward
--    (upcoming -> completed / no_show / cancelled, completed <-> no_show),
--    as in 0050.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. columns ──────────────────────────────────────────────────────────────

alter table public.appointments
  add column if not exists reschedule_count integer not null default 0,
  add column if not exists rescheduled_at   timestamptz,
  add column if not exists last_rescheduled_by text,
  add column if not exists followup_of      uuid references public.appointments(id) on delete set null;

alter table public.appointments
  drop constraint if exists appointments_reschedule_count_check;
alter table public.appointments
  add constraint appointments_reschedule_count_check check (reschedule_count between 0 and 3);
alter table public.appointments
  drop constraint if exists appointments_last_rescheduled_by_check;
alter table public.appointments
  add constraint appointments_last_rescheduled_by_check
  check (last_rescheduled_by is null or last_rescheduled_by in ('parent', 'doctor'));

create index if not exists appointments_followup_of_idx
  on public.appointments (followup_of)
  where followup_of is not null;

comment on column public.appointments.reschedule_count is
  'Times this consult was moved with reschedule_appointment (max 3).';
comment on column public.appointments.followup_of is
  'The completed consult this doctor-booked follow-up comes from; null for a family''s own booking.';

-- ── 2a. guard_appointment_update ────────────────────────────────────────────
-- As 0050, plus the reschedule flag (checked before the doctor branch, which
-- refuses date / time changes).

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

  -- reschedule_appointment (0051) for this one consult: only the time and
  -- the move counter may change, and the consult stays upcoming.
  if coalesce(current_setting('lilsteps.reschedule_appt', true), '') = old.id::text
     and old.status = 'upcoming' and new.status = 'upcoming'
     and (to_jsonb(new) - 'date' - 'time' - 'reschedule_count' - 'rescheduled_at' - 'last_rescheduled_by')
       = (to_jsonb(old) - 'date' - 'time' - 'reschedule_count' - 'rescheduled_at' - 'last_rescheduled_by') then
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
      raise exception 'Use Reschedule to move a consult to another time.'
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

-- ── 2b. reschedule_appointment ──────────────────────────────────────────────
-- Messages are shown to the parent / doctor as-is.

create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_slot_id    uuid
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_appt      public.appointments;
  v_new       public.time_slots;
  v_by        text;
  v_now_ist   timestamp := (now() at time zone 'Asia/Kolkata');
  v_old_start timestamp;
  v_convo     uuid;
  v_child     text;
  v_note      text;
begin
  if v_uid is null then
    raise exception 'Please sign in again.' using errcode = '28000';
  end if;

  -- Lock the consult first (same order as cancel / confirm: appointment, then slots).
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Consult not found.' using errcode = 'P0002';
  end if;
  if v_appt.parent_id = v_uid then
    v_by := 'parent';
  elsif v_appt.doctor_id = private.current_doctor_id() then
    v_by := 'doctor';
  else
    raise exception 'Consult not found.' using errcode = 'P0002';
  end if;

  if v_appt.status <> 'upcoming' then
    raise exception 'Only an upcoming consult can be moved.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.payments where appointment_id = v_appt.id and status = 'paid'
  ) then
    raise exception 'Only a paid consult can be moved. Cancel it and book a new time instead.'
      using errcode = 'P0001';
  end if;

  v_old_start := v_appt.date + v_appt.time;
  if v_old_start <= v_now_ist then
    raise exception 'This consult has already started, so it can no longer be moved.' using errcode = 'P0001';
  end if;
  if v_by = 'parent' and v_old_start - v_now_ist < interval '2 hours' then
    raise exception 'A consult can be moved up to 2 hours before it starts. Please message the doctor instead.'
      using errcode = 'P0001';
  end if;
  if v_appt.reschedule_count >= 3 then
    raise exception 'This consult has already been moved 3 times, so it can''t be moved again.'
      using errcode = 'P0001';
  end if;

  -- Lock both slot rows in id order (two moves crossing each other wait
  -- instead of deadlocking).
  perform 1 from public.time_slots t
   where t.id = p_new_slot_id
      or (t.doctor_id = v_appt.doctor_id and t.date = v_appt.date and t.time = v_appt.time)
   order by t.id
   for update;

  select * into v_new from public.time_slots where id = p_new_slot_id;
  if not found or v_new.doctor_id <> v_appt.doctor_id then
    raise exception 'This time is not available with this doctor.' using errcode = 'P0001';
  end if;
  if v_new.date = v_appt.date and v_new.time = v_appt.time then
    raise exception 'That is the current time of this consult. Pick another time.' using errcode = 'P0001';
  end if;
  if not v_new.is_available then
    raise exception 'This time was just taken. Please pick another.' using errcode = 'P0001';
  end if;
  if (v_new.date + v_new.time) <= v_now_ist then
    raise exception 'This time has already passed. Please pick another.' using errcode = 'P0001';
  end if;
  if (v_new.date + v_new.time) - v_now_ist < interval '2 hours' then
    raise exception 'Pick a time at least 2 hours from now, so the family can make it.' using errcode = 'P0001';
  end if;
  if v_by = 'parent' and not exists (
    select 1 from public.doctors d where d.id = v_appt.doctor_id and d.is_available
  ) then
    raise exception 'This doctor is not taking bookings right now. Please message them instead.'
      using errcode = 'P0001';
  end if;

  perform set_config('lilsteps.reschedule_appt', v_appt.id::text, true);
  begin
    update public.appointments
       set date = v_new.date,
           time = v_new.time,
           reschedule_count = reschedule_count + 1,
           rescheduled_at = now(),
           last_rescheduled_by = v_by
     where id = v_appt.id
    returning * into v_appt;
  exception when unique_violation then
    perform set_config('lilsteps.reschedule_appt', '', true);
    raise exception 'This time was just taken. Please pick another.' using errcode = 'P0001';
  end;
  perform set_config('lilsteps.reschedule_appt', '', true);

  -- Old slot back on offer (nothing else is booked there now), new one taken.
  update public.time_slots t
     set is_available = true
   where t.doctor_id = v_appt.doctor_id
     and t.date = v_old_start::date
     and t.time = v_old_start::time
     and not exists (
       select 1 from public.appointments a
        where a.doctor_id = t.doctor_id and a.date = t.date and a.time = t.time
          and a.status <> 'cancelled'
     );
  update public.time_slots set is_available = false where id = v_new.id;

  -- A note in the family's chat with this doctor, from whoever moved it.
  select split_part(btrim(c.name), ' ', 1) into v_child from public.children c where c.id = v_appt.child_id;
  v_note := format(
    'I have moved %s consult to %s at %s (India time). The video link stays the same.',
    case when coalesce(v_child, '') = '' then 'the' else v_child || '''s' end,
    to_char(v_appt.date, 'FMDay, FMDD FMMonth'),
    lower(to_char(v_appt.time, 'FMHH12:MI AM'))
  );

  insert into public.conversations (child_id, parent_id, doctor_id, appointment_id)
  values (v_appt.child_id, v_appt.parent_id, v_appt.doctor_id, v_appt.id)
  on conflict (child_id, doctor_id) do nothing;
  select c.id into v_convo from public.conversations c
   where c.child_id = v_appt.child_id and c.doctor_id = v_appt.doctor_id;
  if v_convo is not null then
    insert into public.messages (conversation_id, sender, sender_id, content)
    values (v_convo, v_by, v_uid, v_note);
  end if;

  return v_appt;
end;
$$;
revoke execute on function public.reschedule_appointment(uuid, uuid) from public, anon;
grant execute on function public.reschedule_appointment(uuid, uuid) to authenticated;

-- ── 3. book_followup ────────────────────────────────────────────────────────

create or replace function public.book_followup(
  p_from_appointment_id uuid,
  p_slot_id             uuid
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor  uuid := private.current_doctor_id();
  v_from    public.appointments;
  v_slot    public.time_slots;
  v_start   timestamptz;
  v_appt    public.appointments;
begin
  if v_doctor is null then
    raise exception 'Not signed in as a doctor.' using errcode = '42501';
  end if;

  select * into v_from from public.appointments
   where id = p_from_appointment_id and doctor_id = v_doctor;
  if not found then
    raise exception 'Consult not found.' using errcode = 'P0002';
  end if;
  if v_from.status <> 'completed' then
    raise exception 'A follow-up can be booked after the visit is completed.' using errcode = 'P0001';
  end if;

  perform public.expire_payment_holds();

  -- One open follow-up per child with this doctor. The advisory lock makes
  -- two quick clicks wait for each other instead of both passing the check.
  perform pg_advisory_xact_lock(hashtextextended('followup:' || v_from.child_id::text || ':' || v_doctor::text, 0));
  if exists (
    select 1 from public.appointments a
     where a.child_id = v_from.child_id and a.doctor_id = v_doctor
       and a.followup_of is not null and a.status = 'awaiting_payment'
  ) then
    raise exception 'A follow-up for this child is already waiting for payment. Cancel it first to pick another time.'
      using errcode = 'P0001';
  end if;
  -- At most 3 follow-ups per child per doctor per clinic day, whatever
  -- became of them (each one emails the family a payment link).
  if (
    select count(*) from public.appointments a
     where a.child_id = v_from.child_id and a.doctor_id = v_doctor
       and a.followup_of is not null
       and (a.created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date
  ) >= 3 then
    raise exception 'You have already booked 3 follow-ups for this child today. Please try again tomorrow, or message the family.'
      using errcode = 'P0001';
  end if;

  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found or v_slot.doctor_id <> v_doctor then
    raise exception 'This time is not one of your slots.' using errcode = 'P0001';
  end if;
  if not v_slot.is_available then
    raise exception 'This time was just taken. Please pick another.' using errcode = 'P0001';
  end if;
  v_start := (v_slot.date + v_slot.time) at time zone 'Asia/Kolkata';
  if v_start < now() + interval '2 hours' then
    raise exception 'Pick a time at least 2 hours from now, so the family has time to pay.' using errcode = 'P0001';
  end if;

  update public.time_slots set is_available = false where id = v_slot.id;

  begin
    insert into public.appointments (
      child_id, parent_id, doctor_id, date, time, status, hold_expires_at, followup_of, concern
    ) values (
      v_from.child_id, v_from.parent_id, v_doctor, v_slot.date, v_slot.time, 'awaiting_payment',
      -- 24 hours to pay, but released 1 hour before the slot at the latest.
      least(now() + interval '24 hours', v_start - interval '1 hour'),
      v_from.id, 'Follow-up'
    )
    returning * into v_appt;
  exception when unique_violation then
    raise exception 'This time was just taken. Please pick another.' using errcode = 'P0001';
  end;

  return v_appt;
end;
$$;
revoke execute on function public.book_followup(uuid, uuid) from public, anon;
grant execute on function public.book_followup(uuid, uuid) to authenticated;

-- ── 4. hold_slot: follow-ups don't count towards the two-hold limit ─────────
-- As 0045, with `followup_of is null` in the two-hold limit only. (The
-- "already held" lookup is unchanged: a parent holding a slot the doctor
-- booked as a follow-up for the same child gets that hold back, as before.)

create or replace function public.hold_slot(
  p_slot_id       uuid,
  p_child_id      uuid,
  p_ai_summary_id uuid default null,
  p_concern       text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_slot    public.time_slots;
  v_appt    public.appointments;
  v_wait    integer;
  v_concern text := left(nullif(btrim(coalesce(p_concern, '')), ''), 1000);
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

  perform public.expire_payment_holds();

  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found then
    raise exception 'This slot no longer exists.' using errcode = 'P0002';
  end if;

  -- This parent already holds this slot for this child: hand it back.
  select * into v_appt from public.appointments
   where parent_id = v_uid and child_id = p_child_id and status = 'awaiting_payment'
     and doctor_id = v_slot.doctor_id and date = v_slot.date and time = v_slot.time;
  if found then
    return v_appt;
  end if;

  select ceil(extract(epoch from (min(hold_expires_at) - now())) / 60)::integer
    into v_wait
    from public.appointments
   where parent_id = v_uid and status = 'awaiting_payment' and followup_of is null
  having count(*) >= 2;
  if found then
    raise exception 'You already have two bookings waiting for payment. Finish one, or try again in about % min.',
      greatest(coalesce(v_wait, 1), 1) using errcode = 'P0001';
  end if;

  if not v_slot.is_available then
    raise exception 'This slot was just taken.' using errcode = 'P0001';
  end if;
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
      child_id, parent_id, doctor_id, date, time, status, hold_expires_at,
      summary_ready, ai_summary_id, concern
    ) values (
      p_child_id, v_uid, v_slot.doctor_id, v_slot.date, v_slot.time, 'awaiting_payment',
      now() + interval '20 minutes',
      p_ai_summary_id is not null, p_ai_summary_id, v_concern
    )
    returning * into v_appt;
  exception when unique_violation then
    raise exception 'This slot was just taken.' using errcode = 'P0001';
  end;

  return v_appt;
end;
$$;
revoke execute on function public.hold_slot(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.hold_slot(uuid, uuid, uuid, text) to authenticated;

-- ── 5. one booking message per consult time ─────────────────────────────────
-- Key: appointment + template + channel + the consult's start time and move
-- count (payload.starts_at, "YYYY-MM-DDTHH:MM#n"; '' on rows from before
-- 0051 and on messages that don't depend on the time). Older duplicates under the new
-- key are marked first, as 0046 did.

update public.notification_log n
   set status = 'failed', error = coalesce(n.error, 'duplicate (0051)')
 where n.status in ('queued', 'sent')
   and n.appointment_id is not null
   and n.template in ('appointment_confirmation', 'appointment_cancelled', 'appointment_rescheduled',
                      'appointment_reminder_24h', 'appointment_reminder_1h', 'followup_payment_request')
   and exists (
     select 1 from public.notification_log o
      where o.appointment_id = n.appointment_id
        and o.template = n.template
        and o.channel = n.channel
        and coalesce(o.payload->>'starts_at', '') = coalesce(n.payload->>'starts_at', '')
        and o.status in ('queued', 'sent')
        and (o.created_at, o.id) < (n.created_at, n.id)
   );

drop index if exists public.notification_log_one_booking_message_uidx;
create unique index notification_log_one_booking_message_uidx
  on public.notification_log (appointment_id, template, channel, (coalesce(payload->>'starts_at', '')))
  where status in ('queued', 'sent')
    and template in ('appointment_confirmation', 'appointment_cancelled', 'appointment_rescheduled',
                     'appointment_reminder_24h', 'appointment_reminder_1h', 'followup_payment_request');

notify pgrst, 'reload schema';
