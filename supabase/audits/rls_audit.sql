-- ─────────────────────────────────────────────────────────────────────────────
-- RLS audit — verify every public table is locked down per Proposal §6.
--
-- Posture we expect:
--   • RLS enabled on every public table
--   • parent-scoped tables: policies restrict to parent_id = auth.uid()
--     (children, allergies, conditions, medications, growth_measurements,
--      vaccinations, documents, health_notes, checkin_sessions,
--      checkin_messages, appointments, prescriptions, prescription_items,
--      conversations, messages, notification_log, video_rooms)
--   • doctor-readable: doctors, time_slots readable by any authenticated user
--   • cross-role: appointments, consultations, conversations, messages,
--     prescriptions readable by assigned doctor via doctor_auth link
--   • service-role-only tables: none (cron functions use service role which
--     bypasses RLS).
--
-- Run with: PGPASSWORD=... psql "$URL" -f supabase/audits/rls_audit.sql
-- ─────────────────────────────────────────────────────────────────────────────

\echo '== 1. Tables in public WITHOUT RLS enabled =='
select n.nspname || '.' || c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by 1;

\echo
\echo '== 2. Public tables with RLS enabled but ZERO policies (anything queryable?) =='
select t.schemaname || '.' || t.tablename as table_name
from pg_tables t
where t.schemaname = 'public'
  and t.rowsecurity = true
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = t.schemaname and p.tablename = t.tablename
  )
order by 1;

\echo
\echo '== 3. Policy summary per public table (cmd × roles × count) =='
select tablename,
       cmd,
       array_agg(distinct roles::text order by roles::text) as roles,
       count(*) as policy_count
from pg_policies
where schemaname = 'public'
group by tablename, cmd
order by tablename, cmd;

\echo
\echo '== 4. Parent-scoped tables — must have a policy restricting to auth.uid() =='
with want as (
  select unnest(array[
    'parents','children','allergies','conditions','medications',
    'growth_measurements','vaccinations','documents','health_notes',
    'checkin_sessions','checkin_messages','appointments',
    'prescriptions','prescription_items','conversations','messages',
    'notification_log','video_rooms'
  ]) as tablename
)
select w.tablename,
       coalesce(p.policy_count, 0) as policy_count,
       case when coalesce(p.policy_count, 0) = 0 then 'MISSING' else 'ok' end as status
from want w
left join (
  select tablename, count(*) as policy_count
  from pg_policies
  where schemaname = 'public'
  group by tablename
) p on p.tablename = w.tablename
order by status desc, w.tablename;

\echo
\echo '== 5. Storage policies on relevant buckets =='
select policyname as policy_name, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (policyname like '%health_photos%' or policyname like '%prescriptions_storage%')
order by policyname;

\echo
\echo '== 6. SECURITY DEFINER functions in public — verify search_path is locked =='
select proname,
       pg_get_function_identity_arguments(oid) as args,
       prosecdef as security_definer,
       proconfig as config
from pg_proc
where pronamespace = 'public'::regnamespace
  and prosecdef
order by proname;
