-- 0053: LilSteps Care Plan (₹999 / month, 3 video consults per billing month).
--
-- Product rules (lilstepsclinics.com/pricing and /refund):
--   • ₹999 a month, Razorpay Subscription, renews monthly until cancelled.
--   • Each paid billing month includes 3 consults for any child on the
--     account. Unused ones do not carry over. After the 3, consults are ₹449
--     as usual (the existing Payment Link flow).
--   • Cancel any time: the plan is not renewed, and stays usable (with what
--     is left) until the end of the month already paid for.
--   • A plan consult cancelled 2 h or more before the start, or cancelled by
--     the doctor: the consult goes back to the plan (no money moves). Less
--     than 2 h before, or a no-show: it is used. After that billing month
--     has ended the credit can't go back to it: if the DOCTOR cancels, the
--     team books a free consult instead ('rebook_owed'); if the PARENT
--     cancels (or deletes the account), the month is simply over
--     ('expired', nothing owed — otherwise booking at a month's end and
--     cancelling in the next month would farm free consults).
--
-- 1. care_plans: one row per Razorpay Subscription. status mirrors
--    Razorpay's (created / authenticated / active / pending / halted / paused /
--    cancelled / completed / expired); the edge functions write it from the
--    webhook and from a direct fetch, never the app. At most one live
--    (non-final) plan per parent. cancel_at_period_end = the parent asked to
--    stop renewing (Razorpay cancel_at_cycle_end); Razorpay sends
--    subscription.cancelled when that month ends.
-- 2. care_plan_periods: one row per PAID billing month (from
--    subscription.charged, or from a fetch when the webhook is late), with
--    Razorpay's current_start / current_end. Credits are granted by a paid
--    period, never by a status alone: a plan whose renewal failed has no
--    period for the new month, so no credits. Idempotent: one period per
--    (plan, start) and per Razorpay payment.
-- 3. care_plan_credit_uses: one row per consult booked with the plan.
--    'active' counts against its period (booked, held, completed, no-show,
--    late cancel); 'returned' gives it back; 'rebook_owed' = doctor cancelled
--    after the month ended (team books a free consult); 'expired' = parent
--    cancelled after the month ended (nothing owed). One per consult.
-- 4. appointments.paid_with_plan: set when a consult is confirmed with a
--    plan credit. The doctor dashboard shows a "Care Plan" badge from it (no
--    money is shown to doctors).
-- 5. confirm_consult_with_plan(): the plan twin of confirm_consult_payment.
--    Turns the parent's held booking ('awaiting_payment') into an upcoming
--    consult if a credit is left in the period covering now. The period row
--    is locked FOR UPDATE, so two bookings racing for the last credit
--    serialise: one gets it, the other is told 'no_credit' and can pay ₹449.
--    Lock order is appointment, then period (as confirm_consult_payment:
--    appointment, then payment). Service role only (consult-payment).
-- 6. return_plan_credit(appointment, by): consult cancelled under the
--    refund rule → 'returned' (period still running), 'rebook_owed'
--    (doctor, period over) or 'expired' (parent, period over). Idempotent.
--    Service role only (_shared/consultCancel.ts).
-- 7. private.consult_is_prepaid(): paid by Razorpay OR by a plan credit. The
--    guard, reschedule_appointment and appointment_was_paid used to check
--    only payments; a plan consult must get the same protection (no direct
--    cancel that skips the credit rule) and the same rights (free
--    reschedule, doctor may message after cancelling).
-- 8. get_my_care_plan(): the parent's plan, this month's credits and when it
--    renews or ends, for the app. Security invoker (RLS applies).
-- 9. razorpay_events.subscription_id; notification_log: one plan email per
--    plan_key (payload->>'plan_key') and channel.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 4. appointments.paid_with_plan ──────────────────────────────────────────

alter table public.appointments
  add column if not exists paid_with_plan boolean not null default false;

comment on column public.appointments.paid_with_plan is
  'Confirmed with a Care Plan credit (confirm_consult_with_plan, 0053) instead of a ₹449 payment.';

-- ── 1. care_plans ───────────────────────────────────────────────────────────

