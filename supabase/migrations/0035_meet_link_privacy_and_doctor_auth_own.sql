-- 0035 — Meet link privacy (P1, V1) and doctor_auth own-row read (P2).
--
-- P1: under Option A every doctor has one fixed Meet room
-- (doctors.default_meet_link). Until now any signed-in parent could read
-- every doctor's room through GET /rest/v1/doctors and join another child's
-- consult. Parents now get a link only through
-- get_my_appointment_meet_link(), which checks the caller owns a
-- non-cancelled appointment and is inside its join window. The parent app
-- no longer selects the column anywhere.
--
-- V1: parents need to know whether a doctor HAS a link (booking hints,
-- "Video link pending" on the card) without seeing it, so doctors gets a
-- generated boolean has_meet_link.
--
-- P2: doctor_auth was readable by every signed-in user (0007). The parent
-- app now filters bookable doctors on doctors.has_dashboard_login (0034)
-- instead of joining doctor_auth, and the two slot lookups below stop
-- reading doctor_auth too, so it can be narrowed to the doctor's own row
-- (the 0034 FOLLOW-UP).

-- ── V1: has_meet_link ────────────────────────────────────────────────────────
alter table public.doctors
  add column if not exists has_meet_link boolean
  generated always as (default_meet_link is not null) stored;

comment on column public.doctors.has_meet_link is
  'True when the doctor has saved a Meet room (default_meet_link). Safe for parents to read; the link itself is not.';

-- ── P1: the parent's link for their own consult ─────────────────────────────
-- Returns {has_link, link}. has_link: this consult has a video link
-- (per-booking Meet link, or the doctor's room). link: only from 15 min
-- before the start until 90 min after (the app opens Join 10 min before and
-- keeps it an hour after; the extra margin covers device clock drift).
-- Returns null when the appointment is not the caller's or is cancelled.
create or replace function public.get_my_appointment_meet_link(p_appointment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link text;
  v_start timestamptz;
begin
  select coalesce(nullif(btrim(a.meet_link), ''), d.default_meet_link),
         ((a.date + a.time) at time zone 'Asia/Kolkata')
    into v_link, v_start
    from public.appointments a
    join public.doctors d on d.id = a.doctor_id
   where a.id = p_appointment_id
     and a.parent_id = (select auth.uid())
     and a.status <> 'cancelled';

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'has_link', v_link is not null,
    'link', case
              when v_link is not null
               and now() between v_start - interval '15 minutes' and v_start + interval '90 minutes'
              then v_link
            end
  );
end;
$$;

revoke execute on function public.get_my_appointment_meet_link(uuid) from public, anon;
grant execute on function public.get_my_appointment_meet_link(uuid) to authenticated, service_role;

-- The signed-in doctor's own room, for the dashboard (Settings, consult and
-- chat pages). Ready for the column revoke below; null for non-doctors.
create or replace function public.get_my_meet_link()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.default_meet_link
    from public.doctors d
   where d.id = (select private.current_doctor_id());
$$;

revoke execute on function public.get_my_meet_link() from public, anon;
grant execute on function public.get_my_meet_link() to authenticated, service_role;

-- ── P2: slot lookups stop reading doctor_auth ───────────────────────────────
-- Both are SECURITY INVOKER, so with doctor_auth narrowed to the own row they
-- would return nothing to parents. has_dashboard_login (0034) is the same
-- rule. free_slots_on also prefers, at the same time, a doctor who has a
-- video link (V1).
create or replace function public.free_slots_on(p_date date, p_doctor_id uuid default null)
returns table(slot_id uuid, doctor_id uuid, doctor_name text, specialisation text, date date, "time" time)
language sql
stable
set search_path to 'public'
as $function$
  select ts.id, ts.doctor_id, d.name, d.specialisation, ts.date, ts.time
    from public.time_slots ts
    join public.doctors d on d.id = ts.doctor_id
   where ts.date = p_date
     and ts.is_available
     and (ts.date + ts.time) > (now() at time zone 'Asia/Kolkata')
     and d.is_available
     and d.has_dashboard_login
     and (p_doctor_id is null or ts.doctor_id = p_doctor_id)
   order by ts.time,
            not (d.has_meet_link or d.has_google_calendar),
            (select count(*) from public.time_slots b
              where b.doctor_id = ts.doctor_id and b.date = ts.date and not b.is_available),
            d.name;
$function$;

create or replace function public.next_free_slot_per_doctor()
returns table(slot_id uuid, doctor_id uuid, doctor_name text, specialisation text, date date, "time" time)
language sql
stable
set search_path to 'public'
as $function$
  select distinct on (ts.doctor_id)
         ts.id, ts.doctor_id, d.name, d.specialisation, ts.date, ts.time
    from public.time_slots ts
    join public.doctors d on d.id = ts.doctor_id
   where ts.is_available
     and ts.date >= (now() at time zone 'Asia/Kolkata')::date
     and (ts.date + ts.time) > (now() at time zone 'Asia/Kolkata')
     and d.is_available
     and d.has_dashboard_login
   order by ts.doctor_id, ts.date, ts.time;
$function$;

-- ── P2: doctor_auth, own row only (0034 FOLLOW-UP) ──────────────────────────
drop policy if exists "doctor_auth_select_all" on public.doctor_auth;
drop policy if exists "doctor_auth_select_own" on public.doctor_auth;
create policy "doctor_auth_select_own" on public.doctor_auth
  for select to authenticated using (id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- FOLLOW-UP (P1 step 2 — run as a new migration once the doctor dashboard
-- reads its own link through rpc('get_my_meet_link') instead of selecting
-- doctors.default_meet_link: src/app/settings/page.tsx, src/lib/doctor.ts,
-- src/app/consultations/[id]/page.tsx, src/app/conversations/[id]/page.tsx).
-- Doctors and parents share the `authenticated` role, so revoking the column
-- today would make those dashboard queries fail with "permission denied".
-- A column REVOKE does nothing while the table-wide SELECT grant exists, so
-- swap the table grant for a column list without default_meet_link.
-- UPDATE stays table-wide, so Settings can still save the link.
--
--   revoke select on public.doctors from authenticated;
--   grant select (id, name, specialisation, hospital, avatar_url, is_available,
--                 created_at, qualifications, bio, has_dashboard_login,
--                 has_google_calendar, has_meet_link)
--     on public.doctors to authenticated;
-- ─────────────────────────────────────────────────────────────────────────────
