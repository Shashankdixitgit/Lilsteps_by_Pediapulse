-- 0045: pay-per-consult with Razorpay (₹449).
--
-- 1. appointments.status gains 'awaiting_payment'. book_slot now creates a
--    HELD booking: the slot is taken (time_slots.is_available = false and the
--    active-slot unique index still covers it) but the consult only becomes
--    'upcoming' once the payment is captured. hold_expires_at says how long
--    the hold lasts; cancel_reason says why a booking was cancelled
--    ('payment_expired' for a hold nobody paid for, 'parent' / 'doctor').
-- 2. Expired holds are released by expire_payment_holds(): lazily at the
--    start of every book_slot, and every minute by pg_cron (enabled in 0030).
--    Releasing = status 'cancelled' + cancel_reason 'payment_expired', so the
--    existing release_appointment_slot trigger re-opens the slot.
-- 3. payments: one row per Razorpay Payment Link. Parents read their own
--    rows; nobody writes from the client. The amount lives here and in the
--    edge function only, never in the app.
-- 4. razorpay_events: webhook idempotency (event id), service role only.
-- 5. confirm_consult_payment(): the single place a captured payment turns a
--    held booking into an 'upcoming' consult. Called by the edge functions
--    (service role) from the webhook and from the app's status check, so it
--    must be idempotent. A payment that arrives after its hold was released
--    re-takes the slot if it is still free, else asks the caller to refund.
-- 6. guard_appointment_update: a parent may drop their own unpaid hold, but
--    may not cancel a PAID consult directly — that goes through the
--    consult-payment edge function, which decides the refund.
-- 7. get_my_appointment_meet_link and release_appointment_slot learn about
--    held bookings (no video link for an unpaid hold; deleting a hold frees
--    its slot).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. appointments: held bookings ──────────────────────────────────────────

alter table public.appointments
  add column if not exists hold_expires_at timestamptz,
  add column if not exists cancel_reason   text;

alter table public.appointments
  drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('awaiting_payment', 'upcoming', 'completed', 'cancelled', 'no_show'));

alter table public.appointments
  drop constraint if exists appointments_cancel_reason_check;
alter table public.appointments
  add constraint appointments_cancel_reason_check
  check (cancel_reason is null or cancel_reason in ('payment_expired', 'parent', 'doctor'));

create index if not exists appointments_awaiting_payment_idx
  on public.appointments (hold_expires_at)
  where status = 'awaiting_payment';

-- ── 3. payments ─────────────────────────────────────────────────────────────

create table if not exists public.payments (
  id                   uuid primary key default gen_random_uuid(),
  -- set null, not cascade: a payment record outlives a deleted booking/account.
  appointment_id       uuid references public.appointments(id) on delete set null,
  parent_id            uuid references public.parents(id) on delete set null,
  amount_paise         integer not null check (amount_paise > 0),
  currency             text not null default 'INR',
  status               text not null default 'created'
                        check (status in ('created', 'paid', 'expired', 'cancelled',
                                          'refund_pending', 'refunded', 'refund_failed')),
  razorpay_link_id     text unique,
  razorpay_link_url    text,
  razorpay_payment_id  text unique,
  link_expires_at      timestamptz,
  paid_at              timestamptz,
  refund_id            text,
  refund_reason        text,
  refunded_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists payments_appointment_id_idx on public.payments(appointment_id);
create index if not exists payments_parent_id_idx on public.payments(parent_id);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select to authenticated
  using (parent_id = (select auth.uid()));

-- ── 4. razorpay_events ──────────────────────────────────────────────────────

create table if not exists public.razorpay_events (
  id           text primary key,          -- x-razorpay-event-id
  event        text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now()
);

alter table public.razorpay_events enable row level security;
revoke all on public.razorpay_events from anon, authenticated;

-- ── 2. releasing expired holds ──────────────────────────────────────────────

create or replace function public.expire_payment_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.appointments
       set status = 'cancelled', cancel_reason = 'payment_expired', hold_expires_at = null
     where status = 'awaiting_payment'
       and hold_expires_at <= now()
    returning id
  )
  select count(*) into v_count from expired;

  -- Unpaid links of those bookings stop counting as open.
  update public.payments p
     set status = 'expired', updated_at = now()
    from public.appointments a
   where p.appointment_id = a.id
     and p.status = 'created'
     and a.status = 'cancelled'
     and a.cancel_reason = 'payment_expired';

  return v_count;
