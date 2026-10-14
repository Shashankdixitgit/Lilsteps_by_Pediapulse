-- C2: remember the highest mental-health support level a check-in reached,
-- so the 112 / Tele-MANAS card comes back when the parent reopens it.
alter table public.checkin_sessions
  add column if not exists support_level text
  check (support_level in ('concern', 'crisis'));
