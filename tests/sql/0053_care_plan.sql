-- Behaviour checks for 0053 (Care Plan), as the real roles (anon /
-- authenticated with a JWT sub / postgres as the service role).
-- Run with tests/sql/run.sh (throwaway Postgres, migrations 0001–0053).
-- Every check prints "label => OK rows=n" or "label => <error message>";
-- run.sh compares the output with 0053_care_plan.expected.
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

-- ── seed (as postgres: auth.uid() is null) ──
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000d1','d1@lilsteps.dev'),
 ('00000000-0000-0000-0000-0000000000a1','p1@x.in'),
 ('00000000-0000-0000-0000-0000000000a2','p2@x.in');
insert into public.doctors (id, name, specialisation, hospital, is_available, registration_number) values
 ('11111111-0000-0000-0000-000000000001','Dr. One','Pediatrician','H',true,'MMC-1');
insert into public.doctor_auth (id, doctor_id) values
 ('00000000-0000-0000-0000-0000000000d1','11111111-0000-0000-0000-000000000001');
delete from public.time_slots;
insert into public.parents (id, name) values
 ('00000000-0000-0000-0000-0000000000a1','Priya'),
 ('00000000-0000-0000-0000-0000000000a2','Ravi')
on conflict (id) do nothing;
insert into public.children (id, parent_id, name, dob, sex) values
 ('cccccccc-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Asha','2022-01-01','female'),
 ('cccccccc-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a2','Ben','2022-01-01','male');