end;
$$;
revoke execute on function public.expire_payment_holds() from public, anon, authenticated;

-- Every minute. cron.schedule with an existing name replaces that job.
select cron.schedule(
  'expire-payment-holds',
  '* * * * *',
  $cron$ select public.expire_payment_holds(); $cron$
);

-- ── book_slot: create a held booking ────────────────────────────────────────
-- Same checks as 0020, plus: release expired holds first, and at most two
-- open holds per parent (so one family can't sit on a doctor's whole day).

create or replace function public.book_slot(
  p_slot_id       uuid,
  p_child_id      uuid,
  p_ai_summary_id uuid default null,
  p_concern       text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_slot    public.time_slots;
  v_appt    public.appointments;
  v_concern text := left(nullif(btrim(coalesce(p_concern, '')), ''), 1000);
begin
  if v_uid is null then
    raise exception 'Please sign in again to book.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.children where id = p_child_id and parent_id = v_uid
  ) then
    raise exception 'Child not found.' using errcode = '42501';
  end if;

  if p_ai_summary_id is not null and not exists (
    select 1 from public.checkin_sessions
    where id = p_ai_summary_id and parent_id = v_uid and child_id = p_child_id
  ) then
    raise exception 'Check-in not found.' using errcode = '42501';
  end if;

  perform public.expire_payment_holds();

  if (select count(*) from public.appointments
       where parent_id = v_uid and status = 'awaiting_payment') >= 2 then
    raise exception 'You have a payment in progress. Finish it or wait a few minutes.'
      using errcode = 'P0001';
  end if;

  -- Lock the slot: a second booking for the same slot waits here, then sees
  -- is_available = false.
  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found then
    raise exception 'This slot no longer exists.' using errcode = 'P0002';
  end if;
  if not v_slot.is_available then
    raise exception 'This slot was just taken.' using errcode = 'P0001';
  end if;
  -- Clinic time is IST (see lib nowInClinic()).
  if (v_slot.date + v_slot.time) <= (now() at time zone 'Asia/Kolkata') then
    raise exception 'This slot has already passed.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.doctors where id = v_slot.doctor_id and is_available
  ) then
    raise exception 'This doctor is not taking bookings right now.' using errcode = 'P0001';
  end if;

  update public.time_slots set is_available = false where id = v_slot.id;

  begin
    insert into public.appointments (
      child_id, parent_id, doctor_id, date, time, status, hold_expires_at,
      summary_ready, ai_summary_id, concern
    ) values (
      p_child_id, v_uid, v_slot.doctor_id, v_slot.date, v_slot.time, 'awaiting_payment',
      now() + interval '20 minutes',
      p_ai_summary_id is not null, p_ai_summary_id, v_concern
    )
    returning * into v_appt;
  exception when unique_violation then
    raise exception 'This slot was just taken.' using errcode = 'P0001';
  end;

  return v_appt;
