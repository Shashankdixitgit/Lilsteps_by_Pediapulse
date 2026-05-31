-- ─────────────────────────────────────────────────────────────────────────────
-- Vaccine schedule auto-generation
--
-- Per Proposal §5 the parent app shows vaccination reminders, but the
-- `vaccinations` table had no creation path — children were inserted with
-- no schedule, so the Vaccine tab was always empty.
--
-- This migration:
--   • Adds `iap_vaccine_schedule(child_id, dob)` — inserts the standard
--     Indian Academy of Paediatrics (IAP) schedule for a child's DOB.
--   • Adds an AFTER INSERT trigger on `children` that calls it. Skips
--     children older than 16 (out of paediatric scope) and skips if rows
--     already exist (idempotent — safe for backfill).
--   • Status is computed from scheduled_date vs current_date:
--       overdue   — scheduled_date in the past
--       due_soon  — within next 14 days
--       upcoming  — further out
--
-- The schedule below is the standard IAP recommended immunisation chart
-- as of 2024 — clinics can extend / customise per their protocol.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: derive status from a scheduled date
create or replace function public.vaccine_status_for(sched date)
returns text
language sql
immutable
as $$
  select case
    when sched < current_date                          then 'overdue'
    when sched <= current_date + interval '14 days'    then 'due_soon'
    else 'upcoming'
  end;
$$;

-- Main generator: idempotent — only inserts if the child has no vaccinations.
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

  -- Skip children older than 16 (paediatric scope per Proposal §4).
  if (current_date - p_dob) > 16 * 365 then return; end if;

  insert into public.vaccinations (child_id, vaccine_name, dose_label, dose_number, scheduled_date, status)
  select
    p_child_id,
    v.vaccine_name,
    v.dose_label,
    v.dose_number,
    (p_dob + (v.offset_days || ' days')::interval)::date as scheduled_date,
    public.vaccine_status_for((p_dob + (v.offset_days || ' days')::interval)::date)
  from (values
    -- At birth
    ('BCG',                'Birth',       1, 0),
    ('OPV',                'OPV-0',       0, 0),
    ('Hepatitis B',        'Dose 1',      1, 0),

    -- 6 weeks (42 days)
    ('DTwP/DTaP',          'Dose 1',      1, 42),
    ('IPV',                'Dose 1',      1, 42),
    ('Hib',                'Dose 1',      1, 42),
    ('Hepatitis B',        'Dose 2',      2, 42),
    ('Rotavirus',          'Dose 1',      1, 42),
    ('PCV',                'Dose 1',      1, 42),

    -- 10 weeks (70 days)
    ('DTwP/DTaP',          'Dose 2',      2, 70),
    ('IPV',                'Dose 2',      2, 70),
    ('Hib',                'Dose 2',      2, 70),
    ('Rotavirus',          'Dose 2',      2, 70),
    ('PCV',                'Dose 2',      2, 70),

    -- 14 weeks (98 days)
    ('DTwP/DTaP',          'Dose 3',      3, 98),
    ('IPV',                'Dose 3',      3, 98),
    ('Hib',                'Dose 3',      3, 98),
    ('Rotavirus',          'Dose 3',      3, 98),
    ('PCV',                'Dose 3',      3, 98),

    -- 6 months (~182 days)
    ('Hepatitis B',        'Dose 3',      3, 182),
    ('Influenza',          'Annual',      1, 182),

    -- 9 months (~273 days)
    ('MMR',                'Dose 1',      1, 273),

    -- 12 months (~365 days)
    ('Hepatitis A',        'Dose 1',      1, 365),
    ('Typhoid Conjugate',  'Dose 1',      1, 365),

    -- 15 months (~456 days)
    ('MMR',                'Dose 2',      2, 456),
    ('Varicella',          'Dose 1',      1, 456),
    ('PCV',                'Booster',     4, 456),

    -- 18 months (~547 days)
    ('DTwP/DTaP',          'Booster 1',   4, 547),
    ('IPV',                'Booster 1',   4, 547),
    ('Hib',                'Booster',     4, 547),
    ('Hepatitis A',        'Dose 2',      2, 547),

    -- 4–6 years (~1825 days = 5 yrs)
    ('DTwP/DTaP',          'Booster 2',   5, 1825),
    ('OPV',                'Booster',     6, 1825),
    ('Varicella',          'Dose 2',      2, 1825),
    ('MMR',                'Dose 3',      3, 1825),

    -- 10–12 years
    ('Tdap',               'Adolescent',  1, 3650),

    -- 9–14 years (HPV — recommended for all per IAP 2023)
    ('HPV',                'Dose 1',      1, 3650),
    ('HPV',                'Dose 2',      2, 3833)   -- ~6 months later
  ) as v(vaccine_name, dose_label, dose_number, offset_days);
end;
$$;

-- Trigger: auto-generate on child insert
create or replace function public.handle_new_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.iap_vaccine_schedule(new.id, new.dob);
  return new;
end;
$$;

drop trigger if exists on_child_created_vaccines on public.children;
create trigger on_child_created_vaccines
  after insert on public.children
  for each row execute function public.handle_new_child();

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: any existing children in the DB without a schedule. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  c record;
begin
  for c in select id, dob from public.children loop
    perform public.iap_vaccine_schedule(c.id, c.dob);
  end loop;
end$$;
