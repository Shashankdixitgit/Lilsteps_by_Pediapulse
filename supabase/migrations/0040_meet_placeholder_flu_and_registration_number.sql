-- 0040: dashboard data fixes from QA round 2 (R2-04, R2-10, R2-13).
--
-- R2-04  Dr. Madhav's default_meet_link was the example code from the
--        Settings placeholder (https://meet.google.com/abc-defg-hij), so
--        parents were sent to a room nobody is in. Clear it, and refuse the
--        well-known example codes from now on (Settings rejects them too:
--        doctor-dashboard/src/app/settings/actions.ts).
-- R2-10  The yearly flu shot was stored as 'overdue' (public.vaccine_status_for
--        marks every past date overdue), so doctors saw "Influenza overdue
--        since 2020" while the parent app said "Caught up". An annual vaccine
--        is never overdue: move those rows to 'upcoming', and keep new or
--        re-generated rows from landing on 'overdue' again.
-- R2-13  The 2020 Telemedicine Practice Guidelines want the doctor's
--        registration number on every prescription. Add the column; the
--        doctor fills it in Settings and parents read it on the prescription.

-- ── R2-04 ───────────────────────────────────────────────────────────────────
update public.doctors
   set default_meet_link = null
 where default_meet_link ~* '^https://meet\.google\.com/(abc-defg-hij|abc-mnop-xyz|xxx-xxxx-xxx|xxx-yyyy-zzz|aaa-bbbb-ccc)$';

alter table public.doctors
  drop constraint if exists doctors_default_meet_link_not_example;
alter table public.doctors
  add constraint doctors_default_meet_link_not_example check (
    default_meet_link is null
    or default_meet_link !~* '^https://meet\.google\.com/(abc-defg-hij|abc-mnop-xyz|xxx-xxxx-xxx|xxx-yyyy-zzz|aaa-bbbb-ccc)$'
  );

-- ── R2-10 ───────────────────────────────────────────────────────────────────
update public.vaccinations
   set status = 'upcoming'
 where vaccine_name = 'Influenza'
   and status = 'overdue';

create or replace function private.annual_vaccine_never_overdue()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  -- Same list as ANNUAL_VACCINE_NAMES in the parent app
  -- (constants/vaccineQuestions.ts) and the dashboard.
  if new.vaccine_name = 'Influenza' and new.status = 'overdue' then
    new.status := 'upcoming';
  end if;
  return new;
end;
$$;

drop trigger if exists annual_vaccine_never_overdue on public.vaccinations;
create trigger annual_vaccine_never_overdue
  before insert or update of status on public.vaccinations
  for each row execute function private.annual_vaccine_never_overdue();

-- ── R2-13 ───────────────────────────────────────────────────────────────────
alter table public.doctors
  add column if not exists registration_number text;

alter table public.doctors
  drop constraint if exists doctors_registration_number_length;
alter table public.doctors
  add constraint doctors_registration_number_length
  check (registration_number is null or char_length(registration_number) between 1 and 60);

comment on column public.doctors.registration_number is
  'Medical council registration number (e.g. state council or NMC). Shown on prescriptions. Null = not added yet.';

-- 0036 replaced the table-wide SELECT with a column list (default_meet_link
-- stays out). A registration number is public (it is printed on every
-- prescription and listed in the council registry), so it joins the list.
-- UPDATE is still table-wide; doctors_update_self limits it to the doctor's
-- own row, so Settings can save it.
grant select (registration_number) on public.doctors to authenticated;