end;
$$;
revoke execute on function public.book_slot(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.book_slot(uuid, uuid, uuid, text) to authenticated;

-- ── 5. confirm_consult_payment ──────────────────────────────────────────────
-- Returns:
--   'confirmed'     the consult is now upcoming (first time)
--   'already'       this payment was already recorded
--   'refund_needed' money was captured but there is no consult to give for
--                   it (slot gone, booking cancelled, duplicate, wrong amount)
--   'unknown'       no such payment row

create or replace function public.confirm_consult_payment(
  p_payment_id          uuid,
  p_razorpay_payment_id text,
  p_amount_paise        integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay  public.payments;
  v_appt public.appointments;
begin
  -- Lock order matches expire_payment_holds (appointment, then payment).
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    return 'unknown';
  end if;
  if v_pay.appointment_id is not null then
    perform 1 from public.appointments where id = v_pay.appointment_id for update;
  end if;
  select * into v_pay from public.payments where id = p_payment_id for update;

  if v_pay.razorpay_payment_id is not null then
    return 'already';
  end if;

  update public.payments
     set status = 'paid', razorpay_payment_id = p_razorpay_payment_id,
         paid_at = now(), updated_at = now()
   where id = v_pay.id;

  if p_amount_paise is distinct from v_pay.amount_paise then
    return 'refund_needed';
  end if;

  select * into v_appt from public.appointments where id = v_pay.appointment_id;
  if not found then
    return 'refund_needed';
  end if;

  -- Another payment already paid for this consult (two links, both paid).
  if exists (
    select 1 from public.payments
     where appointment_id = v_appt.id and id <> v_pay.id
       and razorpay_payment_id is not null and status = 'paid'
  ) then
    return 'refund_needed';
  end if;

  if v_appt.status = 'awaiting_payment' then
    update public.appointments
       set status = 'upcoming', hold_expires_at = null
     where id = v_appt.id;
    return 'confirmed';
  end if;

  -- Paid after the hold was released: take the slot back if nobody else has
  -- it and it is still ahead.
  if v_appt.status = 'cancelled' and v_appt.cancel_reason = 'payment_expired'
     and (v_appt.date + v_appt.time) > (now() at time zone 'Asia/Kolkata') then
    begin
      update public.appointments
         set status = 'upcoming', cancel_reason = null, hold_expires_at = null
       where id = v_appt.id;
      update public.time_slots
         set is_available = false
       where doctor_id = v_appt.doctor_id and date = v_appt.date and time = v_appt.time;
      return 'confirmed';
    exception when unique_violation then
      return 'refund_needed';
    end;
  end if;

  return 'refund_needed';
end;
$$;
revoke execute on function public.confirm_consult_payment(uuid, text, integer) from public, anon, authenticated;

-- ── 6. guard_appointment_update ─────────────────────────────────────────────
-- As 0041, plus: a parent may cancel their own unpaid hold, and may cancel an
-- upcoming consult directly only when nothing was paid for it.

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
    return new;
  end if;

  -- attach_checkin_to_appointment (0041) for this one appointment: only the
  -- summary link may change.
  if coalesce(current_setting('lilsteps.attach_summary_appt', true), '') = old.id::text
     and (to_jsonb(new) - 'ai_summary_id' - 'summary_ready')
       = (to_jsonb(old) - 'ai_summary_id' - 'summary_ready') then
    return new;
  end if;

  -- Parent: only status (and why) may change, and only to cancelled.
  if (to_jsonb(new) - 'status' - 'cancel_reason') <> (to_jsonb(old) - 'status' - 'cancel_reason') then
    raise exception 'Only cancelling is allowed.' using errcode = '42501';
  end if;
  if new.status <> old.status
     and not (old.status in ('upcoming', 'awaiting_payment') and new.status = 'cancelled') then
    raise exception 'Only an upcoming appointment can be cancelled.' using errcode = '42501';
  end if;
  if new.status = 'cancelled' and old.status = 'upcoming' and exists (
    select 1 from public.payments
     where appointment_id = old.id and status = 'paid'
  ) then
    raise exception 'Please cancel from the app so we can refund you.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_appointment_update() from public, anon, authenticated;

-- ── 7a. release_appointment_slot: deleting a hold frees its slot too ────────

create or replace function public.release_appointment_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled')
  or (tg_op = 'DELETE' and old.status in ('upcoming', 'awaiting_payment')) then
    update public.time_slots t
       set is_available = true
     where t.doctor_id = old.doctor_id
       and t.date = old.date
       and t.time = old.time
       and not exists (
         select 1 from public.appointments a
         where a.doctor_id = old.doctor_id and a.date = old.date and a.time = old.time
           and a.status <> 'cancelled' and a.id <> old.id
       );
  end if;
  return null;
end;
$$;
revoke execute on function public.release_appointment_slot() from public, anon, authenticated;

-- ── 7b. no video link for an unpaid hold ────────────────────────────────────

create or replace function public.get_my_appointment_meet_link(p_appointment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link text;
  v_start timestamptz;
begin
  select coalesce(nullif(btrim(a.meet_link), ''), d.default_meet_link),
         ((a.date + a.time) at time zone 'Asia/Kolkata')
    into v_link, v_start
    from public.appointments a
    join public.doctors d on d.id = a.doctor_id
   where a.id = p_appointment_id
     and a.parent_id = (select auth.uid())
     and a.status not in ('cancelled', 'awaiting_payment');

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'has_link', v_link is not null,
    'link', case
              when v_link is not null
               and now() between v_start - interval '15 minutes' and v_start + interval '90 minutes'
              then v_link
            end
  );
end;
$$;

revoke execute on function public.get_my_appointment_meet_link(uuid) from public, anon;

notify pgrst, 'reload schema';
