-- ─────────────────────────────────────────────────────────────────────────────
-- Doctor-side slot management policies
--
-- The dashboard needs to let the logged-in doctor INSERT and DELETE their
-- own time_slots. The existing UPDATE policy stays as-is — parents update
-- is_available=false when booking, which is the load-bearing path.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "time_slots_insert_doctor" on public.time_slots;
create policy "time_slots_insert_doctor" on public.time_slots
  for insert to authenticated
  with check (doctor_id = public.current_doctor_id());

drop policy if exists "time_slots_delete_doctor" on public.time_slots;
create policy "time_slots_delete_doctor" on public.time_slots
  for delete to authenticated
  using (doctor_id = public.current_doctor_id());