create table if not exists public.care_plans (
  id                       uuid primary key default gen_random_uuid(),
  -- set null, not cascade: the billing record outlives a deleted account.
  parent_id                uuid references public.parents(id) on delete set null,
  razorpay_subscription_id text unique,
  razorpay_plan_id         text,
  short_url                text,
  status                   text not null default 'created'
                            -- paused: paused at Razorpay; handled like halted (no plan consults)
                            check (status in ('created', 'authenticated', 'active', 'pending',
                                              'halted', 'paused', 'cancelled', 'completed', 'expired')),
  current_start            timestamptz,
  current_end              timestamptz,
  cancel_at_period_end     boolean not null default false,
  cancel_requested_at      timestamptz,
  ended_at                 timestamptz,
  -- Until when the parent can finish the first payment (Razorpay expire_by).
  auth_expires_at          timestamptz,
  paid_count               integer not null default 0 check (paid_count >= 0),
  -- Razorpay event time (unix seconds) of the last status applied: an older
  -- event arriving late never overwrites a newer state.
  last_event_at            bigint,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (current_end is null or current_start is null or current_end > current_start)
);

create index if not exists care_plans_parent_id_idx on public.care_plans (parent_id);
-- One live plan per parent: also serialises two quick "Subscribe" taps.
create unique index if not exists care_plans_one_live_per_parent_uidx
  on public.care_plans (parent_id)
  where status in ('created', 'authenticated', 'active', 'pending', 'halted', 'paused');

alter table public.care_plans enable row level security;
revoke all on public.care_plans from anon, authenticated;
grant select on public.care_plans to authenticated;

drop policy if exists "care_plans_select_own" on public.care_plans;
create policy "care_plans_select_own" on public.care_plans
  for select to authenticated
  using (parent_id = (select auth.uid()));

-- ── 2. care_plan_periods ────────────────────────────────────────────────────

create table if not exists public.care_plan_periods (
  id                  uuid primary key default gen_random_uuid(),
  care_plan_id        uuid not null references public.care_plans(id) on delete cascade,
  period_start        timestamptz not null,
  period_end          timestamptz not null,
  credits_total       integer not null default 3 check (credits_total between 0 and 31),
  razorpay_payment_id text unique,
  amount_paise        integer,
  created_at          timestamptz not null default now(),
  check (period_end > period_start),
  unique (care_plan_id, period_start)
);

-- "Which period covers now" for a plan.
create index if not exists care_plan_periods_plan_end_idx
  on public.care_plan_periods (care_plan_id, period_end desc);

alter table public.care_plan_periods enable row level security;
revoke all on public.care_plan_periods from anon, authenticated;
grant select on public.care_plan_periods to authenticated;

drop policy if exists "care_plan_periods_select_own" on public.care_plan_periods;
create policy "care_plan_periods_select_own" on public.care_plan_periods
  for select to authenticated
  using (
    exists (
      select 1 from public.care_plans c
       where c.id = care_plan_periods.care_plan_id
         and c.parent_id = (select auth.uid())
    )
  );

-- ── 3. care_plan_credit_uses ────────────────────────────────────────────────

create table if not exists public.care_plan_credit_uses (
  id             uuid primary key default gen_random_uuid(),
  period_id      uuid not null references public.care_plan_periods(id) on delete cascade,
  -- set null: a deleted booking's credit still counts (never hands out a 4th).
  appointment_id uuid unique references public.appointments(id) on delete set null,
  parent_id      uuid references public.parents(id) on delete set null,
  status         text not null default 'active'
                  check (status in ('active', 'returned', 'rebook_owed', 'expired')),
  returned_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists care_plan_credit_uses_period_active_idx
  on public.care_plan_credit_uses (period_id) where status = 'active';
create index if not exists care_plan_credit_uses_parent_id_idx
  on public.care_plan_credit_uses (parent_id);

alter table public.care_plan_credit_uses enable row level security;
revoke all on public.care_plan_credit_uses from anon, authenticated;
grant select on public.care_plan_credit_uses to authenticated;

drop policy if exists "care_plan_credit_uses_select_own" on public.care_plan_credit_uses;
create policy "care_plan_credit_uses_select_own" on public.care_plan_credit_uses
  for select to authenticated
  using (parent_id = (select auth.uid()));

-- ── 9. razorpay_events / notification_log ───────────────────────────────────

alter table public.razorpay_events
  add column if not exists subscription_id text;

-- One plan email per event key and channel ('started:<sub>',
-- 'renewed:<sub>:<period start>', 'payment_failed:<sub>:<status>:<end>',
-- 'cancelled:<sub>'). notifyParent treats 23505 as "already sent".
create unique index if not exists notification_log_one_plan_message_uidx
  on public.notification_log ((payload->>'plan_key'), channel)
  where template like 'care\_plan\_%' and status in ('queued', 'sent')
    and payload ? 'plan_key';

-- ── 7. prepaid = Razorpay payment or plan credit ────────────────────────────

create or replace function private.consult_used_plan_credit(p_appointment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.care_plan_credit_uses u
     where u.appointment_id = p_appointment_id and u.status = 'active'
  );
$$;

create or replace function private.consult_is_prepaid(p_appointment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.payments p
     where p.appointment_id = p_appointment_id and p.status = 'paid'
  ) or private.consult_used_plan_credit(p_appointment_id);
$$;

revoke execute on function private.consult_used_plan_credit(uuid) from public, anon;
revoke execute on function private.consult_is_prepaid(uuid) from public, anon;
grant execute on function private.consult_used_plan_credit(uuid) to authenticated, service_role;
grant execute on function private.consult_is_prepaid(uuid) to authenticated, service_role;

-- 0050's "money was captured for this booking" (doctor may open a chat after
-- cancelling it) now also counts a consult booked with a plan credit,
-- whatever became of the credit.
create or replace function private.appointment_was_paid(p_appointment_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.payments p
     where p.appointment_id = p_appointment_id
       and p.status in ('paid', 'refund_due', 'refund_pending', 'refunded', 'refund_failed')
  ) or exists (
    select 1 from public.care_plan_credit_uses u
     where u.appointment_id = p_appointment_id
  );
