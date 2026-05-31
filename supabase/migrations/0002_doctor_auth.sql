-- ─────────────────────────────────────────────────────────────────────────────
-- doctor_auth — links Supabase auth.users to a row in public.doctors
--
-- Doctors authenticate via email + password against the same auth.users table
-- as parents. The presence of a doctor_auth row distinguishes a doctor session
-- from a parent session. The doctor dashboard (Next.js) checks this on login
-- and rejects users without a doctor_auth row.
--
-- Seeding: add a row here AFTER creating the doctor's auth user via
--   supabase auth admin create-user --email dr@example.com --password ...
-- then INSERT into doctor_auth (id = auth user id, doctor_id = public.doctors.id).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.doctor_auth (
  id          uuid primary key references auth.users(id) on delete cascade,
  doctor_id   uuid not null references public.doctors(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (doctor_id)
);

create index if not exists doctor_auth_doctor_id_idx on public.doctor_auth(doctor_id);

alter table public.doctor_auth enable row level security;

-- A doctor can read their own link row to discover their doctor_id post-login.
drop policy if exists "doctor_auth_select_own" on public.doctor_auth;
create policy "doctor_auth_select_own" on public.doctor_auth
  for select to authenticated using (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: is the current user a doctor?
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_doctor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.doctor_auth where id = auth.uid());
$$;

create or replace function public.current_doctor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select doctor_id from public.doctor_auth where id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Doctor-side RLS additions on existing tables.
-- A doctor can read appointments and consultations assigned to them.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "appointments_select_doctor" on public.appointments;
create policy "appointments_select_doctor" on public.appointments
  for select to authenticated using (doctor_id = public.current_doctor_id());

drop policy if exists "appointments_update_doctor" on public.appointments;
create policy "appointments_update_doctor" on public.appointments
  for update to authenticated
  using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

-- Consultations: a doctor can read consultations for appointments they own,
-- and they can insert/update consultations they author.
drop policy if exists "consultations_select_doctor" on public.consultations;
create policy "consultations_select_doctor" on public.consultations
  for select to authenticated using (
    exists (
      select 1 from public.appointments a
      where a.id = consultations.appointment_id
        and a.doctor_id = public.current_doctor_id()
    )
  );

drop policy if exists "consultations_insert_doctor" on public.consultations;
create policy "consultations_insert_doctor" on public.consultations
  for insert to authenticated with check (
    exists (
      select 1 from public.appointments a
      where a.id = consultations.appointment_id
        and a.doctor_id = public.current_doctor_id()
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
    )
  );

-- Doctor can read child summaries (name, dob, sex) for assigned appointments —
-- minimal scope, no allergies/conditions/medications via this policy.
-- Parents still control sharing of full profile via the AI summary.
drop policy if exists "children_select_doctor" on public.children;
create policy "children_select_doctor" on public.children
  for select to authenticated using (
    exists (
      select 1 from public.appointments a
      where a.child_id = children.id
        and a.doctor_id = public.current_doctor_id()
    )
  );

-- Doctor can read the AI summary attached to their appointments.
drop policy if exists "checkin_sessions_select_doctor" on public.checkin_sessions;
create policy "checkin_sessions_select_doctor" on public.checkin_sessions
  for select to authenticated using (
    exists (
      select 1 from public.appointments a
      where a.ai_summary_id = checkin_sessions.id
        and a.doctor_id = public.current_doctor_id()
    )
  );
