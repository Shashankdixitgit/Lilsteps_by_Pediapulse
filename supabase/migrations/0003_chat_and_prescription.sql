-- ─────────────────────────────────────────────────────────────────────────────
-- Chat + Prescription tables
--
-- conversations:     1:1 parent↔doctor per child; optionally tied to an appt
-- messages:          chat turns inside a conversation
-- prescriptions:     structured record issued by a doctor
-- prescription_items: line items (medicine, dose, frequency, duration)
--
-- RLS posture:
--   • parent reads/writes own (via children → parent_id ownership)
--   • doctor reads/writes assigned (via doctor_auth linking auth user → doctor)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── conversations ────────────────────────────────────────────────────────────

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  child_id        uuid not null references public.children(id) on delete cascade,
  parent_id       uuid not null references public.parents(id) on delete cascade,
  doctor_id       uuid not null references public.doctors(id) on delete restrict,
  appointment_id  uuid references public.appointments(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (child_id, doctor_id)
);

create index if not exists conversations_parent_id_idx on public.conversations(parent_id);
create index if not exists conversations_doctor_id_idx on public.conversations(doctor_id);
create index if not exists conversations_child_id_idx  on public.conversations(child_id);

-- ── messages ─────────────────────────────────────────────────────────────────

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender          text not null check (sender in ('parent', 'doctor')),
  sender_id       uuid not null references auth.users(id) on delete cascade,
  content         text not null check (length(content) > 0 and length(content) <= 4000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages(conversation_id, created_at);

-- Trigger to bump conversation.last_message_at on insert.
create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_inserted on public.messages;
create trigger on_message_inserted
  after insert on public.messages
  for each row execute function public.bump_conversation_last_message();

-- ── prescriptions ────────────────────────────────────────────────────────────

create table if not exists public.prescriptions (
  id              uuid primary key default gen_random_uuid(),
  consultation_id uuid references public.consultations(id) on delete set null,
  appointment_id  uuid references public.appointments(id) on delete set null,
  child_id        uuid not null references public.children(id) on delete cascade,
  doctor_id       uuid not null references public.doctors(id) on delete restrict,
  issued_at       timestamptz not null default now(),
  notes           text,
  pdf_url         text,
  created_at      timestamptz not null default now()
);

create index if not exists prescriptions_child_id_idx on public.prescriptions(child_id);
create index if not exists prescriptions_doctor_id_idx on public.prescriptions(doctor_id);

-- ── prescription_items ───────────────────────────────────────────────────────

create table if not exists public.prescription_items (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  medicine        text not null,
  dose            text not null,
  frequency       text not null,
  duration        text,
  notes           text,
  position        int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists prescription_items_prescription_id_idx
  on public.prescription_items(prescription_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.conversations         enable row level security;
alter table public.messages              enable row level security;
alter table public.prescriptions         enable row level security;
alter table public.prescription_items    enable row level security;

-- conversations: parent OR assigned doctor
drop policy if exists "conversations_select_parent"  on public.conversations;
drop policy if exists "conversations_select_doctor"  on public.conversations;
drop policy if exists "conversations_insert_parent"  on public.conversations;
drop policy if exists "conversations_update_parent"  on public.conversations;
drop policy if exists "conversations_update_doctor"  on public.conversations;

create policy "conversations_select_parent" on public.conversations
  for select to authenticated using (parent_id = auth.uid());

create policy "conversations_select_doctor" on public.conversations
  for select to authenticated using (doctor_id = public.current_doctor_id());

create policy "conversations_insert_parent" on public.conversations
  for insert to authenticated with check (parent_id = auth.uid());

create policy "conversations_update_parent" on public.conversations
  for update to authenticated using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy "conversations_update_doctor" on public.conversations
  for update to authenticated using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

-- messages: participants only
drop policy if exists "messages_select_participants" on public.messages;
drop policy if exists "messages_insert_parent"      on public.messages;
drop policy if exists "messages_insert_doctor"      on public.messages;
drop policy if exists "messages_update_own"         on public.messages;

create policy "messages_select_participants" on public.messages
  for select to authenticated using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.parent_id = auth.uid() or c.doctor_id = public.current_doctor_id())
    )
  );