$$;
revoke execute on function private.appointment_was_paid(uuid) from public, anon;
grant execute on function private.appointment_was_paid(uuid) to authenticated, service_role;

-- ── 7a. guard_appointment_update ────────────────────────────────────────────
-- As 0051, with the two "paid" checks widened to plan consults.

create or replace function public.guard_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role / SQL editor (edge functions, tests) are trusted.
  if auth.uid() is null then
    return new;
  end if;

  -- expire_payment_holds (0045), possibly run inside someone else's
  -- hold_slot: only awaiting_payment -> cancelled/payment_expired, nothing else.
  if coalesce(current_setting('lilsteps.expiring_holds', true), '') = 'on'
     and old.status = 'awaiting_payment' and new.status = 'cancelled'
     and new.cancel_reason = 'payment_expired'
     and (to_jsonb(new) - 'status' - 'cancel_reason' - 'hold_expires_at')
       = (to_jsonb(old) - 'status' - 'cancel_reason' - 'hold_expires_at') then
    return new;
  end if;

  -- reschedule_appointment (0051) for this one consult: only the time and
  -- the move counter may change, and the consult stays upcoming.
  if coalesce(current_setting('lilsteps.reschedule_appt', true), '') = old.id::text
     and old.status = 'upcoming' and new.status = 'upcoming'
     and (to_jsonb(new) - 'date' - 'time' - 'reschedule_count' - 'rescheduled_at' - 'last_rescheduled_by')
       = (to_jsonb(old) - 'date' - 'time' - 'reschedule_count' - 'rescheduled_at' - 'last_rescheduled_by') then
    return new;
  end if;

  if new.child_id  is distinct from old.child_id
  or new.parent_id is distinct from old.parent_id
  or new.doctor_id is distinct from old.doctor_id then
    raise exception 'An appointment cannot be moved to another child, parent or doctor.'
      using errcode = '42501';
  end if;

  if old.doctor_id = public.current_doctor_id() then
    if old.status = 'awaiting_payment' or new.status = 'awaiting_payment' then
      raise exception 'This booking is waiting for payment.' using errcode = '42501';
    end if;
    if new.date is distinct from old.date or new.time is distinct from old.time then
      raise exception 'Use Reschedule to move a consult to another time.'
        using errcode = '42501';
    end if;
    if (to_jsonb(new) - 'status' - 'cancel_reason' - 'meet_link' - 'summary_ready')
       <> (to_jsonb(old) - 'status' - 'cancel_reason' - 'meet_link' - 'summary_ready') then
      raise exception 'Only the visit status and video link can be changed.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if old.status = 'cancelled' then
        raise exception 'A cancelled consult cannot be reopened.' using errcode = '42501';
      end if;
      -- Only forward from upcoming, or between the two closed states.
      if not (
        (old.status = 'upcoming' and new.status in ('completed', 'no_show', 'cancelled'))
        or (old.status in ('completed', 'no_show') and new.status in ('completed', 'no_show'))
      ) then
        raise exception 'A closed visit cannot be reopened.' using errcode = '42501';
      end if;
      if new.status = 'cancelled' and private.consult_is_prepaid(old.id) then
        raise exception 'Cancel from the dashboard so the family is refunded.' using errcode = '42501';
      end if;
    end if;
    if new.cancel_reason is distinct from old.cancel_reason
       and not (old.status <> 'cancelled' and new.status = 'cancelled'
                and new.cancel_reason is not distinct from 'doctor') then
      raise exception 'A cancel reason is only set when cancelling.' using errcode = '42501';
    end if;
    return new;
  end if;

  -- attach_checkin_to_appointment (0041) for this one appointment: only the
  -- summary link may change.
  if coalesce(current_setting('lilsteps.attach_summary_appt', true), '') = old.id::text
     and (to_jsonb(new) - 'ai_summary_id' - 'summary_ready')
       = (to_jsonb(old) - 'ai_summary_id' - 'summary_ready') then
    return new;
  end if;

  -- Parent: only status (and, when cancelling, why) may change, and only to
  -- cancelled.
  if (to_jsonb(new) - 'status' - 'cancel_reason') <> (to_jsonb(old) - 'status' - 'cancel_reason') then
    raise exception 'Only cancelling is allowed.' using errcode = '42501';
  end if;
  if new.status <> old.status
     and not (old.status in ('upcoming', 'awaiting_payment') and new.status = 'cancelled') then
    raise exception 'Only an upcoming appointment can be cancelled.' using errcode = '42501';
  end if;
  if new.cancel_reason is distinct from old.cancel_reason
     and not (old.status <> 'cancelled' and new.status = 'cancelled'
              and new.cancel_reason is not distinct from 'parent') then
    raise exception 'Only cancelling is allowed.' using errcode = '42501';
  end if;
  if new.status = 'cancelled' and old.status = 'upcoming' then
    if exists (
      select 1 from public.payments
       where appointment_id = old.id and status = 'paid'
    ) then
      raise exception 'Please cancel from the app so we can refund you.' using errcode = '42501';
    end if;
    if private.consult_used_plan_credit(old.id) then
      raise exception 'Please cancel from the app so your plan consult can be returned.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_appointment_update() from public, anon, authenticated;

