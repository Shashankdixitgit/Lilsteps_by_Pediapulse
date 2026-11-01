-- 0055: clinic-style prescription (doctor dashboard "new prescription" page).
--
-- The Telemedicine Practice Guidelines 2020 (Annexure 2, sample prescription
-- format) and the IMC (Professional Conduct, Etiquette and Ethics)
-- Regulations 2002 expect a prescription to carry the chief complaints, the
-- examination findings, the diagnosis or provisional diagnosis, each medicine
-- with its form / strength / frequency / duration, and special instructions.
-- Until now a prescription held only medicines and one free-text note.
--
-- 1. prescriptions: new nullable columns chief_complaints, examination,
--    diagnosis, advice (special instructions: diet, fluids, "come back if"),
--    follow_up_date and follow_up_text. Old rows keep nulls.
-- 2. prescription_items: new nullable columns brand, strength (form /
--    strength, e.g. "Syrup 250 mg/5 ml"), route and timing (before / after
--    food). The generic name stays in `medicine`.
--    Length CHECKs on all of them, like 0050 (NOT VALID + VALIDATE; every
--    existing value is null, so validation is instant).
-- 3. create_prescription(header, items) reads the new fields. Same signature,
--    so grants and callers are unchanged. An old-style payload (no new keys)
--    still works: the diagnosis is required by the dashboard's server action,
--    not by the RPC, so a dashboard build from before this migration keeps
--    issuing during the deploy window. follow_up_date must be between today
--    (IST) and one year ahead.
-- 4. doctor_saved_medicines: a doctor's own favourite medicine rows ("My
--    saved medicines"), added to a prescription in one click. RLS: a doctor
--    reads, adds and removes only their own; nobody else (parents, other
--    doctors, anon) sees them. No UPDATE: remove and save again.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. prescriptions: clinical note, advice, follow-up ──────────────────────

alter table public.prescriptions
  add column if not exists chief_complaints text,
  add column if not exists examination      text,
  add column if not exists diagnosis        text,
  add column if not exists advice           text,
  add column if not exists follow_up_date   date,
  add column if not exists follow_up_text   text;

comment on column public.prescriptions.chief_complaints is 'Chief complaints, as written by the doctor at issue time.';
comment on column public.prescriptions.examination is 'Examination / lab findings (optional).';
comment on column public.prescriptions.diagnosis is 'Diagnosis or provisional diagnosis. Required by the dashboard for new prescriptions; null on rows from before 0055.';
comment on column public.prescriptions.advice is 'Special instructions: diet, fluids, red-flag "come back if" signs.';
comment on column public.prescriptions.follow_up_date is 'Suggested follow-up date (IST calendar day), if any.';
comment on column public.prescriptions.follow_up_text is 'Follow-up in words, e.g. "Review in 3 days or earlier if fever persists".';

alter table public.prescriptions drop constraint if exists prescriptions_chief_complaints_check;
alter table public.prescriptions add constraint prescriptions_chief_complaints_check
  check (chief_complaints is null or char_length(chief_complaints) <= 1000) not valid;
alter table public.prescriptions drop constraint if exists prescriptions_examination_check;
alter table public.prescriptions add constraint prescriptions_examination_check
  check (examination is null or char_length(examination) <= 1000) not valid;
alter table public.prescriptions drop constraint if exists prescriptions_diagnosis_check;
alter table public.prescriptions add constraint prescriptions_diagnosis_check
  check (diagnosis is null or (btrim(diagnosis) <> '' and char_length(diagnosis) <= 500)) not valid;
alter table public.prescriptions drop constraint if exists prescriptions_advice_check;
alter table public.prescriptions add constraint prescriptions_advice_check
  check (advice is null or char_length(advice) <= 2000) not valid;
alter table public.prescriptions drop constraint if exists prescriptions_follow_up_text_check;
alter table public.prescriptions add constraint prescriptions_follow_up_text_check
  check (follow_up_text is null or char_length(follow_up_text) <= 200) not valid;

