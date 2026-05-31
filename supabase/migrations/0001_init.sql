-- ─────────────────────────────────────────────────────────────────────────────
-- LilSteps — initial schema
--
-- Reconstructed from the client hooks in `hooks/` and contexts in `context/`.
-- All tables here are referenced from at least one `supabase.from(...)` call
-- in the parent app.
--
-- Conventions:
--   • uuid PK with gen_random_uuid()
--   • timestamptz `created_at` default now()
--   • FK to auth.users for parent_id; FK to public.children for child_id
--   • text + CHECK for enum-like fields (cheaper to evolve than Postgres ENUMs)
--   • RLS enabled on every table; policies scoped to the authenticated parent
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── parents ───────────────────────────────────────────────────────────────────
-- 1:1 with auth.users; created automatically by the handle_new_user trigger
-- below, and idempotently upserted as a fallback from the client.

create table if not exists public.parents (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text,
  phone       text,
  created_at  timestamptz not null default now()
);

-- ── children ──────────────────────────────────────────────────────────────────

create table if not exists public.children (
  id                   uuid primary key default gen_random_uuid(),
  parent_id            uuid not null references public.parents(id) on delete cascade,
  name                 text not null,
  dob                  date not null,
  sex                  text not null check (sex in ('male', 'female', 'other')),
  blood_group          text,
  weight               numeric(5, 2),
  height               numeric(5, 2),
  weight_updated_at    timestamptz,
  height_updated_at    timestamptz,
  created_at           timestamptz not null default now()
);

create index if not exists children_parent_id_idx on public.children(parent_id);

-- ── allergies ─────────────────────────────────────────────────────────────────

create table if not exists public.allergies (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references public.children(id) on delete cascade,
  type       text not null check (type in ('food', 'medication', 'environmental')),
  name       text not null,
  severity   text not null default 'mild' check (severity in ('mild', 'moderate', 'severe')),
  created_at timestamptz not null default now()
);

create index if not exists allergies_child_id_idx on public.allergies(child_id);

-- ── conditions ────────────────────────────────────────────────────────────────

create table if not exists public.conditions (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references public.children(id) on delete cascade,
  name       text not null,
  details    text,
  created_at timestamptz not null default now()
);

create index if not exists conditions_child_id_idx on public.conditions(child_id);

-- ── medications ───────────────────────────────────────────────────────────────

create table if not exists public.medications (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references public.children(id) on delete cascade,
  name       text not null,
  dosage     text,
  frequency  text,
  created_at timestamptz not null default now()
);

create index if not exists medications_child_id_idx on public.medications(child_id);

-- ── doctors ───────────────────────────────────────────────────────────────────

create table if not exists public.doctors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  specialisation  text not null,
  hospital        text not null,
  avatar_url      text,
  is_available    boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ── time_slots ────────────────────────────────────────────────────────────────

create table if not exists public.time_slots (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references public.doctors(id) on delete cascade,
  date          date not null,
  time          time not null,
  is_available  boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (doctor_id, date, time)
);

create index if not exists time_slots_doctor_date_idx on public.time_slots(doctor_id, date);

-- ── checkin_sessions ──────────────────────────────────────────────────────────
-- created before appointments — appointments may reference an ai_summary id

create table if not exists public.checkin_sessions (
  id                  uuid primary key default gen_random_uuid(),
  child_id            uuid not null references public.children(id) on delete cascade,
  parent_id           uuid not null references public.parents(id) on delete cascade,
  initial_complaint   text not null,
  status              text not null default 'in_progress'
                       check (status in ('in_progress', 'summary_generated', 'completed', 'abandoned')),
  ai_summary          jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists checkin_sessions_child_id_idx on public.checkin_sessions(child_id);
create index if not exists checkin_sessions_parent_id_idx on public.checkin_sessions(parent_id);

-- ── checkin_messages ──────────────────────────────────────────────────────────

create table if not exists public.checkin_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.checkin_sessions(id) on delete cascade,
  role       text not null check (role in ('user', 'ai')),
  content    text not null,
  created_at timestamptz not null default now()
);

create index if not exists checkin_messages_session_id_idx on public.checkin_messages(session_id);

-- ── appointments ──────────────────────────────────────────────────────────────

