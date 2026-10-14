-- ─────────────────────────────────────────────────────────────────────────────
-- Security hardening before store submission (TestFlight / Play testing)
--
-- 1. RLS helper functions move to a `private` schema that the API does not
--    expose. The public.* names stay as thin SECURITY INVOKER wrappers, so
--    every existing policy (and any policy another migration adds) keeps
--    working, but nothing SECURITY DEFINER is callable through /rest/v1/rpc
--    except the two deliberate RPCs: book_slot and
--    link_conversation_appointment (each checks the caller itself).
--    doctor_has_google_calendar becomes invoker too (section 8).
-- 2. One permissive policy per table + action (parent OR doctor in one
--    expression). Postgres ORs permissive policies anyway, so access is exactly
--    the same; it just stops evaluating two policies per row.
-- 3. auth.uid() and current_doctor_id() in policies are wrapped in
--    (select ...) so they run once per query instead of once per row.
-- 4. doctors.has_dashboard_login: a plain flag the parent app can filter on
--    instead of joining doctor_auth (which exposes doctors' login ids). The
--    flag is kept in sync by a trigger. The doctor_auth read policy is NOT
--    narrowed here because hooks/useDoctors.ts still joins doctor_auth; see
--    the "FOLLOW-UP" block at the end — run it once the app filters on the
--    flag.
-- 5. anon (not signed in) loses all table privileges. RLS already returned
--    nothing to anon; this is defence in depth.
-- 6. Indexes for foreign keys the performance advisor flagged.
-- 7. Sign-up guard (before-user-created auth hook): phone sign-ups are open;
--    email sign-ups only for addresses / domains in private.signup_email_allowlist.
--    Seeded with lilsteps.dev (test doctors) and demo.lilsteps.dev (the dev-only
--    demo login). AT GO-LIVE: delete the demo.lilsteps.dev row. To add a real
--    doctor: insert their exact email before creating their login.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Private helpers + invoker wrappers ───────────────────────────────────

create schema if not exists private;
revoke all on schema private from public, anon;
-- Signed-in users need USAGE so the public wrappers (security invoker) can
-- call the private helpers from inside RLS policies. The schema is not in
-- the API's exposed schemas, so nothing here is reachable over HTTP.
grant usage on schema private to authenticated, service_role;

create or replace function private.current_doctor_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select doctor_id from public.doctor_auth where id = auth.uid(); $$;

create or replace function private.is_doctor()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.doctor_auth where id = auth.uid()); $$;

create or replace function private.is_child_owner(p_child_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.children
    where id = p_child_id and parent_id = auth.uid()
  );
$$;

create or replace function private.doctor_has_appointment_with_child(p_child_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.appointments a
    where a.child_id = p_child_id
      and a.doctor_id = private.current_doctor_id()
  );
$$;

create or replace function private.doctor_treats_child(p_child_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.appointments a
    where a.child_id = p_child_id and a.doctor_id = private.current_doctor_id()
  ) or exists (
    select 1 from public.conversations c
    where c.child_id = p_child_id and c.doctor_id = private.current_doctor_id()
  );
$$;

create or replace function private.doctor_can_read_document_object(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.children c
    join public.appointments a on a.child_id = c.id
    where c.parent_id::text = (storage.foldername(p_name))[1]
      and c.id::text        = (storage.foldername(p_name))[2]
      and a.doctor_id = private.current_doctor_id()
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.current_doctor_id() to authenticated, service_role;
grant execute on function private.is_doctor() to authenticated, service_role;
grant execute on function private.is_child_owner(uuid) to authenticated, service_role;
grant execute on function private.doctor_has_appointment_with_child(uuid) to authenticated, service_role;
grant execute on function private.doctor_treats_child(uuid) to authenticated, service_role;
grant execute on function private.doctor_can_read_document_object(text) to authenticated, service_role;

-- Same names and signatures as before, now SECURITY INVOKER. They only ever
-- answer questions about the caller themselves.
create or replace function public.current_doctor_id()
returns uuid language sql stable security invoker set search_path = ''
as $$ select private.current_doctor_id(); $$;

create or replace function public.is_doctor()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_doctor(); $$;

create or replace function public.is_child_owner(p_child_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_child_owner(p_child_id); $$;

create or replace function public.doctor_has_appointment_with_child(p_child_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.doctor_has_appointment_with_child(p_child_id); $$;

create or replace function public.doctor_treats_child(p_child_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.doctor_treats_child(p_child_id); $$;

create or replace function public.doctor_can_read_document_object(p_name text)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.doctor_can_read_document_object(p_name); $$;

-- ── 2. Policy tidy-up: roles, ALL-policy split, one policy per action ───────

-- Was `to public`; anon has no business evaluating it.
alter policy "checkin_messages_select_doctor" on public.checkin_messages to authenticated;

-- An ALL policy also counts as a SELECT policy; split it so SELECT can merge.
drop policy if exists "prescription_items_write_doctor" on public.prescription_items;
drop policy if exists "prescription_items_insert_doctor" on public.prescription_items;
drop policy if exists "prescription_items_update_doctor" on public.prescription_items;
drop policy if exists "prescription_items_delete_doctor" on public.prescription_items;
create policy "prescription_items_insert_doctor" on public.prescription_items
  for insert to authenticated with check (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_items.prescription_id and p.doctor_id = public.current_doctor_id()));
create policy "prescription_items_update_doctor" on public.prescription_items
  for update to authenticated
  using (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_items.prescription_id and p.doctor_id = public.current_doctor_id()))
  with check (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_items.prescription_id and p.doctor_id = public.current_doctor_id()));
create policy "prescription_items_delete_doctor" on public.prescription_items
  for delete to authenticated using (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_items.prescription_id and p.doctor_id = public.current_doctor_id()));

