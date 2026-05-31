-- ─────────────────────────────────────────────────────────────────────────────
-- Let the logged-in doctor update their own doctors row
--
-- Until now `doctors` had only SELECT policies — no doctor could change
-- their name, hospital, default_meet_link etc. from the dashboard. Add an
-- UPDATE policy scoped to current_doctor_id() so doctors can edit only
-- their own row.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "doctors_update_self" on public.doctors;
create policy "doctors_update_self" on public.doctors
  for update to authenticated
  using (id = public.current_doctor_id())
  with check (id = public.current_doctor_id());