-- Ten open slots tomorrow 09:00, 09:30, …, 13:30 (slot n = 5153...00n).
insert into public.time_slots (id, doctor_id, date, time, is_available)
select ('51530000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       '11111111-0000-0000-0000-000000000001', current_date + 1,
       time '09:00' + make_interval(mins => 30 * (n - 1)), true
  from generate_series(1, 10) n;

-- A1: an active plan with a paid month covering now. A2: no plan.
insert into public.care_plans (id, parent_id, razorpay_subscription_id, razorpay_plan_id, status, current_start, current_end, paid_count)
values ('9a000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','sub_A1','plan_X','active',
        now() - interval '10 days', now() + interval '20 days', 1);
insert into public.care_plan_periods (id, care_plan_id, period_start, period_end, razorpay_payment_id, amount_paise)
values ('9b000000-0000-0000-0000-000000000001','9a000000-0000-0000-0000-000000000001',
        now() - interval '10 days', now() + interval '20 days', 'pay_m1', 99900);
-- An older, finished month (for the "doctor cancels after the month ended" rule).
insert into public.care_plan_periods (id, care_plan_id, period_start, period_end, razorpay_payment_id, amount_paise)
values ('9b000000-0000-0000-0000-000000000000','9a000000-0000-0000-0000-000000000001',
        now() - interval '40 days', now() - interval '10 days', 'pay_m0', 99900);

create function public.t(label text, sql text) returns text language plpgsql as $$
declare n bigint; r text;
begin
  begin
    execute sql; get diagnostics n = row_count;
    raise exception 'T_OK rows=%', n;
  exception when others then r := sqlerrm;
  end;
  return rpad(label, 72) || ' => ' || replace(r, 'T_OK ', 'OK ');
end $$;
grant execute on function public.t(text, text) to anon, authenticated;

-- v(label, sql): the first column of the first row, as text (the SQL is run for real).
create function public.v(label text, sql text) returns text language plpgsql as $$
declare r text;
begin
  begin
    execute sql into r;
  exception when others then r := 'ERROR ' || sqlerrm;
  end;
  return rpad(label, 72) || ' => ' || coalesce(r, 'null');
end $$;
grant execute on function public.v(text, text) to anon, authenticated;

-- as(uid): act as that signed-in user for the rest of the transaction.
create function pg_temp.hold(uid text, slot int) returns uuid language plpgsql as $$
declare a uuid;
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  set local role authenticated;
  select id into a from public.hold_slot(('51530000-0000-0000-0000-' || lpad(slot::text, 12, '0'))::uuid,
    case uid when '00000000-0000-0000-0000-0000000000a1' then 'cccccccc-0000-0000-0000-000000000001'::uuid
             else 'cccccccc-0000-0000-0000-000000000002'::uuid end);
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return a;
end $$;

-- Holds: A1 slots 1..5 (two at a time is the hold limit, so confirm as we go), A2 slot 6.
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'

select pg_temp.hold(:'A1', 1) as h1 \gset
select v('plan: first booking with a credit is confirmed', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h1', :'A1'));
select v('plan: same booking again is "already"', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h1', :'A1'));
select v('plan: booking is upcoming, paid_with_plan, no hold time', format($q$select status || ' ' || paid_with_plan || ' ' || coalesce(hold_expires_at::text, '-') from appointments where id = %L$q$, :'h1'));
select v('plan: one active credit use recorded', format($q$select count(*) from care_plan_credit_uses where appointment_id = %L and status = 'active'$q$, :'h1'));
select v('plan: another parent''s booking id is "unknown"', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h1', :'A2'));

select pg_temp.hold(:'A1', 2) as h2 \gset
select pg_temp.hold(:'A1', 3) as h3 \gset
select v('plan: second credit', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h2', :'A1'));
select v('plan: third credit', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h3', :'A1'));
select pg_temp.hold(:'A1', 4) as h4 \gset
select v('plan: fourth booking in the month is "no_credit"', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h4', :'A1'));
select v('plan: ... and stays a hold the family can pay ₹449 for', format($q$select status from appointments where id = %L$q$, :'h4'));
select pg_temp.hold(:'A2', 6) as h6 \gset
select v('plan: a parent without a plan gets "no_plan"', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h6', :'A2'));

-- An expired hold cannot be confirmed with the plan.
update appointments set hold_expires_at = now() - interval '1 minute' where id = :'h6';
select v('plan: expired hold is "expired"', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h6', :'A2'));

-- ── the app (authenticated) can't call the service functions ──
begin;
\o /dev/null
select set_config('request.jwt.claim.sub', :'A1', true);
\o
set local role authenticated;
select t('rpc as parent: confirm_consult_with_plan refused', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h4', :'A1'));
select t('rpc as parent: return_plan_credit refused', format($q$select public.return_plan_credit(%L, 'parent')$q$, :'h1'));
-- ── RLS: own rows only, read only ──
select v('rls parent A1: sees own plan', 'select count(*) from care_plans');
select v('rls parent A1: sees own two months', 'select count(*) from care_plan_periods');
select v('rls parent A1: sees own three credit uses', 'select count(*) from care_plan_credit_uses');
select t('rls parent A1: insert a plan refused', $q$insert into care_plans (parent_id, status) values (auth.uid(), 'active')$q$);
select t('rls parent A1: add credits refused', $q$update care_plan_periods set credits_total = 30$q$);
select t('rls parent A1: drop a credit use refused', $q$delete from care_plan_credit_uses$q$);
select t('rls parent A1: mark own consult paid_with_plan refused', format($q$update appointments set paid_with_plan = true where id = %L$q$, :'h4'));
select v('get_my_care_plan A1: 0 of 3 left', $q$select (p->>'status') || ' ' || (p->>'credits_left') || '/' || (p->>'credits_total') || ' cancel_at_end=' || (p->>'cancel_at_period_end') from public.get_my_care_plan() p$q$);
-- ── guard: a plan consult is cancelled through the edge function only ──
select t('guard parent: direct cancel of a plan consult refused', format($q$update appointments set status = 'cancelled', cancel_reason = 'parent' where id = %L$q$, :'h1'));
select t('guard parent: drop own unpaid hold still allowed', format($q$update appointments set status = 'cancelled', cancel_reason = 'parent' where id = %L$q$, :'h4'));
select t('reschedule parent: a plan consult can be moved for free', format($q$select public.reschedule_appointment(%L, '51530000-0000-0000-0000-000000000009')$q$, :'h1'));
rollback;

begin;
\o /dev/null
select set_config('request.jwt.claim.sub', :'A2', true);
\o
set local role authenticated;
select v('rls parent A2: sees no plan of A1', 'select count(*) from care_plans');
select v('rls parent A2: sees no months of A1', 'select count(*) from care_plan_periods');
select v('rls parent A2: sees no credit uses of A1', 'select count(*) from care_plan_credit_uses');
select v('get_my_care_plan A2: null (never subscribed)', 'select public.get_my_care_plan()');
rollback;

begin;
set local role anon;
select t('rls anon: plans refused', 'select * from care_plans');
select t('rls anon: get_my_care_plan refused', 'select public.get_my_care_plan()');
rollback;

begin;
\o /dev/null
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
\o
set local role authenticated;
select v('rls doctor: sees no family''s plan', 'select count(*) from care_plans');
select v('doctor: sees the Care Plan flag on own consult', format($q$select paid_with_plan from appointments where id = %L$q$, :'h1'));
select t('guard doctor: direct cancel of a plan consult refused', format($q$update appointments set status = 'cancelled', cancel_reason = 'doctor' where id = %L$q$, :'h1'));
select t('guard doctor: marking it completed / no-show is fine', format($q$update appointments set status = 'no_show' where id = %L$q$, :'h1'));
select t('guard doctor: can''t flip paid_with_plan', format($q$update appointments set paid_with_plan = false where id = %L$q$, :'h1'));
rollback;

-- ── credit back by the rules (consultCancel → return_plan_credit) ──
update appointments set status = 'cancelled', cancel_reason = 'parent' where id = :'h1';
select v('return: month still running → "returned"', format($q$select public.return_plan_credit(%L, 'parent')$q$, :'h1'));
select v('return: again is idempotent', format($q$select public.return_plan_credit(%L, 'doctor')$q$, :'h1'));
select v('return: a consult with no plan credit → "none"', format($q$select public.return_plan_credit(%L, 'parent')$q$, :'h6'));
select v('return: who cancelled must be parent or doctor', format($q$select public.return_plan_credit(%L, 'someone')$q$, :'h1'));
select v('return: slot of the cancelled consult is open again', $q$select is_available from time_slots where id = '51530000-0000-0000-0000-000000000001'$q$);
select v('plan: the returned credit can be used again', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h4', :'A1'));
begin;
\o /dev/null
select set_config('request.jwt.claim.sub', :'A1', true);
\o
set local role authenticated;
select v('get_my_care_plan A1: back to 0 left after rebooking', $q$select (p->>'credits_left') from public.get_my_care_plan() p$q$);
rollback;

-- Doctor cancels a plan consult whose month has ended → rebook owed.
insert into appointments (id, child_id, parent_id, doctor_id, date, time, status, paid_with_plan)
values ('aaaaaaaa-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-000000000001', :'A1',
        '11111111-0000-0000-0000-000000000001', current_date + 2, '10:00', 'upcoming', true);
insert into care_plan_credit_uses (period_id, appointment_id, parent_id)
values ('9b000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-0000000000f1', :'A1');
update appointments set status = 'cancelled', cancel_reason = 'doctor' where id = 'aaaaaaaa-0000-0000-0000-0000000000f1';
select v('return: doctor cancel after the month ended → "rebook_owed"', $q$select public.return_plan_credit('aaaaaaaa-0000-0000-0000-0000000000f1', 'doctor')$q$);
-- Review #1: a PARENT cancel after the month ended gives nothing back and owes nothing
-- (book at month end, cancel next month must not farm free consults).
insert into appointments (id, child_id, parent_id, doctor_id, date, time, status, paid_with_plan)
values ('aaaaaaaa-0000-0000-0000-0000000000f2','cccccccc-0000-0000-0000-000000000001', :'A1',
        '11111111-0000-0000-0000-000000000001', current_date + 2, '10:30', 'upcoming', true);
insert into care_plan_credit_uses (period_id, appointment_id, parent_id)
values ('9b000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-0000000000f2', :'A1');
update appointments set status = 'cancelled', cancel_reason = 'parent' where id = 'aaaaaaaa-0000-0000-0000-0000000000f2';
select v('return: PARENT cancel after the month ended → "expired" (no free consult)', $q$select public.return_plan_credit('aaaaaaaa-0000-0000-0000-0000000000f2', 'parent')$q$);
select v('return: ... and a later doctor call can''t turn it into a rebook', $q$select public.return_plan_credit('aaaaaaaa-0000-0000-0000-0000000000f2', 'doctor')$q$);
select v('appointment_was_paid: a plan consult counts (doctor may message)', $q$select private.appointment_was_paid('aaaaaaaa-0000-0000-0000-0000000000f1')$q$);

-- A ₹449 link paid for a booking that was just confirmed with the plan is refunded.
insert into payments (id, appointment_id, parent_id, amount_paise, status, razorpay_link_id)
values ('ba000000-0000-0000-0000-000000000001', :'h2', :'A1', 44900, 'cancelled', 'plink_late');
select v('interplay: ₹449 paid after a plan booking → refund_needed', $q$select public.confirm_consult_payment('ba000000-0000-0000-0000-000000000001', 'pay_late', 44900)$q$);
select v('interplay: ... payment row is refund_due', $q$select status || ' ' || refund_reason from payments where id = 'ba000000-0000-0000-0000-000000000001'$q$);

-- ── constraints ──
select t('one live plan per parent: a second one refused', $q$insert into care_plans (parent_id, status) values ('00000000-0000-0000-0000-0000000000a1', 'created')$q$);
select t('a finished plan does not block a new one', $q$insert into care_plans (parent_id, status) values ('00000000-0000-0000-0000-0000000000a2', 'cancelled'), ('00000000-0000-0000-0000-0000000000a2', 'created')$q$);
select t('one month per plan and start', $q$insert into care_plan_periods (care_plan_id, period_start, period_end) select care_plan_id, period_start, period_end from care_plan_periods where id = '9b000000-0000-0000-0000-000000000001'$q$);
select t('one credit use per consult', format($q$insert into care_plan_credit_uses (period_id, appointment_id, parent_id) values ('9b000000-0000-0000-0000-000000000001', %L, %L)$q$, :'h2', :'A1'));
select t('one plan email per key and channel', $q$insert into notification_log (channel, template, recipient, status, payload) values
  ('email','care_plan_started','p1@x.in','sent','{"plan_key":"started:sub_A1"}'),
  ('email','care_plan_started','p1@x.in','queued','{"plan_key":"started:sub_A1"}')$q$);
select t('same plan key on another channel is fine', $q$insert into notification_log (channel, template, recipient, status, payload) values
  ('email','care_plan_renewed','p1@x.in','sent','{"plan_key":"renewed:sub_A1:1"}'),
  ('push','care_plan_renewed','tok','sent','{"plan_key":"renewed:sub_A1:1"}')$q$);

-- Review #6: a paused (or halted) plan gives no plan consults, even inside a paid month.
begin;
update care_plans set status = 'paused' where id = '9a000000-0000-0000-0000-000000000001';
select pg_temp.hold(:'A1', 7) as h7 \gset
select v('paused plan: booking with the plan is "no_plan"', format($q$select public.confirm_consult_with_plan(%L, %L)$q$, :'h7', :'A1'));
\o /dev/null
select set_config('request.jwt.claim.sub', :'A1', true);
\o
set local role authenticated;
select v('paused plan: get_my_care_plan shows paused, no consults', $q$select (p->>'status') || ' left=' || coalesce(p->>'credits_left', 'null') from public.get_my_care_plan() p$q$);
rollback;
select t('paused counts as live: no second plan while paused', $q$
  with x as (update care_plans set status = 'paused' where id = '9a000000-0000-0000-0000-000000000001' returning 1)
  insert into care_plans (parent_id, status) values ('00000000-0000-0000-0000-0000000000a1', 'created')$q$);
