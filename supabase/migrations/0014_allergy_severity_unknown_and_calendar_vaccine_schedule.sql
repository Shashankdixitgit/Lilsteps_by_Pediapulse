-- ─────────────────────────────────────────────────────────────────────────────
-- 0014: onboarding QA fixes (13 Oct 2026 test report)
--
-- (a) allergies.severity: onboarding never asks how severe an allergy is, so
--     it was saved as 'mild' for everything, including "Peanut (anaphylaxis)".
--     Allow 'unknown' and make it the default. Existing values stay valid.
--
-- (b) iap_vaccine_schedule: dose offsets were counted in days (365 per year,
--     ~30.4 per month), so doses due at whole years landed a day or more early
--     (e.g. the 5-year booster on the day before the 5th birthday). Offsets are
--     now calendar intervals (weeks / months / years) added to the DOB.
--     The 16-year scope check also uses calendar years, matching the app.
--     Signature, SECURITY DEFINER, search_path and the 0013 revoke are kept.
--     Existing rows are not rescheduled; only new children are affected.
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) allergy severity
alter table public.allergies drop constraint if exists allergies_severity_check;
alter table public.allergies
  add constraint allergies_severity_check
  check (severity in ('mild', 'moderate', 'severe', 'unknown'));
alter table public.allergies alter column severity set default 'unknown';

-- (b) calendar-correct vaccine schedule
create or replace function public.iap_vaccine_schedule(p_child_id uuid, p_dob date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count int;
begin
  select count(*) into existing_count from public.vaccinations where child_id = p_child_id;
  if existing_count > 0 then return; end if;

  -- Skip children aged 16 or over (paediatric scope per Proposal §4).
  if current_date >= (p_dob + interval '16 years')::date then return; end if;

  insert into public.vaccinations (child_id, vaccine_name, dose_label, dose_number, scheduled_date, status)
  select
    p_child_id,
    v.vaccine_name,
    v.dose_label,
    v.dose_number,
    (p_dob + v.due_at::interval)::date as scheduled_date,
    public.vaccine_status_for((p_dob + v.due_at::interval)::date)
  from (values
    -- At birth
    ('BCG',                'Birth',       1, '0 days'),
    ('OPV',                'OPV-0',       0, '0 days'),
    ('Hepatitis B',        'Dose 1',      1, '0 days'),

    -- 6 weeks
    ('DTwP/DTaP',          'Dose 1',      1, '6 weeks'),
    ('IPV',                'Dose 1',      1, '6 weeks'),
    ('Hib',                'Dose 1',      1, '6 weeks'),
    ('Hepatitis B',        'Dose 2',      2, '6 weeks'),
    ('Rotavirus',          'Dose 1',      1, '6 weeks'),
    ('PCV',                'Dose 1',      1, '6 weeks'),

    -- 10 weeks
    ('DTwP/DTaP',          'Dose 2',      2, '10 weeks'),
    ('IPV',                'Dose 2',      2, '10 weeks'),
    ('Hib',                'Dose 2',      2, '10 weeks'),
    ('Rotavirus',          'Dose 2',      2, '10 weeks'),
    ('PCV',                'Dose 2',      2, '10 weeks'),

    -- 14 weeks
    ('DTwP/DTaP',          'Dose 3',      3, '14 weeks'),
    ('IPV',                'Dose 3',      3, '14 weeks'),
    ('Hib',                'Dose 3',      3, '14 weeks'),
    ('Rotavirus',          'Dose 3',      3, '14 weeks'),
    ('PCV',                'Dose 3',      3, '14 weeks'),

    -- 6 months
    ('Hepatitis B',        'Dose 3',      3, '6 months'),
    ('Influenza',          'Annual',      1, '6 months'),

    -- 9 months
    ('MMR',                'Dose 1',      1, '9 months'),

    -- 12 months
    ('Hepatitis A',        'Dose 1',      1, '12 months'),
    ('Typhoid Conjugate',  'Dose 1',      1, '12 months'),

    -- 15 months
    ('MMR',                'Dose 2',      2, '15 months'),
    ('Varicella',          'Dose 1',      1, '15 months'),
    ('PCV',                'Booster',     4, '15 months'),

    -- 18 months
    ('DTwP/DTaP',          'Booster 1',   4, '18 months'),
    ('IPV',                'Booster 1',   4, '18 months'),
    ('Hib',                'Booster',     4, '18 months'),
    ('Hepatitis A',        'Dose 2',      2, '18 months'),

    -- 4–6 years (scheduled at the 5th birthday)
    ('DTwP/DTaP',          'Booster 2',   5, '5 years'),
    ('OPV',                'Booster',     6, '5 years'),
    ('Varicella',          'Dose 2',      2, '5 years'),
    ('MMR',                'Dose 3',      3, '5 years'),

    -- 10–12 years
    ('Tdap',               'Adolescent',  1, '10 years'),

    -- 9–14 years (HPV — recommended for all per IAP 2023)
    ('HPV',                'Dose 1',      1, '10 years'),
    ('HPV',                'Dose 2',      2, '10 years 6 months')
  ) as v(vaccine_name, dose_label, dose_number, due_at);
end;
$$;

-- create or replace keeps existing grants, but re-apply 0013's revoke so this
-- migration is safe on a fresh database too.
revoke execute on function public.iap_vaccine_schedule(uuid, date) from public, anon, authenticated;
