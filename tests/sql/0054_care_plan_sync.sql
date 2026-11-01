-- Behaviour checks for 0054 (Care Plan sync queue). Runs after
-- 0053_care_plan.sql in the same throwaway database (its t() / v() helpers
-- and seed rows). Compared with 0054_care_plan_sync.expected by run.sh.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

select v('0054: last_synced_at is a nullable timestamptz', $q$select data_type || ' ' || is_nullable from information_schema.columns where table_name = 'care_plans' and column_name = 'last_synced_at'$q$);
select v('0054: rows from before 0054 start never-synced', $q$select count(*) from care_plans where last_synced_at is not null$q$);
select v('0054: queue index is partial on a subscription id', $q$select indexdef ~ 'WHERE \(razorpay_subscription_id IS NOT NULL\)' from pg_indexes where indexname = 'care_plans_sync_queue_idx'$q$);

-- Fresh plans for the queue (no parent: like a deleted account; unique index ignores them).
insert into public.care_plans (id, parent_id, razorpay_subscription_id, status, ended_at, last_synced_at, created_at) values
 ('9c000000-0000-0000-0000-000000000001', null, 'sub_Q1', 'active',    null,                        now() - interval '1 minute', now() - interval '9 days'),
 ('9c000000-0000-0000-0000-000000000002', null, 'sub_Q2', 'halted',    null,                        now() - interval '1 hour',   now() - interval '8 days'),
 ('9c000000-0000-0000-0000-000000000003', null, 'sub_Q3', 'pending',   null,                        null,                        now() - interval '7 days'),
 ('9c000000-0000-0000-0000-000000000004', null, null,     'created',   null,                        null,                        now() - interval '6 days'),
 ('9c000000-0000-0000-0000-000000000005', null, 'sub_Q5', 'expired',   now() - interval '2 hours',  now() - interval '30 minutes', now() - interval '5 days'),
 ('9c000000-0000-0000-0000-000000000006', null, 'sub_Q6', 'cancelled', now() - interval '10 days',  null,                        now() - interval '4 days');

-- The sweep's query, as PostgREST runs it (syncCarePlans): live, or ended in the last 3 days; with an id; never-checked first.
select v('sweep: order and selection', $q$
  select string_agg(razorpay_subscription_id, ',' order by n) from (
    select razorpay_subscription_id, row_number() over (order by last_synced_at asc nulls first, created_at asc) n
      from care_plans
     where razorpay_subscription_id is not null
       and (status in ('created','authenticated','active','pending','halted','paused') or ended_at >= now() - interval '3 days')
       and id::text like '9c%') s$q$);

-- Stamping a row (as the sweep does) moves it to the back.
update care_plans set last_synced_at = now() where id = '9c000000-0000-0000-0000-000000000003';
select v('sweep: a stamped row goes to the back', $q$
  select string_agg(razorpay_subscription_id, ',' order by last_synced_at asc nulls first, created_at asc)
    from care_plans
   where razorpay_subscription_id is not null
     and (status in ('created','authenticated','active','pending','halted','paused') or ended_at >= now() - interval '3 days')
     and id::text like '9c%'$q$);

-- The queue can be read from the index (no sort).
begin;
set local enable_seqscan = off;
explain (costs off) select id from care_plans where razorpay_subscription_id is not null order by last_synced_at asc nulls first limit 50;
rollback;

-- The app can read it on its own plan but never write it.
begin;
\o /dev/null
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
\o
set local role authenticated;
select v('rls parent: reads last_synced_at of own plan only', $q$select count(*) || ' ' || count(last_synced_at) from care_plans$q$);
select t('rls parent: cannot set last_synced_at', $q$update care_plans set last_synced_at = now()$q$);
rollback;
