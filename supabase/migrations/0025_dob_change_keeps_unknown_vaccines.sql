-- ─────────────────────────────────────────────────────────────────────────────
-- 0025: keep "Not sure" ('unknown', 0024) doses when the DOB changes
--
-- 0023 rebuilds the schedule on a DOB edit and re-applied only 'done' and
-- past-due 'upcoming' rows. Since 0024, onboarding saves "Not sure" answers
-- as 'unknown', so those were lost (shown as Overdue again). This keeps an
-- 'unknown' dose as 'unknown' wherever the rebuilt schedule marks it overdue.
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
    and (status in ('done', 'unknown') or (status = 'upcoming' and scheduled_date < current_date));

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
  set status = case when k->>'status' = 'unknown' then 'unknown' else 'upcoming' end
  from jsonb_array_elements(kept) k
  where v.child_id = new.id
    and k->>'status' in ('upcoming', 'unknown')
    and v.status = 'overdue'
    and v.vaccine_name = k->>'vaccine_name'
    and v.dose_number = (k->>'dose_number')::int;

  return new;
end;
$$;

revoke execute on function public.handle_child_dob_change() from public, anon, authenticated;