create policy "messages_insert_parent" on public.messages
  for insert to authenticated with check (
    sender = 'parent'
    and sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.parent_id = auth.uid()
    )
  );

create policy "messages_insert_doctor" on public.messages
  for insert to authenticated with check (
    sender = 'doctor'
    and sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.doctor_id = public.current_doctor_id()
    )
  );

-- Mark-read only; cannot edit content.
create policy "messages_update_own" on public.messages
  for update to authenticated using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.parent_id = auth.uid() or c.doctor_id = public.current_doctor_id())
    )
  ) with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and (c.parent_id = auth.uid() or c.doctor_id = public.current_doctor_id())
    )
  );

-- prescriptions: parent reads own child's; doctor reads/writes own
drop policy if exists "prescriptions_select_parent" on public.prescriptions;
drop policy if exists "prescriptions_select_doctor" on public.prescriptions;
drop policy if exists "prescriptions_insert_doctor" on public.prescriptions;
drop policy if exists "prescriptions_update_doctor" on public.prescriptions;

create policy "prescriptions_select_parent" on public.prescriptions
  for select to authenticated using (public.is_child_owner(child_id));

create policy "prescriptions_select_doctor" on public.prescriptions
  for select to authenticated using (doctor_id = public.current_doctor_id());

create policy "prescriptions_insert_doctor" on public.prescriptions
  for insert to authenticated with check (doctor_id = public.current_doctor_id());

create policy "prescriptions_update_doctor" on public.prescriptions
  for update to authenticated using (doctor_id = public.current_doctor_id())
  with check (doctor_id = public.current_doctor_id());

-- prescription_items: same as parent prescription
drop policy if exists "prescription_items_select_parent" on public.prescription_items;
drop policy if exists "prescription_items_select_doctor" on public.prescription_items;
drop policy if exists "prescription_items_write_doctor"  on public.prescription_items;

create policy "prescription_items_select_parent" on public.prescription_items
  for select to authenticated using (
    exists (
      select 1 from public.prescriptions p
      where p.id = prescription_items.prescription_id
        and public.is_child_owner(p.child_id)
    )
  );

create policy "prescription_items_select_doctor" on public.prescription_items
  for select to authenticated using (
    exists (
      select 1 from public.prescriptions p
      where p.id = prescription_items.prescription_id
        and p.doctor_id = public.current_doctor_id()
    )
  );

create policy "prescription_items_write_doctor" on public.prescription_items
  for all to authenticated
  using (
    exists (
      select 1 from public.prescriptions p
      where p.id = prescription_items.prescription_id
        and p.doctor_id = public.current_doctor_id()
    )
  )
  with check (
    exists (
      select 1 from public.prescriptions p
      where p.id = prescription_items.prescription_id
        and p.doctor_id = public.current_doctor_id()
    )
  );

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Enable Realtime broadcast on the messages table so both clients can stream
-- new turns. Supabase Realtime uses publication `supabase_realtime`.
alter publication supabase_realtime add table public.messages;

-- ── Storage: prescriptions bucket ────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prescriptions',
  'prescriptions',
  false,
  5 * 1024 * 1024,
  array['application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Object path convention: <prescription_id>/<filename>.pdf
-- Parents read via signed URL minted server-side.
drop policy if exists "prescriptions_storage_insert_doctor" on storage.objects;
create policy "prescriptions_storage_insert_doctor"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'prescriptions'
    and exists (
      select 1 from public.prescriptions p
      where p.id::text = (storage.foldername(name))[1]
        and p.doctor_id = public.current_doctor_id()
    )
  );

drop policy if exists "prescriptions_storage_select_participants" on storage.objects;
create policy "prescriptions_storage_select_participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'prescriptions'
    and exists (
      select 1 from public.prescriptions p
      where p.id::text = (storage.foldername(name))[1]
        and (
          public.is_child_owner(p.child_id)
          or p.doctor_id = public.current_doctor_id()
        )
    )
  );
