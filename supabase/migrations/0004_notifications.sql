-- ─────────────────────────────────────────────────────────────────────────────
-- Notifications: push token storage + audit log
--
-- Notifications are sent via the `notify` Edge Function. We DON'T fan out from
-- DB triggers using pg_net here — instead, the application layer (parent app
-- and doctor dashboard) calls the function explicitly after key events
-- (appointment booking, prescription issued, message sent). This keeps the
-- trigger graph simple and gives us a single retry/observability surface.
--
-- Cron-driven reminders (appointment 24h/1h, vaccine due_soon) are dispatched
-- by separate cron-triggered Edge Functions that read the DB directly.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Parents: store Expo push token ────────────────────────────────────────────

alter table public.parents
  add column if not exists expo_push_token text;

-- ── notification_log ─────────────────────────────────────────────────────────
-- One row per dispatch attempt. Status lifecycle: queued → sent | failed.

create table if not exists public.notification_log (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null check (channel in ('sms', 'whatsapp', 'email', 'push')),
  template      text not null,
  recipient     text not null,            -- phone, email, or expo push token
  parent_id     uuid references public.parents(id) on delete set null,
  child_id      uuid references public.children(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  status        text not null default 'queued'
                 check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider_id   text,                     -- provider message id (Twilio SID, etc.)
  error         text,
  payload       jsonb,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index if not exists notification_log_parent_id_idx
  on public.notification_log(parent_id);
create index if not exists notification_log_status_idx
  on public.notification_log(status);
create index if not exists notification_log_template_idx
  on public.notification_log(template);

alter table public.notification_log enable row level security;

-- Parents can read their own delivery history (for "we tried to text you" UX).
drop policy if exists "notification_log_select_own" on public.notification_log;
create policy "notification_log_select_own" on public.notification_log
  for select to authenticated using (parent_id = auth.uid());

-- Writes happen via the `notify` Edge Function using the service role key,
-- which bypasses RLS — no INSERT/UPDATE policy needed for authenticated.
