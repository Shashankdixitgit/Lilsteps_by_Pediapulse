-- 0030 — Slots that never run out, honest video links, test doctor profiles.
--
-- 1. doctors.qualifications / doctors.bio: short profile text shown to
--    parents when they choose a doctor. Test doctors say so in these fields.
-- 2. Video option A: no fake links. 0020 gave the seeded doctors a made-up
--    room (meet.google.com/lil-step-tst) that nobody owns. It is cleared here,
--    so the parent app shows its honest "no link yet" message until the
--    doctor pastes their own Meet link in dashboard Settings. A check
--    constraint keeps doctors.default_meet_link to Google Meet URLs only.
-- 3. Rolling slots: generate_rolling_slots() keeps 14 days of 30-minute
--    slots per doctor, Mon–Sat 10:00–13:00 and 17:00–20:00 IST (clinic wall
--    clock, same as time_slots.time). It is idempotent. Each doctor has a
--    "generated through" date, so a later run only adds new days and never
--    brings back a slot the doctor deleted from the Availability page.
--    pg_cron runs it every day at 00:05 IST; a new doctor login (doctor_auth
--    insert) gets slots straight away.
-- 4. One-time tidy-up of the old seed grid (09:00–16:30): future, still-free
--    slots outside the new hours are removed. Booked slots are never touched.
-- 5. Parent-side lookups across doctors (choose "Earliest available", and
--    urgent check-ins looking for a same-day slot with any doctor):
--      free_slots_on(date, doctor?)   every free future slot that day
--      next_free_slot_per_doctor()    each doctor's earliest free slot
--    Both only list doctors who are taking bookings and have a dashboard
--    login (same rule as the parent app's doctor list).

-- ── 1. profile text ─────────────────────────────────────────────────────────
alter table public.doctors add column if not exists qualifications text;
alter table public.doctors add column if not exists bio text;

-- ── 2. video links ──────────────────────────────────────────────────────────
update public.doctors
   set default_meet_link = null
 where default_meet_link = 'https://meet.google.com/lil-step-tst'
    or btrim(coalesce(default_meet_link, '')) = ''
    or default_meet_link !~ '^https://meet\.google\.com/[A-Za-z0-9_/-]+$';

alter table public.doctors drop constraint if exists doctors_default_meet_link_is_meet;
alter table public.doctors
  add constraint doctors_default_meet_link_is_meet
  check (default_meet_link is null or default_meet_link ~ '^https://meet\.google\.com/[A-Za-z0-9_/-]+$');

-- ── 3. rolling slot generator ──────────────────────────────────────────────
create table if not exists public.doctor_slot_schedule (
  doctor_id         uuid primary key references public.doctors(id) on delete cascade,
  -- false = this doctor manages every slot by hand; the generator skips them.
  auto_slots        boolean not null default true,
  -- Last clinic date the generator has filled. Later runs start the day after.
  generated_through date,
  updated_at        timestamptz not null default now()
);

alter table public.doctor_slot_schedule enable row level security;

drop policy if exists "doctor_slot_schedule_select_own" on public.doctor_slot_schedule;
create policy "doctor_slot_schedule_select_own" on public.doctor_slot_schedule
  for select to authenticated using (doctor_id = public.current_doctor_id());

drop policy if exists "doctor_slot_schedule_update_own" on public.doctor_slot_schedule;
create policy "doctor_slot_schedule_update_own" on public.doctor_slot_schedule
  for update to authenticated
  using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

create or replace function public.generate_rolling_slots(
  p_days      int  default 14,
  p_doctor_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now   timestamp := now() at time zone 'Asia/Kolkata';
  v_today date      := (now() at time zone 'Asia/Kolkata')::date;
  v_end   date      := (now() at time zone 'Asia/Kolkata')::date + greatest(p_days, 1) - 1;
  v_count int;
begin
  insert into public.doctor_slot_schedule (doctor_id)
  select d.id from public.doctors d
   where p_doctor_id is null or d.id = p_doctor_id
  on conflict (doctor_id) do nothing;

  with targets as (
    select s.doctor_id,
           greatest(v_today, coalesce(s.generated_through + 1, v_today)) as start_date
      from public.doctor_slot_schedule s
      join public.doctors d on d.id = s.doctor_id
     where s.auto_slots
       and d.is_available
       and exists (select 1 from public.doctor_auth da where da.doctor_id = d.id)
       and (p_doctor_id is null or s.doctor_id = p_doctor_id)
  ),
  ins as (
    insert into public.time_slots (doctor_id, date, time, is_available)
    select t.doctor_id, g.day::date, tm.t, true
      from targets t
      cross join lateral generate_series(t.start_date, v_end, interval '1 day') as g(day)
      cross join (values
        (time '10:00'), (time '10:30'), (time '11:00'), (time '11:30'), (time '12:00'), (time '12:30'),
        (time '17:00'), (time '17:30'), (time '18:00'), (time '18:30'), (time '19:00'), (time '19:30')
      ) as tm(t)
     where extract(isodow from g.day) <> 7          -- no Sundays
       and (g.day::date + tm.t) > v_now             -- today: only times still ahead
    on conflict (doctor_id, date, time) do nothing
    returning 1
  ),
  marked as (
    update public.doctor_slot_schedule s
       set generated_through = v_end, updated_at = now()
      from targets t
     where s.doctor_id = t.doctor_id
       and (s.generated_through is null or s.generated_through < v_end)
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;

revoke execute on function public.generate_rolling_slots(int, uuid) from public, anon, authenticated;

-- A new dashboard login gets bookable slots immediately, not at midnight.
create or replace function public.on_doctor_auth_created_generate_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.generate_rolling_slots(14, new.doctor_id);
  return new;
end;
$$;

revoke execute on function public.on_doctor_auth_created_generate_slots() from public, anon, authenticated;

drop trigger if exists on_doctor_auth_created_generate_slots on public.doctor_auth;
create trigger on_doctor_auth_created_generate_slots
  after insert on public.doctor_auth
  for each row execute function public.on_doctor_auth_created_generate_slots();

-- (Applied live in two steps: 0030a_enable_pg_cron, then the rest.)
-- Daily at 00:05 IST (18:35 UTC). cron.schedule with an existing name
-- replaces that job, so re-running this file is safe.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
select cron.schedule(
  'lilsteps-rolling-slots',
  '35 18 * * *',
  $cron$select public.generate_rolling_slots(14)$cron$
);

-- ── 4. tidy the old seed grid ───────────────────────────────────────────────
delete from public.time_slots t
 where t.date >= (now() at time zone 'Asia/Kolkata')::date
   and t.is_available
   and (
     extract(isodow from t.date) = 7
     or t.time not in (
       time '10:00', time '10:30', time '11:00', time '11:30', time '12:00', time '12:30',
       time '17:00', time '17:30', time '18:00', time '18:30', time '19:00', time '19:30'
     )
   )
   and not exists (
     select 1 from public.appointments a
      where a.doctor_id = t.doctor_id and a.date = t.date and a.time = t.time
        and a.status <> 'cancelled'
   );

select public.generate_rolling_slots(14);

-- ── 5. parent-side lookups across doctors ──────────────────────────────────
-- Security invoker: callers already read time_slots, doctors and doctor_auth
-- through their RLS policies; these only save round trips.

-- Every free slot on one clinic date that is still ahead of now. When two
-- doctors are free at the same time, the less busy doctor that day comes
-- first, so "Earliest available" spreads bookings across doctors.
create or replace function public.free_slots_on(
  p_date      date,
  p_doctor_id uuid default null
)
returns table (
  slot_id        uuid,
  doctor_id      uuid,
  doctor_name    text,
  specialisation text,
  date           date,
  "time"         time
)
language sql
stable
security invoker
set search_path = public
as $$
  select ts.id, ts.doctor_id, d.name, d.specialisation, ts.date, ts.time
    from public.time_slots ts
    join public.doctors d on d.id = ts.doctor_id
   where ts.date = p_date
     and ts.is_available
     and (ts.date + ts.time) > (now() at time zone 'Asia/Kolkata')
     and d.is_available
     and exists (select 1 from public.doctor_auth da where da.doctor_id = d.id)
     and (p_doctor_id is null or ts.doctor_id = p_doctor_id)
   order by ts.time,
            (select count(*) from public.time_slots b
              where b.doctor_id = ts.doctor_id and b.date = ts.date and not b.is_available),
            d.name;
$$;

-- Each bookable doctor's earliest free slot from now on.
create or replace function public.next_free_slot_per_doctor()
returns table (
  slot_id        uuid,
  doctor_id      uuid,
  doctor_name    text,
  specialisation text,
  date           date,
  "time"         time
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (ts.doctor_id)
         ts.id, ts.doctor_id, d.name, d.specialisation, ts.date, ts.time
    from public.time_slots ts
    join public.doctors d on d.id = ts.doctor_id
   where ts.is_available
     and ts.date >= (now() at time zone 'Asia/Kolkata')::date
     and (ts.date + ts.time) > (now() at time zone 'Asia/Kolkata')
     and d.is_available
     and exists (select 1 from public.doctor_auth da where da.doctor_id = d.id)
   order by ts.doctor_id, ts.date, ts.time;
$$;

revoke execute on function public.free_slots_on(date, uuid) from public, anon;
grant execute on function public.free_slots_on(date, uuid) to authenticated;
revoke execute on function public.next_free_slot_per_doctor() from public, anon;
grant execute on function public.next_free_slot_per_doctor() to authenticated;

notify pgrst, 'reload schema';
