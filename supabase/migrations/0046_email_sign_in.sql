-- 0046: parents sign up and sign in with EMAIL (SMS is off until DLT).
--
-- 1. Sign-up guard (private.hook_before_user_created, first added in 0034).
--    Before: email sign-ups only for allow-listed addresses (test doctors and
--    the demo domain); phone sign-ups open. Now parents sign up by email, so
--    any address may sign up, EXCEPT the reserved LilSteps test domains
--    (lilsteps.dev and its sub-domains, e.g. demo.lilsteps.dev): those still
--    need an allow-list entry, so nobody can register a look-alike test
--    doctor login. Being able to sign up never makes anyone a doctor: doctor
--    access comes only from a doctor_auth row, which only an admin inserts.
--    Email confirmation (a 6-digit code) proves the parent owns the address;
--    that is an Auth setting, see the PR's deploy steps.
-- 2. handle_new_user also copies the name typed at sign-up (user metadata)
--    into parents.name. Display only: user metadata is user-editable and is
--    never used for authorisation.
-- 3. Existing parents get their auth email copied into parents.email where
--    it is missing, so booking emails reach them.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Sign-up guard ────────────────────────────────────────────────────────

create or replace function private.hook_before_user_created(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(event->'user'->>'email', '')));
  v_domain text := split_part(lower(btrim(coalesce(event->'user'->>'email', ''))), '@', 2);
begin
  -- Phone sign-ups (only when SMS sign-in is switched on) are allowed.
  if v_email = '' then
    return '{}'::jsonb;
  end if;

  -- Reserved test domains: only exact allow-listed logins (or an allow-listed domain).
  if v_domain = 'lilsteps.dev' or v_domain like '%.lilsteps.dev' then
    if exists (
      select 1 from private.signup_email_allowlist l
      where l.entry = v_email or l.entry = v_domain
    ) then
      return '{}'::jsonb;
    end if;
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email address can''t be used to sign up. Please use your own email address.'
    ));
  end if;

  return '{}'::jsonb;
end;
$$;

revoke execute on function private.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function private.hook_before_user_created(jsonb) to supabase_auth_admin;

-- ── 2. handle_new_user: email + name ────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.parents (id, email, name)
  values (
    new.id,
    lower(new.email),
    nullif(left(btrim(coalesce(new.raw_user_meta_data->>'name', '')), 80), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── 3. Backfill parents.email ───────────────────────────────────────────────

update public.parents p
   set email = lower(u.email)
  from auth.users u
 where u.id = p.id
   and u.email is not null
   and (p.email is null or btrim(p.email) = '');

-- ── 4. One booking email per appointment, even when two callers race ────────
-- The payment webhook and the app's status check can both confirm a consult
-- at the same moment; each then tries to send the confirmation. A second
-- 'queued'/'sent' row for the same appointment + one-off template + channel
-- is refused, and the sender skips that channel (_shared/parentNotify.ts).
-- Any older duplicates are first marked so the index can be built.

update public.notification_log n
   set status = 'failed', error = coalesce(n.error, 'duplicate (0046)')
 where n.status in ('queued', 'sent')
   and n.appointment_id is not null
   and n.template in ('appointment_confirmation', 'appointment_cancelled', 'appointment_rescheduled',
                      'appointment_reminder_24h', 'appointment_reminder_1h')
   and exists (
     select 1 from public.notification_log o
      where o.appointment_id = n.appointment_id
        and o.template = n.template
        and o.channel = n.channel
        and o.status in ('queued', 'sent')
        and (o.created_at, o.id) < (n.created_at, n.id)
   );

create unique index if not exists notification_log_one_booking_message_uidx
  on public.notification_log (appointment_id, template, channel)
  where status in ('queued', 'sent')
    and template in ('appointment_confirmation', 'appointment_cancelled', 'appointment_reminder_24h',
                     'appointment_reminder_1h');

-- ── 5. Names are one plain line (they go into email text) ───────────────────
-- Checked on the live data first (none fail). NOT VALID + VALIDATE keeps the
-- lock short; renderEmail also strips control characters itself.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'children_name_plain') then
    alter table public.children add constraint children_name_plain
      check (name !~ '[[:cntrl:]]' and char_length(name) <= 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'parents_name_plain') then
    alter table public.parents add constraint parents_name_plain
      check (name is null or (name !~ '[[:cntrl:]]' and char_length(name) <= 80)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'doctors_name_plain') then
    alter table public.doctors add constraint doctors_name_plain
      check (name !~ '[[:cntrl:]]' and char_length(name) <= 80) not valid;
  end if;
end $$;
alter table public.children validate constraint children_name_plain;
alter table public.parents  validate constraint parents_name_plain;
alter table public.doctors  validate constraint doctors_name_plain;

-- ── 6. Attempt limits (dashboard password reset, demo sign-up) ──────────────
-- Cloud Run and Edge Functions run many short-lived instances, so the count
-- has to live in the database. Only the service role (server code) can use
-- these; nothing here is reachable from the app or the browser.

create table if not exists private.auth_attempts (
  id         bigint generated always as identity primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_key_created_idx on private.auth_attempts (key, created_at);
revoke all on private.auth_attempts from public, anon, authenticated;

-- Records one attempt for `p_key` and returns true, unless `p_max` attempts
-- were already made within `p_window_seconds` (then false, nothing recorded).
create or replace function public.note_auth_attempt(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_key is null or char_length(p_key) > 300 or p_max < 1 or p_window_seconds < 1 then
    return false;
  end if;
  -- One attempt at a time per key, so two parallel requests can't both pass.
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));
  delete from private.auth_attempts where key = p_key and created_at < now() - interval '2 days';
  select count(*) into v_count
    from private.auth_attempts
   where key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_max then
    return false;
  end if;
  insert into private.auth_attempts (key) values (p_key);
  return true;
end;
$$;
revoke execute on function public.note_auth_attempt(text, integer, integer) from public, anon, authenticated;
grant execute on function public.note_auth_attempt(text, integer, integer) to service_role;

-- Whether an email address is a doctor dashboard login (the dashboard only
-- sends reset codes to those). Service role only: it would otherwise let
-- anyone test which addresses belong to doctors.
create or replace function public.is_dashboard_login(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users u
      join public.doctor_auth d on d.id = u.id
     where lower(u.email) = lower(btrim(p_email))
  );
$$;
revoke execute on function public.is_dashboard_login(text) from public, anon, authenticated;
grant execute on function public.is_dashboard_login(text) to service_role;
