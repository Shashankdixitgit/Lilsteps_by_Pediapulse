-- ─────────────────────────────────────────────────────────────────────────────
-- Doctor's Google Meet (or any conferencing) join link
--
-- Replacing the 100ms integration with a simpler per-doctor permanent video
-- link. The doctor creates a Meet room once at https://meet.google.com/new
-- (or uses their personal Meet PMR) and saves the URL here. Every
-- consultation uses the same link; the doctor admits parents from the Meet
-- waiting room. Works on web, iOS Meet app, Android Meet app.
--
-- Per-appointment unique links would require Google Calendar API access
-- (OAuth flow or Workspace service account) — overkill for a single-doctor
-- clinic, can be added later by populating video_rooms.room_id with a
-- per-appointment link.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.doctors
  add column if not exists default_meet_link text;

comment on column public.doctors.default_meet_link is
  'Permanent Google Meet (or any conferencing) URL the doctor uses for all '
  'video consultations. Parents and the doctor open the same link.';