-- ── 7b. reschedule_appointment ──────────────────────────────────────────────
-- As 0051; a plan consult can be moved like a paid one.

create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_new_slot_id    uuid
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_appt      public.appointments;
  v_new       public.time_slots;
  v_by        text;
  v_now_ist   timestamp := (now() at time zone 'Asia/Kolkata');
  v_old_start timestamp;
  v_convo     uuid;
  v_child     text;
  v_note      text;
begin
  if v_uid is null then
    raise exception 'Please sign in again.' using errcode = '28000';
  end if;

  -- Lock the consult first (same order as cancel / confirm: appointment, then slots).
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Consult not found.' using errcode = 'P0002';
  end if;
  if v_appt.parent_id = v_uid then
    v_by := 'parent';
  elsif v_appt.doctor_id = private.current_doctor_id() then
    v_by := 'doctor';
  else
    raise exception 'Consult not found.' using errcode = 'P0002';
  end if;

  if v_appt.status <> 'upcoming' then
    raise exception 'Only an upcoming consult can be moved.' using errcode = 'P0001';
  end if;
  if not private.consult_is_prepaid(v_appt.id) then
    raise exception 'Only a paid consult can be moved. Cancel it and book a new time instead.'
      using errcode = 'P0001';
  end if;

  v_old_start := v_appt.date + v_appt.time;
  if v_old_start <= v_now_ist then
    raise exception 'This consult has already started, so it can no longer be moved.' using errcode = 'P0001';
  end if;
  if v_by = 'parent' and v_old_start - v_now_ist < interval '2 hours' then
    raise exception 'A consult can be moved up to 2 hours before it starts. Please message the doctor instead.'
      using errcode = 'P0001';
  end if;
  if v_appt.reschedule_count >= 3 then
    raise exception 'This consult has already been moved 3 times, so it can''t be moved again.'
      using errcode = 'P0001';
  end if;

  perform 1 from public.time_slots t
   where t.id = p_new_slot_id
      or (t.doctor_id = v_appt.doctor_id and t.date = v_appt.date and t.time = v_appt.time)
   order by t.id
   for update;

  select * into v_new from public.time_slots where id = p_new_slot_id;
  if not found or v_new.doctor_id <> v_appt.doctor_id then
    raise exception 'This time is not available with this doctor.' using errcode = 'P0001';
  end if;
  if v_new.date = v_appt.date and v_new.time = v_appt.time then
    raise exception 'That is the current time of this consult. Pick another time.' using errcode = 'P0001';
  end if;
  if not v_new.is_available then
    raise exception 'This time was just taken. Please pick another.' using errcode = 'P0001';
  end if;
  if (v_new.date + v_new.time) <= v_now_ist then
    raise exception 'This time has already passed. Please pick another.' using errcode = 'P0001';
  end if;
  if (v_new.date + v_new.time) - v_now_ist < interval '2 hours' then
    raise exception 'Pick a time at least 2 hours from now, so the family can make it.' using errcode = 'P0001';
  end if;
  if v_by = 'parent' and not exists (
    select 1 from public.doctors d where d.id = v_appt.doctor_id and d.is_available
  ) then
    raise exception 'This doctor is not taking bookings right now. Please message them instead.'
      using errcode = 'P0001';
  end if;

  perform set_config('lilsteps.reschedule_appt', v_appt.id::text, true);
  begin
    update public.appointments
       set date = v_new.date,
           time = v_new.time,
           reschedule_count = reschedule_count + 1,
           rescheduled_at = now(),
           last_rescheduled_by = v_by
     where id = v_appt.id
    returning * into v_appt;
  exception when unique_violation then
    perform set_config('lilsteps.reschedule_appt', '', true);
    raise exception 'This time was just taken. Please pick another.' using errcode = 'P0001';
  end;
  perform set_config('lilsteps.reschedule_appt', '', true);

  update public.time_slots t
     set is_available = true
   where t.doctor_id = v_appt.doctor_id
     and t.date = v_old_start::date
     and t.time = v_old_start::time
     and not exists (
       select 1 from public.appointments a
        where a.doctor_id = t.doctor_id and a.date = t.date and a.time = t.time
          and a.status <> 'cancelled'
     );
  update public.time_slots set is_available = false where id = v_new.id;

  select split_part(btrim(c.name), ' ', 1) into v_child from public.children c where c.id = v_appt.child_id;
  v_note := format(
    'I have moved %s consult to %s at %s (India time). The video link stays the same.',
    case when coalesce(v_child, '') = '' then 'the' else v_child || '''s' end,
    to_char(v_appt.date, 'FMDay, FMDD FMMonth'),
    lower(to_char(v_appt.time, 'FMHH12:MI AM'))
  );

  insert into public.conversations (child_id, parent_id, doctor_id, appointment_id)
  values (v_appt.child_id, v_appt.parent_id, v_appt.doctor_id, v_appt.id)
  on conflict (child_id, doctor_id) do nothing;
  select c.id into v_convo from public.conversations c
   where c.child_id = v_appt.child_id and c.doctor_id = v_appt.doctor_id;
  if v_convo is not null then
    insert into public.messages (conversation_id, sender, sender_id, content)
    values (v_convo, v_by, v_uid, v_note);
  end if;

  return v_appt;
end;
$$;
revoke execute on function public.reschedule_appointment(uuid, uuid) from public, anon;
grant execute on function public.reschedule_appointment(uuid, uuid) to authenticated;

-- ── 5. confirm_consult_with_plan ────────────────────────────────────────────
-- Returns:
--   'confirmed'  the held booking is now an upcoming plan consult (first time)
--   'already'    this booking was already confirmed with the plan
--   'no_plan'    no paid plan month covers now (or the plan is halted / paused)
--   'no_credit'  this month's plan consults are all used
--   'expired'    the booking is not a live hold any more (expired, cancelled,
--                or already paid with ₹449)
--   'unknown'    no such booking for this parent
-- Open Payment Link rows of the booking are marked cancelled here; the edge
-- function cancels them at Razorpay too (a link paid in between is refunded
-- by confirm_consult_payment, which finds the consult already booked).

create or replace function public.confirm_consult_with_plan(
  p_appointment_id uuid,
  p_parent_id      uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt   public.appointments;
  v_period public.care_plan_periods;
  v_used   integer;
begin
  select * into v_appt from public.appointments
   where id = p_appointment_id and parent_id = p_parent_id
   for update;
  if not found then
    return 'unknown';
  end if;
  if v_appt.status = 'upcoming' and v_appt.paid_with_plan then
    return 'already';
  end if;
  if v_appt.status <> 'awaiting_payment'
     or v_appt.hold_expires_at is null or v_appt.hold_expires_at <= now() then
    return 'expired';
  end if;

  -- The paid month covering now. Locked: two bookings for the last credit
  -- queue here and the second one counts the first one's use.
  select p.* into v_period
    from public.care_plan_periods p
    join public.care_plans c on c.id = p.care_plan_id
   where c.parent_id = p_parent_id
     and c.status not in ('halted', 'paused')
     and p.period_start <= now() and p.period_end > now()
   order by p.period_end desc
   limit 1
   for update of p;
  if not found then
    return 'no_plan';
  end if;

  select count(*) into v_used
    from public.care_plan_credit_uses
   where period_id = v_period.id and status = 'active';
  if v_used >= v_period.credits_total then
    return 'no_credit';
  end if;

  insert into public.care_plan_credit_uses (period_id, appointment_id, parent_id)
  values (v_period.id, v_appt.id, p_parent_id);

  update public.appointments
     set status = 'upcoming', hold_expires_at = null, paid_with_plan = true
   where id = v_appt.id;

  update public.payments
     set status = 'cancelled', updated_at = now()
   where appointment_id = v_appt.id and status = 'created';

  return 'confirmed';
end;
$$;
revoke execute on function public.confirm_consult_with_plan(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_consult_with_plan(uuid, uuid) to service_role;

-- ── 6. return_plan_credit ───────────────────────────────────────────────────
-- p_by: who cancelled ('parent' — also account deletion — or 'doctor').
-- Returns 'returned' (month still running), 'rebook_owed' (doctor, month
-- over), 'expired' (parent, month over) or 'none' (no active credit on it).
-- Idempotent: a credit already settled answers its status.

create or replace function public.return_plan_credit(p_appointment_id uuid, p_by text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_use public.care_plan_credit_uses;
  v_end timestamptz;
  v_new text;
begin
  if p_by is null or p_by not in ('parent', 'doctor') then
    raise exception 'return_plan_credit: p_by must be parent or doctor' using errcode = '22023';
  end if;
  select * into v_use from public.care_plan_credit_uses
   where appointment_id = p_appointment_id
   for update;
  if not found then
    return 'none';
  end if;
  if v_use.status <> 'active' then
    return v_use.status;
  end if;
  select period_end into v_end from public.care_plan_periods where id = v_use.period_id;
  v_new := case
             when v_end > now() then 'returned'
             when p_by = 'doctor' then 'rebook_owed'
             else 'expired'
           end;
  update public.care_plan_credit_uses
     set status = v_new, returned_at = now()
   where id = v_use.id;
  return v_new;
end;
$$;
revoke execute on function public.return_plan_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.return_plan_credit(uuid, text) to service_role;

-- ── 8. get_my_care_plan ─────────────────────────────────────────────────────
-- null when the parent never had a plan. Otherwise:
--   { status, cancel_at_period_end, current_end, ended_at,
--     credits_total, credits_left, period_end }
-- credits_* / period_end are null when no paid month covers now.

create or replace function public.get_my_care_plan()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with plan as (
    select c.*
      from public.care_plans c
     where c.parent_id = (select auth.uid())
       -- the live one first, else the newest; a 'created' (never paid) plan
       -- only while it can still be paid
       and not (c.status = 'created' and coalesce(c.auth_expires_at, c.created_at + interval '1 day') <= now())
     order by (c.status in ('created', 'authenticated', 'active', 'pending', 'halted', 'paused')) desc, c.created_at desc
     limit 1
  ),
  period as (
    select p.*
      from public.care_plan_periods p
      join public.care_plans c on c.id = p.care_plan_id
     where c.parent_id = (select auth.uid())
       and c.status not in ('halted', 'paused')
       and p.period_start <= now() and p.period_end > now()
     order by p.period_end desc
     limit 1
  )
  select case when not exists (select 1 from plan) and not exists (select 1 from period) then null
  else jsonb_build_object(
    'status', (select status from plan),
    'cancel_at_period_end', coalesce((select cancel_at_period_end from plan), false),
    'current_end', (select current_end from plan),
    'ended_at', (select ended_at from plan),
    'credits_total', (select credits_total from period),
    'credits_left', (
      select greatest(period.credits_total - count(u.id), 0)
        from period
        left join public.care_plan_credit_uses u
          on u.period_id = period.id and u.status = 'active'
       group by period.credits_total
    ),
    'period_end', (select period_end from period)
  ) end;
$$;
revoke execute on function public.get_my_care_plan() from public, anon;
grant execute on function public.get_my_care_plan() to authenticated;

notify pgrst, 'reload schema';
