-- 0020 — Save the parent's concern on the appointment, and give the test
-- doctors a video room so "Join video" works in the testing environment.
--
-- 1. appointments.concern: the text the parent types in "Book a doctor"
--    (consult/describe). It used to be shown on the confirm screen and then
--    dropped. The doctor dashboard shows it on the consult page.
-- 2. book_slot() gains p_concern. Every 0015 check is kept as-is. The old
--    3-argument version is dropped first so PostgREST never has two
--    overloads to choose between.
-- 3. default_meet_link for the seeded test doctors (only where none is set),
--    so the parent's video screen has a link while Google Calendar is not
--    connected. A doctor replaces it from dashboard Settings.

-- ── 1. concern column ───────────────────────────────────────────────────────
alter table public.appointments
  add column if not exists concern text;

-- ── 2. book_slot with p_concern ─────────────────────────────────────────────
drop function if exists public.book_slot(uuid, uuid, uuid);

create or replace function public.book_slot(
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
      child_id, parent_id, doctor_id, date, time, status, summary_ready, ai_summary_id, concern
    ) values (
      p_child_id, v_uid, v_slot.doctor_id, v_slot.date, v_slot.time, 'upcoming',
      p_ai_summary_id is not null, p_ai_summary_id, v_concern
    )
    returning * into v_appt;
  exception when unique_violation then
    raise exception 'This slot was just taken.' using errcode = 'P0001';
  end;

  return v_appt;
end;
$$;

revoke execute on function public.book_slot(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.book_slot(uuid, uuid, uuid, text) to authenticated;

-- ── 3. test video rooms ─────────────────────────────────────────────────────
update public.doctors
set default_meet_link = 'https://meet.google.com/lil-step-tst'
where name in ('Dr. Emily Chen', 'Dr. Ramesh Gupta', 'Dr. Sarah Miller')
  and (default_meet_link is null or btrim(default_meet_link) = '');

notify pgrst, 'reload schema';
