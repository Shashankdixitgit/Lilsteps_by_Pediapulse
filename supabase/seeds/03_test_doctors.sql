-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: test doctors for TestFlight / Play internal testing
--
-- TEST DATA. These are not real doctor profiles. Qualifications and bios say
-- so, and should be replaced (or the doctors removed) before real patients use
-- the app.
--
-- Same setup as Dr. Emily Chen (doctor.test@lilsteps.dev):
--   1. a public.doctors row                       (this file, step 1)
--   2. an email + password auth user, confirmed   (create_test_doctor_logins.mjs)
--   3. a public.doctor_auth row linking the two   (this file, step 2)
-- The doctor_auth insert fires generate_rolling_slots (0030), so each doctor
-- has 14 days of bookable slots straight away. No Meet link is set: each
-- doctor pastes their own in dashboard Settings (parents see an honest
-- "no link yet" message until then).
--
-- Run order: step 1 here → node supabase/seeds/create_test_doctor_logins.mjs
-- → step 2 here. Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: doctor rows ─────────────────────────────────────────────────────
insert into public.doctors (name, specialisation, hospital, is_available, qualifications, bio)
select v.name, v.specialisation, v.hospital, true, v.qualifications, v.bio
from (values
  ('Dr. Madhav',   'Pediatrician', 'LilSteps Test Clinic',
   'Test profile · qualifications to be added',
   'Test doctor account for app testing. Not a real consultation profile.'),
  ('Dr. Atish',    'Pediatrician', 'LilSteps Test Clinic',
   'Test profile · qualifications to be added',
   'Test doctor account for app testing. Not a real consultation profile.'),
  ('Dr. Shashank', 'Pediatrician', 'LilSteps Test Clinic',
   'Test profile · qualifications to be added',
   'Test doctor account for app testing. Not a real consultation profile.')
) as v(name, specialisation, hospital, qualifications, bio)
where not exists (select 1 from public.doctors d where d.name = v.name);

-- Dr. Emily Chen is test data too.
update public.doctors
   set qualifications = coalesce(qualifications, 'Test profile · qualifications to be added'),
       bio = coalesce(bio, 'Test doctor account for app testing. Not a real consultation profile.')
 where name = 'Dr. Emily Chen';

-- ── Step 2: link each login to its doctor row ───────────────────────────────
insert into public.doctor_auth (id, doctor_id)
select u.id, d.id
from (values
  ('doctor.madhav@lilsteps.dev',   'Dr. Madhav'),
  ('doctor.atish@lilsteps.dev',    'Dr. Atish'),
  ('doctor.shashank@lilsteps.dev', 'Dr. Shashank')
) as v(email, name)
join auth.users u on lower(u.email) = v.email
join public.doctors d on d.name = v.name
on conflict do nothing;
