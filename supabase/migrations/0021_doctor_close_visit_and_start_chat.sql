-- 0021 — Let the doctor close a visit and start a chat from the dashboard.
--
-- 1. appointments.status gains 'no_show'. The dashboard consult page now has
--    "Mark complete" and "No-show"; both take the visit out of the queue.
--    'no_show' keeps the slot taken (the time has passed) — release_appointment_slot
--    only frees a slot on 'cancelled'. The active-slot unique index
--    (status <> 'cancelled') still covers it.
-- 2. A doctor may create a conversation for a child they treat, so "Open chat"
--    on the consult page works even when the parent has never messaged.
--    The parent app looks threads up by (child_id, doctor_id), so it reuses
--    this row instead of creating a second one.

-- ── 1. no_show status ───────────────────────────────────────────────────────
alter table public.appointments
  drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('upcoming', 'completed', 'cancelled', 'no_show'));

-- ── 2. doctor-created conversations ─────────────────────────────────────────
drop policy if exists "conversations_insert_doctor" on public.conversations;
create policy "conversations_insert_doctor" on public.conversations
  for insert to authenticated
  with check (
    doctor_id = public.current_doctor_id()
    and public.doctor_treats_child(child_id)
    and exists (
      select 1 from public.children c
      where c.id = conversations.child_id and c.parent_id = conversations.parent_id
    )
    and (
      appointment_id is null
      or exists (
        select 1 from public.appointments a
        where a.id = conversations.appointment_id
          and a.doctor_id = public.current_doctor_id()
          and a.child_id = conversations.child_id
      )
    )
  );