alter table public.prescriptions validate constraint prescriptions_chief_complaints_check;
alter table public.prescriptions validate constraint prescriptions_examination_check;
alter table public.prescriptions validate constraint prescriptions_diagnosis_check;
alter table public.prescriptions validate constraint prescriptions_advice_check;
alter table public.prescriptions validate constraint prescriptions_follow_up_text_check;

-- ── 2. prescription_items: brand, strength, route, timing ───────────────────

alter table public.prescription_items
  add column if not exists brand    text,
  add column if not exists strength text,
  add column if not exists route    text,
  add column if not exists timing   text;

comment on column public.prescription_items.medicine is 'Generic name (IMC Regulations 2002 §1.5).';
comment on column public.prescription_items.brand is 'Optional brand name, shown after the generic name.';
comment on column public.prescription_items.strength is 'Drug form and strength, e.g. "Syrup 250 mg/5 ml".';
comment on column public.prescription_items.route is 'Route, e.g. Oral, Nebulised, Topical.';
comment on column public.prescription_items.timing is 'When to take it relative to food, e.g. "After food".';

alter table public.prescription_items drop constraint if exists prescription_items_brand_check;
alter table public.prescription_items add constraint prescription_items_brand_check
  check (brand is null or char_length(brand) <= 120) not valid;
alter table public.prescription_items drop constraint if exists prescription_items_strength_check;
alter table public.prescription_items add constraint prescription_items_strength_check
  check (strength is null or char_length(strength) <= 80) not valid;
alter table public.prescription_items drop constraint if exists prescription_items_route_check;
alter table public.prescription_items add constraint prescription_items_route_check
  check (route is null or char_length(route) <= 40) not valid;
alter table public.prescription_items drop constraint if exists prescription_items_timing_check;
alter table public.prescription_items add constraint prescription_items_timing_check
  check (timing is null or char_length(timing) <= 40) not valid;

alter table public.prescription_items validate constraint prescription_items_brand_check;
alter table public.prescription_items validate constraint prescription_items_strength_check;
alter table public.prescription_items validate constraint prescription_items_route_check;
alter table public.prescription_items validate constraint prescription_items_timing_check;

-- ── 3. create_prescription ──────────────────────────────────────────────────
-- header: { child_id, appointment_id?, notes?, chief_complaints?, examination?,
--           diagnosis?, advice?, follow_up_date? (YYYY-MM-DD), follow_up_text? }
-- items:  [ { medicine, dose, frequency, duration?, notes?, brand?, strength?,
--             route?, timing? }, ... ] (1-30)
-- Returns the new prescription id. Messages are shown to the doctor as-is.