-- Merge every group of 2+ permissive policies for the same table, action and
-- role (authenticated) into one policy named <table>_<action>. USING and
-- WITH CHECK are ORed, which is exactly how Postgres combines permissive
-- policies, so who-can-see-what does not change.
do $$
declare
  r record;
  v_name text;
  v_using text;
  v_check text;
  v_sql text;
  i int;
begin
  for r in
    select tablename, cmd,
           array_agg(policyname order by policyname) as names,
           array_agg(qual order by policyname) as quals,
           array_agg(with_check order by policyname) as checks
      from pg_policies
     where schemaname = 'public'
       and permissive = 'PERMISSIVE'
       and roles = array['authenticated']::name[]
       and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
     group by tablename, cmd
    having count(*) > 1
  loop
    v_name := r.tablename || '_' || lower(r.cmd);
    v_using := null;
    v_check := null;
    for i in 1 .. array_length(r.names, 1) loop
      if r.cmd <> 'INSERT' then
        v_using := coalesce(v_using || ' OR ', '') || '(' || r.quals[i] || ')';
      end if;
      if r.cmd in ('INSERT', 'UPDATE') then
        v_check := coalesce(v_check || ' OR ', '')
                   || '(' || coalesce(r.checks[i], r.quals[i]) || ')';
      end if;
    end loop;

    for i in 1 .. array_length(r.names, 1) loop
      execute format('drop policy %I on public.%I', r.names[i], r.tablename);
    end loop;
    execute format('drop policy if exists %I on public.%I', v_name, r.tablename);

    v_sql := format('create policy %I on public.%I for %s to authenticated',
                    v_name, r.tablename, r.cmd);
    if v_using is not null then v_sql := v_sql || ' using (' || v_using || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
  end loop;
end
$$;

-- ── 3. Evaluate auth.uid() / current_doctor_id() once per query ────────────

do $$
declare
  r record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for r in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ '(?<!SELECT )(auth\.uid\(\)|current_doctor_id\(\))'
         or coalesce(with_check, '') ~ '(?<!SELECT )(auth\.uid\(\)|current_doctor_id\(\))')
  loop
    v_using := regexp_replace(r.qual,
      '(?<!SELECT )(auth\.uid\(\)|(public\.)?current_doctor_id\(\))', '( SELECT \1)', 'g');
    v_check := regexp_replace(r.with_check,
      '(?<!SELECT )(auth\.uid\(\)|(public\.)?current_doctor_id\(\))', '( SELECT \1)', 'g');
    v_sql := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if v_using is not null then v_sql := v_sql || ' using (' || v_using || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;
    execute v_sql;
  end loop;
end
$$;

-- ── 4. doctors.has_dashboard_login (replaces the doctor_auth join) ─────────

alter table public.doctors
  add column if not exists has_dashboard_login boolean not null default false;

update public.doctors d
   set has_dashboard_login = exists (select 1 from public.doctor_auth a where a.doctor_id = d.id);

create or replace function private.sync_doctor_dashboard_login()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.doctors d
       set has_dashboard_login = exists (select 1 from public.doctor_auth a where a.doctor_id = d.id)
     where d.id = old.doctor_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.doctors set has_dashboard_login = true where id = new.doctor_id;
  end if;
  return null;
end;
$$;
revoke execute on function private.sync_doctor_dashboard_login() from public, anon, authenticated;

drop trigger if exists sync_doctor_dashboard_login on public.doctor_auth;
create trigger sync_doctor_dashboard_login
  after insert or update or delete on public.doctor_auth
  for each row execute function private.sync_doctor_dashboard_login();

-- Doctors may update their own row (0011); they must not flip this flag.
-- (A column REVOKE would not override the table-wide UPDATE grant, so guard
-- it in a trigger instead. The sync trigger above runs as the owner, so it
-- is not affected.)
create or replace function private.keep_doctor_dashboard_login()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.has_dashboard_login := old.has_dashboard_login;
  end if;
  return new;
end;
$$;
revoke execute on function private.keep_doctor_dashboard_login() from public, anon, authenticated;

drop trigger if exists keep_doctor_dashboard_login on public.doctors;
create trigger keep_doctor_dashboard_login
  before update on public.doctors
  for each row execute function private.keep_doctor_dashboard_login();