create table if not exists public.appointments (
  id              uuid primary key default gen_random_uuid(),
  child_id        uuid not null references public.children(id) on delete cascade,
  parent_id       uuid not null references public.parents(id) on delete cascade,
  doctor_id       uuid not null references public.doctors(id) on delete restrict,
  date            date not null,
  time            time not null,
  status          text not null default 'upcoming'
                   check (status in ('upcoming', 'completed', 'cancelled')),
  summary_ready   boolean not null default false,
  ai_summary_id   uuid references public.checkin_sessions(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists appointments_child_id_idx on public.appointments(child_id);
create index if not exists appointments_parent_id_idx on public.appointments(parent_id);
create index if not exists appointments_doctor_id_idx on public.appointments(doctor_id);
create index if not exists appointments_date_idx on public.appointments(date);

-- ── consultations ─────────────────────────────────────────────────────────────

create table if not exists public.consultations (
  id                     uuid primary key default gen_random_uuid(),
  appointment_id         uuid references public.appointments(id) on delete set null,
  child_id               uuid not null references public.children(id) on delete cascade,
  doctor_name            text not null,
  doctor_specialisation  text,
  chief_complaint        text,
  outcome                text,
  prescription           text,
  ai_summary             jsonb,
  doctor_notes           text,
  created_at             timestamptz not null default now()
);

create index if not exists consultations_child_id_idx on public.consultations(child_id);
create index if not exists consultations_appointment_id_idx on public.consultations(appointment_id);

-- ── vaccinations ──────────────────────────────────────────────────────────────

create table if not exists public.vaccinations (
  id                 uuid primary key default gen_random_uuid(),
  child_id           uuid not null references public.children(id) on delete cascade,
  vaccine_master_id  uuid,
  vaccine_name       text not null,
  dose_label         text not null,
  dose_number        int not null,
  scheduled_date     date not null,
  administered_date  date,
  status             text not null default 'upcoming'
                      check (status in ('done', 'due_soon', 'overdue', 'upcoming')),
  created_at         timestamptz not null default now()
);

create index if not exists vaccinations_child_id_idx on public.vaccinations(child_id);
create index if not exists vaccinations_status_idx on public.vaccinations(status);

-- ── growth_measurements ───────────────────────────────────────────────────────

create table if not exists public.growth_measurements (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references public.children(id) on delete cascade,
  weight       numeric(5, 2),
  height       numeric(5, 2),
  note         text,
  measured_at  date not null default current_date,
  created_at   timestamptz not null default now()
);

create index if not exists growth_measurements_child_id_idx on public.growth_measurements(child_id);

-- ── documents ─────────────────────────────────────────────────────────────────

create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  child_id       uuid not null references public.children(id) on delete cascade,
  title          text not null,
  category       text not null check (category in ('prescription', 'report', 'lab_test', 'visit_history', 'other')),
  file_url       text not null,
  file_type      text not null,
  file_size      bigint,
  doctor_name    text,
  notes          text,
  document_date  date not null default current_date,
  created_at     timestamptz not null default now()
);

create index if not exists documents_child_id_idx on public.documents(child_id);

-- ── health_notes ──────────────────────────────────────────────────────────────

create table if not exists public.health_notes (
  id         uuid primary key default gen_random_uuid(),
  child_id   uuid not null references public.children(id) on delete cascade,
  category   text not null check (category in ('symptom', 'behaviour', 'sleep', 'feeding', 'medication', 'other')),
  content    text not null,
  severity   int check (severity between 1 and 5),
  photo_url  text,
  noted_at   timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists health_notes_child_id_idx on public.health_notes(child_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: auto-create parent row when a new auth.users row is inserted.
-- The client also runs an idempotent upsert as a fallback (see context/auth.tsx).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.parents (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
--
-- Posture (per Proposal §6 Data Privacy):
--   • Parent reads/writes own data (children + everything child-scoped)
--   • Doctors table is readable by any authenticated user (booking flow)
--   • Time slots readable by all authenticated; bookable update guarded by
--     authenticated role (MVP — tighten with stored procedure later)
--   • Consultations / appointments: parent reads own; the doctor-side write
--     path will be added when the doctor dashboard ships (separate app, same DB)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.parents              enable row level security;
alter table public.children             enable row level security;
alter table public.allergies            enable row level security;
alter table public.conditions           enable row level security;
alter table public.medications          enable row level security;
alter table public.doctors              enable row level security;
alter table public.time_slots           enable row level security;
alter table public.appointments         enable row level security;
alter table public.consultations        enable row level security;
alter table public.vaccinations         enable row level security;
alter table public.growth_measurements  enable row level security;
alter table public.documents            enable row level security;
alter table public.health_notes         enable row level security;
alter table public.checkin_sessions     enable row level security;
alter table public.checkin_messages     enable row level security;

-- ── parents ───────────────────────────────────────────────────────────────────
drop policy if exists "parents_select_own"  on public.parents;
drop policy if exists "parents_insert_own"  on public.parents;
drop policy if exists "parents_update_own"  on public.parents;

create policy "parents_select_own" on public.parents
  for select to authenticated using (id = auth.uid());

create policy "parents_insert_own" on public.parents
  for insert to authenticated with check (id = auth.uid());

create policy "parents_update_own" on public.parents
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ── children (parent owns) ────────────────────────────────────────────────────
drop policy if exists "children_select_own"  on public.children;
drop policy if exists "children_insert_own"  on public.children;
drop policy if exists "children_update_own"  on public.children;
drop policy if exists "children_delete_own"  on public.children;

create policy "children_select_own" on public.children
  for select to authenticated using (parent_id = auth.uid());

create policy "children_insert_own" on public.children
  for insert to authenticated with check (parent_id = auth.uid());

create policy "children_update_own" on public.children
  for update to authenticated using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy "children_delete_own" on public.children
  for delete to authenticated using (parent_id = auth.uid());

-- ── helper: does the current user own this child? ────────────────────────────
-- Used by child-scoped policies below.

create or replace function public.is_child_owner(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.children
    where id = p_child_id and parent_id = auth.uid()
  );
$$;

-- ── child-scoped tables ──────────────────────────────────────────────────────
-- Same shape for: allergies, conditions, medications, vaccinations,
-- growth_measurements, documents, health_notes

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'allergies', 'conditions', 'medications', 'vaccinations',
      'growth_measurements', 'documents', 'health_notes'
    ])
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_child_owner(child_id))',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_child_owner(child_id))',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_child_owner(child_id)) with check (public.is_child_owner(child_id))',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_child_owner(child_id))',
      t || '_delete_own', t
    );
  end loop;
