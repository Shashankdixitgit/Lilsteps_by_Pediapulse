-- ─────────────────────────────────────────────────────────────────────────────
-- Allow parents to discover which doctors are registered for the dashboard.
--
-- The parent app needs to filter the doctor list down to "doctors who
-- actually use this clinic's dashboard" (otherwise leftover seed rows show
-- up). The cleanest way to express that is a PostgREST inner-join from
-- doctors -> doctor_auth, but the existing SELECT policy on doctor_auth
-- restricted reads to id = auth.uid() — so a parent's join returned zero
-- rows for everyone other than themselves.
--
-- For a clinic-facing app the doctor↔auth-user mapping isn't sensitive
-- (doctors are public-facing), so we open SELECT to all authenticated.
-- The previous "own row" policy is dropped to avoid policy OR'ing
-- confusion in EXPLAIN traces.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "doctor_auth_select_own" on public.doctor_auth;
drop policy if exists "doctor_auth_select_all" on public.doctor_auth;

create policy "doctor_auth_select_all" on public.doctor_auth
  for select to authenticated using (true);
