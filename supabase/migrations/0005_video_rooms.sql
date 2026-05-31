-- ─────────────────────────────────────────────────────────────────────────────
-- video_rooms — one 100ms room per appointment.
--
-- The room is created lazily by the `video-room` Edge Function the first time
-- either party requests a token. Both parent and doctor receive role-specific
-- room codes from 100ms; only the active session (most recent appointment slot)
-- is exposed in either app.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.video_rooms (
  id              uuid primary key default gen_random_uuid(),
  appointment_id  uuid not null unique references public.appointments(id) on delete cascade,
  room_id         text,                       -- 100ms room id
  room_code_parent text,                      -- 100ms role-specific code
  room_code_doctor text,                      -- 100ms role-specific code
  created_at      timestamptz not null default now(),
  ended_at        timestamptz
);

create index if not exists video_rooms_appointment_id_idx
  on public.video_rooms(appointment_id);

alter table public.video_rooms enable row level security;

-- Parent can read their own appointment's room.
drop policy if exists "video_rooms_select_parent" on public.video_rooms;
create policy "video_rooms_select_parent" on public.video_rooms
  for select to authenticated using (
    exists (
      select 1 from public.appointments a
      where a.id = video_rooms.appointment_id and a.parent_id = auth.uid()
    )
  );

-- Doctor can read their own assigned appointment's room.
drop policy if exists "video_rooms_select_doctor" on public.video_rooms;
create policy "video_rooms_select_doctor" on public.video_rooms
  for select to authenticated using (
    exists (
      select 1 from public.appointments a
      where a.id = video_rooms.appointment_id
        and a.doctor_id = public.current_doctor_id()
    )
  );

-- Writes happen via the video-room Edge Function (service role); no policy
-- needed for authenticated insert/update.