-- ── 5. anon gets nothing on the API tables ─────────────────────────────────

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- ── 6. Foreign-key indexes (performance advisor) ───────────────────────────

create index if not exists appointments_ai_summary_id_idx on public.appointments(ai_summary_id);
create index if not exists conversations_appointment_id_idx on public.conversations(appointment_id);
create index if not exists messages_sender_id_idx on public.messages(sender_id);
create index if not exists notification_log_appointment_id_idx on public.notification_log(appointment_id);
create index if not exists notification_log_child_id_idx on public.notification_log(child_id);
create index if not exists prescriptions_appointment_id_idx on public.prescriptions(appointment_id);
create index if not exists prescriptions_consultation_id_idx on public.prescriptions(consultation_id);

-- ── 7. Sign-up guard (before-user-created auth hook) ───────────────────────

create table if not exists private.signup_email_allowlist (
  -- Either a full address (dr.name@gmail.com) or a bare domain (lilsteps.dev).
  entry      text primary key check (entry = lower(entry)),
  note       text,
  created_at timestamptz not null default now()
);
revoke all on private.signup_email_allowlist from public, anon, authenticated;

insert into private.signup_email_allowlist (entry, note) values
  ('lilsteps.dev', 'Test doctor logins (doctor dashboard).'),
  ('demo.lilsteps.dev', 'Dev-only demo login (EXPO_PUBLIC_DEMO_LOGIN). DELETE THIS ROW AT GO-LIVE.')
on conflict (entry) do nothing;

create or replace function private.hook_before_user_created(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_email text := lower(coalesce(event->'user'->>'email', ''));
begin
  -- Phone sign-ups (the parent app) are always allowed.
  if v_email = '' then
    return '{}'::jsonb;
  end if;
  if exists (
    select 1 from private.signup_email_allowlist l
    where l.entry = v_email or l.entry = split_part(v_email, '@', 2)
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Sign-up with email is not open. Please sign in with your phone number.'
  ));
end;
$$;

revoke execute on function private.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.hook_before_user_created(jsonb) to supabase_auth_admin;
grant select on private.signup_email_allowlist to supabase_auth_admin;

-- ── 8. doctor_has_google_calendar without SECURITY DEFINER ─────────────────
-- (applied live as 0034_security_hardening_part2)
-- Parents ask "does this doctor make per-booking Meet links?" through this
-- RPC. It used to read doctor_google_tokens as the owner; now a trigger keeps
-- doctors.has_google_calendar in sync and the function just reads that flag.

alter table public.doctors
  add column if not exists has_google_calendar boolean not null default false;

update public.doctors d
   set has_google_calendar = exists (
     select 1 from public.doctor_google_tokens t
     where t.doctor_id = d.id and t.refresh_token is not null);

create or replace function private.sync_doctor_google_calendar()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.doctors d
       set has_google_calendar = exists (
         select 1 from public.doctor_google_tokens t
         where t.doctor_id = d.id and t.refresh_token is not null)
     where d.id = old.doctor_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.doctors d
       set has_google_calendar = exists (
         select 1 from public.doctor_google_tokens t
         where t.doctor_id = d.id and t.refresh_token is not null)
     where d.id = new.doctor_id;
  end if;
  return null;
end;
$$;
revoke execute on function private.sync_doctor_google_calendar() from public, anon, authenticated;

drop trigger if exists sync_doctor_google_calendar on public.doctor_google_tokens;
create trigger sync_doctor_google_calendar
  after insert or update or delete on public.doctor_google_tokens
  for each row execute function private.sync_doctor_google_calendar();

-- Both flags are owner-maintained; a doctor editing their own row keeps them.
create or replace function private.keep_doctor_dashboard_login()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.has_dashboard_login := old.has_dashboard_login;
    new.has_google_calendar := old.has_google_calendar;
  end if;
  return new;
end;
$$;

create or replace function public.doctor_has_google_calendar(p_doctor_id uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select coalesce((select d.has_google_calendar from public.doctors d where d.id = p_doctor_id), false);
$$;
revoke execute on function public.doctor_has_google_calendar(uuid) from public, anon;
grant execute on function public.doctor_has_google_calendar(uuid) to authenticated, service_role;

-- Still SECURITY DEFINER on purpose (advisor WARN 0029 is expected for
-- these two): book_slot (checks the caller owns the child, locks the slot)
-- and link_conversation_appointment (checks caller owns both rows).

-- ─────────────────────────────────────────────────────────────────────────────
-- FOLLOW-UP (run as a new migration once hooks/useDoctors.ts filters on
-- doctors.has_dashboard_login instead of `doctor_auth!inner(id)`):
--
--   drop policy if exists "doctor_auth_select_all" on public.doctor_auth;
--   drop policy if exists "doctor_auth_select_own" on public.doctor_auth;
--   create policy "doctor_auth_select_own" on public.doctor_auth
--     for select to authenticated using (id = (select auth.uid()));
-- ─────────────────────────────────────────────────────────────────────────────
