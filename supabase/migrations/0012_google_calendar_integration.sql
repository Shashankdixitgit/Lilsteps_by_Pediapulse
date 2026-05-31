-- ─────────────────────────────────────────────────────────────────────────────
-- Per-appointment Google Meet links via Calendar API
--
-- The doctor connects their Google account once (Supabase Auth linkIdentity
-- with calendar.events scope). We store their refresh token in
-- doctor_google_tokens. On every appointment booking, the
-- `create-meet-event` Edge Function refreshes an access token, creates a
-- Calendar event with conferenceData.createRequest, and writes the resulting
-- hangoutLink back to appointments.meet_link.
--
-- If the doctor hasn't connected Google yet, parent/doctor UIs fall back to
-- doctors.default_meet_link (the manual permanent room URL from migration
-- 0010), and finally show a "no link" state.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.appointments
  add column if not exists meet_link text;

create table if not exists public.doctor_google_tokens (
  doctor_id     uuid primary key references public.doctors(id) on delete cascade,
  google_email  text,
  refresh_token text not null,
  scopes        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.doctor_google_tokens enable row level security;

-- The owning doctor can read/write their own row from the dashboard (to
-- save the refresh token immediately after the OAuth callback, and to show
-- "Connected as <email>" status). Edge Functions use the service role which
-- bypasses RLS entirely.
drop policy if exists "doctor_google_tokens_own" on public.doctor_google_tokens;
create policy "doctor_google_tokens_own" on public.doctor_google_tokens
  for all to authenticated
  using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

create or replace function public.touch_doctor_google_tokens()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_doctor_google_tokens_update on public.doctor_google_tokens;
create trigger on_doctor_google_tokens_update
  before update on public.doctor_google_tokens
  for each row execute function public.touch_doctor_google_tokens();
