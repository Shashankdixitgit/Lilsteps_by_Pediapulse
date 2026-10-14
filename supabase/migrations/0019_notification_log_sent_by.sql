-- ─────────────────────────────────────────────────────────────────────────────
-- notification_log.sent_by — who asked for this notification
--
-- The `notify` Edge Function now records the calling user on every row so it
-- can rate-limit per caller (count of rows in the last hour). Cron reminder
-- functions leave it null.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.notification_log
  add column if not exists sent_by uuid references auth.users(id) on delete set null;

create index if not exists notification_log_sent_by_created_at_idx
  on public.notification_log(sent_by, created_at desc);
