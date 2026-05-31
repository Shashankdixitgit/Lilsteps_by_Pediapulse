-- ─────────────────────────────────────────────────────────────────────────────
-- Allow the assigned doctor to read child-scoped medical data
--
-- The doctor needs a complete clinical picture before the consultation:
-- allergies, chronic conditions, current medications, vaccination history,
-- growth trajectory, and parent-logged health notes/documents. Until now
-- these tables only had parent-scoped SELECT policies, so the doctor saw
-- only the appointment row and the AI check-in summary.
--
-- Doctor-side SELECT is gated by `current_doctor_id()` having at least one
-- appointment for the same child. Parents still own writes.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.doctor_has_appointment_with_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.appointments a
    where a.child_id = p_child_id
      and a.doctor_id = public.current_doctor_id()
  );
$$;

-- ── allergies ────────────────────────────────────────────────────────────────
drop policy if exists "allergies_select_doctor" on public.allergies;
create policy "allergies_select_doctor" on public.allergies
  for select to authenticated
  using (public.doctor_has_appointment_with_child(child_id));

-- ── conditions ───────────────────────────────────────────────────────────────
drop policy if exists "conditions_select_doctor" on public.conditions;
create policy "conditions_select_doctor" on public.conditions
  for select to authenticated
  using (public.doctor_has_appointment_with_child(child_id));

-- ── medications ──────────────────────────────────────────────────────────────
drop policy if exists "medications_select_doctor" on public.medications;
create policy "medications_select_doctor" on public.medications
  for select to authenticated
  using (public.doctor_has_appointment_with_child(child_id));

-- ── growth_measurements ─────────────────────────────────────────────────────
drop policy if exists "growth_measurements_select_doctor" on public.growth_measurements;
create policy "growth_measurements_select_doctor" on public.growth_measurements
  for select to authenticated
  using (public.doctor_has_appointment_with_child(child_id));

-- ── vaccinations ────────────────────────────────────────────────────────────
drop policy if exists "vaccinations_select_doctor" on public.vaccinations;
create policy "vaccinations_select_doctor" on public.vaccinations
  for select to authenticated
  using (public.doctor_has_appointment_with_child(child_id));

-- ── health_notes ────────────────────────────────────────────────────────────
drop policy if exists "health_notes_select_doctor" on public.health_notes;
create policy "health_notes_select_doctor" on public.health_notes
  for select to authenticated
  using (public.doctor_has_appointment_with_child(child_id));

-- ── documents ───────────────────────────────────────────────────────────────
drop policy if exists "documents_select_doctor" on public.documents;
create policy "documents_select_doctor" on public.documents
  for select to authenticated
  using (public.doctor_has_appointment_with_child(child_id));
