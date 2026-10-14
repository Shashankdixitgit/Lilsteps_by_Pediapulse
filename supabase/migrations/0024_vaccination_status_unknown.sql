-- ─────────────────────────────────────────────────────────────────────────────
-- Vaccinations: an 'unknown' status for doses the parent answered "Not sure".
--
-- Those doses are neither given nor proven missed, so storing them as
-- 'overdue' alarmed parents, and storing them as 'upcoming' (with a date in
-- the past) made them indistinguishable from a real upcoming dose. The
-- Vaccines tab shows them as "Not sure" with a "Mark given" action.
-- Reminders (vaccine-reminders: status in due_soon/upcoming) skip them.
--
-- Note: the other stored statuses are a snapshot taken at insert time (there
-- is no job that moves 'upcoming' to 'due_soon' to 'overdue'). The app works
-- out overdue / due now / upcoming from scheduled_date for display; only
-- 'done' and 'unknown' are read as stored.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.vaccinations drop constraint if exists vaccinations_status_check;
alter table public.vaccinations
  add constraint vaccinations_status_check
  check (status in ('done', 'due_soon', 'overdue', 'upcoming', 'unknown'));
