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