create or replace function public.create_prescription(header jsonb, items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor    uuid := private.current_doctor_id();
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  v_child     uuid;
  v_appt      uuid;
  v_notes     text;
  v_complaint text;
  v_exam      text;
  v_diagnosis text;
  v_advice    text;
  v_follow_d  date;
  v_follow_t  text;
  v_reg       text;
  v_rx        uuid;
  v_item      jsonb;
  v_medicine  text;
  v_dose      text;
  v_freq      text;
  v_duration  text;
  v_inotes    text;
  v_brand     text;
  v_strength  text;
  v_route     text;
  v_timing    text;
  v_pos       integer := 0;
begin
  if v_doctor is null then
    raise exception 'Not signed in as a doctor.' using errcode = '42501';
  end if;
  if header is null or jsonb_typeof(header) <> 'object' then
    raise exception 'Missing prescription details.' using errcode = '22023';
  end if;

  begin
    v_child := nullif(btrim(header->>'child_id'), '')::uuid;
    v_appt  := nullif(btrim(header->>'appointment_id'), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Missing child or visit.' using errcode = '22023';
  end;
  if v_child is null then
    raise exception 'Missing child.' using errcode = '22023';
  end if;

  select nullif(btrim(d.registration_number), '') into v_reg
    from public.doctors d where d.id = v_doctor;
  if v_reg is null then
    raise exception 'Add your medical council registration number in Settings before issuing a prescription. It must be printed on every prescription.'
      using errcode = 'P0001';
  end if;

  if v_appt is not null then
    -- Only this doctor's own, real visit with this child.
    perform 1 from public.appointments a
     where a.id = v_appt
       and a.doctor_id = v_doctor
       and a.child_id = v_child
       and a.status in ('upcoming', 'completed');
    if not found then
      raise exception 'This visit is not one of yours for this child, so the prescription cannot be attached to it.'
        using errcode = '42501';
    end if;
  elsif not private.doctor_treats_child(v_child) then
    raise exception 'You can only prescribe for a child you have a consult or chat with.' using errcode = '42501';
  end if;

  v_notes     := nullif(btrim(coalesce(header->>'notes', '')), '');
  v_complaint := nullif(btrim(coalesce(header->>'chief_complaints', '')), '');
  v_exam      := nullif(btrim(coalesce(header->>'examination', '')), '');
  v_diagnosis := nullif(btrim(coalesce(header->>'diagnosis', '')), '');
  v_advice    := nullif(btrim(coalesce(header->>'advice', '')), '');
  v_follow_t  := nullif(btrim(coalesce(header->>'follow_up_text', '')), '');
  if char_length(v_notes) > 1000 then
    raise exception 'Notes can be up to 1000 characters.' using errcode = '22023';
  end if;
  if char_length(v_complaint) > 1000 or char_length(v_exam) > 1000 then
    raise exception 'Chief complaints and examination findings can be up to 1000 characters each.' using errcode = '22023';
  end if;
  if char_length(v_diagnosis) > 500 then
    raise exception 'The diagnosis can be up to 500 characters.' using errcode = '22023';
  end if;
  if char_length(v_advice) > 2000 then
    raise exception 'Special instructions can be up to 2000 characters.' using errcode = '22023';
  end if;
  if char_length(v_follow_t) > 200 then
    raise exception 'The follow-up note can be up to 200 characters.' using errcode = '22023';
  end if;

  begin
    v_follow_d := nullif(btrim(coalesce(header->>'follow_up_date', '')), '')::date;
  exception when others then
    raise exception 'The follow-up date is not a valid date.' using errcode = '22023';
  end;
  if v_follow_d is not null and (v_follow_d < v_today or v_follow_d > v_today + 366) then
    raise exception 'The follow-up date must be between today and one year from now.' using errcode = '22023';
  end if;

  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Add at least one medicine.' using errcode = '22023';
  end if;
  if jsonb_array_length(items) > 30 then
    raise exception 'A prescription can have up to 30 medicines.' using errcode = '22023';
  end if;

  insert into public.prescriptions (
    child_id, doctor_id, appointment_id, notes,
    chief_complaints, examination, diagnosis, advice, follow_up_date, follow_up_text
  )
  values (
    v_child, v_doctor, v_appt, v_notes,
    v_complaint, v_exam, v_diagnosis, v_advice, v_follow_d, v_follow_t
  )
  returning id into v_rx;

  for v_item in select value from jsonb_array_elements(items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each medicine needs name, dose, and frequency.' using errcode = '22023';
    end if;
    v_medicine := btrim(coalesce(v_item->>'medicine', ''));
    v_dose     := btrim(coalesce(v_item->>'dose', ''));
    v_freq     := btrim(coalesce(v_item->>'frequency', ''));
    v_duration := nullif(btrim(coalesce(v_item->>'duration', '')), '');
    v_inotes   := nullif(btrim(coalesce(v_item->>'notes', '')), '');
    v_brand    := nullif(btrim(coalesce(v_item->>'brand', '')), '');
    v_strength := nullif(btrim(coalesce(v_item->>'strength', '')), '');
    v_route    := nullif(btrim(coalesce(v_item->>'route', '')), '');
    v_timing   := nullif(btrim(coalesce(v_item->>'timing', '')), '');
    if v_medicine = '' or v_dose = '' or v_freq = '' then
      raise exception 'Each medicine needs name, dose, and frequency.' using errcode = '22023';
    end if;
    if char_length(v_medicine) > 120 or char_length(v_dose) > 80 or char_length(v_freq) > 80
       or char_length(v_duration) > 80 or char_length(v_inotes) > 300
       or char_length(v_brand) > 120 or char_length(v_strength) > 80
       or char_length(v_route) > 40 or char_length(v_timing) > 40 then
      raise exception 'Keep each medicine short: name and brand up to 120 characters, strength, dose, frequency and duration up to 80, route and timing up to 40, instructions up to 300.'
        using errcode = '22023';
    end if;
    insert into public.prescription_items (
      prescription_id, medicine, dose, frequency, duration, notes, position,
      brand, strength, route, timing
    )
    values (
      v_rx, v_medicine, v_dose, v_freq, v_duration, v_inotes, v_pos,
      v_brand, v_strength, v_route, v_timing
    );
    v_pos := v_pos + 1;
  end loop;

  return v_rx;
end;
$$;
revoke execute on function public.create_prescription(jsonb, jsonb) from public, anon;
grant execute on function public.create_prescription(jsonb, jsonb) to authenticated;

-- ── 4. doctor_saved_medicines ───────────────────────────────────────────────

create table if not exists public.doctor_saved_medicines (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null default private.current_doctor_id()
             references public.doctors(id) on delete cascade,
  medicine   text not null check (btrim(medicine) <> '' and char_length(medicine) <= 120),
  brand      text check (brand is null or char_length(brand) <= 120),
  strength   text check (strength is null or char_length(strength) <= 80),
  dose       text check (dose is null or char_length(dose) <= 80),
  frequency  text check (frequency is null or char_length(frequency) <= 80),
  duration   text check (duration is null or char_length(duration) <= 80),
  route      text check (route is null or char_length(route) <= 40),
  timing     text check (timing is null or char_length(timing) <= 40),
  notes      text check (notes is null or char_length(notes) <= 300),
  created_at timestamptz not null default now()
);

comment on table public.doctor_saved_medicines is
  'A doctor''s own favourite medicine rows for the prescription form. Private to that doctor (RLS).';

-- The list is read per doctor, newest first.
create index if not exists doctor_saved_medicines_doctor_created_idx
  on public.doctor_saved_medicines (doctor_id, created_at desc);
-- Saving the same row twice is a no-op for the doctor (the action reports "already saved").
create unique index if not exists doctor_saved_medicines_one_per_row_uidx
  on public.doctor_saved_medicines (
    doctor_id, lower(medicine), coalesce(lower(strength), ''), coalesce(lower(dose), ''), coalesce(lower(frequency), '')
  );

alter table public.doctor_saved_medicines enable row level security;

-- Supabase's default privileges grant everything; keep only what the policies cover.
revoke all on public.doctor_saved_medicines from public, anon, authenticated;
grant select, insert, delete on public.doctor_saved_medicines to authenticated;

drop policy if exists "doctor_saved_medicines_select_own" on public.doctor_saved_medicines;
create policy "doctor_saved_medicines_select_own" on public.doctor_saved_medicines
  for select to authenticated
  using (doctor_id = (select private.current_doctor_id()));

drop policy if exists "doctor_saved_medicines_insert_own" on public.doctor_saved_medicines;
create policy "doctor_saved_medicines_insert_own" on public.doctor_saved_medicines
  for insert to authenticated
  with check (doctor_id = (select private.current_doctor_id()));

drop policy if exists "doctor_saved_medicines_delete_own" on public.doctor_saved_medicines;
create policy "doctor_saved_medicines_delete_own" on public.doctor_saved_medicines
  for delete to authenticated
  using (doctor_id = (select private.current_doctor_id()));

notify pgrst, 'reload schema';
