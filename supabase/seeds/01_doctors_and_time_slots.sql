-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: doctors + time_slots
--
-- Run this once via Supabase Dashboard → SQL Editor → paste + Run.
-- Idempotent: safe to re-run; uses ON CONFLICT to skip duplicates.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Doctors ──────────────────────────────────────────────────────────────────
-- Note: doctors table has no unique constraint on name — we guard with NOT EXISTS
-- so re-running this script doesn't create duplicates.
INSERT INTO public.doctors (name, specialisation, hospital, is_available)
SELECT * FROM (VALUES
  ('Dr. Sarah Miller',  'Pediatrician',                'St. Jude''s Pediatric Center', true),
  ('Dr. Ramesh Gupta',  'General Physician',           'Apollo Children''s Clinic',    true),
  ('Dr. Emily Chen',    'Developmental Pediatrician',  'City Health Clinic',           true)
) AS v(name, specialisation, hospital, is_available)
WHERE NOT EXISTS (
  SELECT 1 FROM public.doctors d WHERE d.name = v.name
);

-- ─── Time slots ──────────────────────────────────────────────────────────────
-- Slots come from the rolling generator (migration 0030): 14 days ahead,
-- Mon–Sat 10:00–13:00 and 17:00–20:00 IST, topped up daily by pg_cron. It
-- only fills doctors who have a dashboard login (doctor_auth), so this file no
-- longer writes its own grid (the old one also marked ~25% of slots "booked"
-- with no appointment behind them).
select public.generate_rolling_slots(14);

-- ─── Verification ─────────────────────────────────────────────────────────────
-- After running the inserts, these should print non-zero counts.
SELECT 'doctors'    AS table_name, count(*) FROM public.doctors
UNION ALL
SELECT 'time_slots' AS table_name, count(*) FROM public.time_slots;