end$$;

-- ── doctors (read-only to authenticated) ─────────────────────────────────────
drop policy if exists "doctors_select_all" on public.doctors;
create policy "doctors_select_all" on public.doctors
  for select to authenticated using (true);

-- ── time_slots (read all; insert/update/delete restricted) ───────────────────
drop policy if exists "time_slots_select_all"      on public.time_slots;
drop policy if exists "time_slots_update_booking"  on public.time_slots;

create policy "time_slots_select_all" on public.time_slots
  for select to authenticated using (true);

-- For MVP, any authenticated user can flip availability — this is what the
-- booking flow needs. Lock down to a SECURITY DEFINER booking RPC before any
-- multi-clinic launch.
create policy "time_slots_update_booking" on public.time_slots
  for update to authenticated using (true) with check (true);

-- ── appointments (parent owns; doctor read assigned — added later) ───────────
drop policy if exists "appointments_select_own"  on public.appointments;
drop policy if exists "appointments_insert_own"  on public.appointments;
drop policy if exists "appointments_update_own"  on public.appointments;
drop policy if exists "appointments_delete_own"  on public.appointments;

create policy "appointments_select_own" on public.appointments
  for select to authenticated using (parent_id = auth.uid());

create policy "appointments_insert_own" on public.appointments
  for insert to authenticated with check (parent_id = auth.uid());

create policy "appointments_update_own" on public.appointments
  for update to authenticated using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy "appointments_delete_own" on public.appointments
  for delete to authenticated using (parent_id = auth.uid());

-- ── consultations (parent reads via child ownership) ─────────────────────────
drop policy if exists "consultations_select_own"  on public.consultations;
create policy "consultations_select_own" on public.consultations
  for select to authenticated using (public.is_child_owner(child_id));

-- Doctor-side writes will be added when the doctor dashboard ships.

-- ── checkin_sessions / checkin_messages ──────────────────────────────────────
drop policy if exists "checkin_sessions_select_own"  on public.checkin_sessions;
drop policy if exists "checkin_sessions_insert_own"  on public.checkin_sessions;
drop policy if exists "checkin_sessions_update_own"  on public.checkin_sessions;

create policy "checkin_sessions_select_own" on public.checkin_sessions
  for select to authenticated using (parent_id = auth.uid());

create policy "checkin_sessions_insert_own" on public.checkin_sessions
  for insert to authenticated with check (parent_id = auth.uid());

create policy "checkin_sessions_update_own" on public.checkin_sessions
  for update to authenticated using (parent_id = auth.uid()) with check (parent_id = auth.uid());

drop policy if exists "checkin_messages_select_own"  on public.checkin_messages;
drop policy if exists "checkin_messages_insert_own"  on public.checkin_messages;

create policy "checkin_messages_select_own" on public.checkin_messages
  for select to authenticated using (
    exists (
      select 1 from public.checkin_sessions s
      where s.id = checkin_messages.session_id and s.parent_id = auth.uid()
    )
  );

create policy "checkin_messages_insert_own" on public.checkin_messages
  for insert to authenticated with check (
    exists (
      select 1 from public.checkin_sessions s
      where s.id = checkin_messages.session_id and s.parent_id = auth.uid()
    )
  );
