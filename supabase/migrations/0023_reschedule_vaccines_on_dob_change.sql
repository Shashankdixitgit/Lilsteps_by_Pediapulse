-- ─────────────────────────────────────────────────────────────────────────────
-- 0023: rebuild a child's vaccine schedule when the date of birth changes
--
-- Profile > Edit child lets a parent correct the date of birth. The schedule
-- rows (public.vaccinations) were built from the old DOB by the insert
-- trigger, so every due date and status would stay wrong.
--
-- On UPDATE OF dob (only when the value really changes) this:
--   1. remembers doses already marked 'done' (with their administered_date),
--      and doses kept as 'upcoming' although already past due (onboarding's
--      "Not sure" answer, never an overdue alarm);
--   2. deletes the child's schedule rows;
--   3. rebuilds them with the existing public.iap_vaccine_schedule(), so the
--      dose list and calendar offsets stay in one place (0014);
--   4. re-applies 'done' to the remembered doses, and 'upcoming' to the
--      remembered "Not sure" doses that are still past due.
-- A DOB outside the 0–15 scope gets no schedule, same as on insert.
-- SECURITY DEFINER like handle_new_child (0006); not callable by clients.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_child_dob_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kept jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'vaccine_name', vaccine_name,
           'dose_number', dose_number,
           'status', status,
           'administered_date', administered_date)), '[]'::jsonb)
    into kept
  from public.vaccinations
  where child_id = new.id
    and (status = 'done' or (status = 'upcoming' and scheduled_date < current_date));

  delete from public.vaccinations where child_id = new.id;

  perform public.iap_vaccine_schedule(new.id, new.dob);

  update public.vaccinations v
  set status = 'done', administered_date = (k->>'administered_date')::date
  from jsonb_array_elements(kept) k
  where v.child_id = new.id
    and k->>'status' = 'done'
    and v.vaccine_name = k->>'vaccine_name'
    and v.dose_number = (k->>'dose_number')::int;

  update public.vaccinations v
  set status = 'upcoming'
  from jsonb_array_elements(kept) k
  where v.child_id = new.id
    and k->>'status' = 'upcoming'
    and v.status = 'overdue'
    and v.vaccine_name = k->>'vaccine_name'
    and v.dose_number = (k->>'dose_number')::int;

  return new;
end;
$$;

revoke execute on function public.handle_child_dob_change() from public, anon, authenticated;

drop trigger if exists on_child_dob_changed_vaccines on public.children;
create trigger on_child_dob_changed_vaccines
  after update of dob on public.children
  for each row
  when (old.dob is distinct from new.dob)
  execute function public.handle_child_dob_change();
