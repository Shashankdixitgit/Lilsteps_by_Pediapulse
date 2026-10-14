-- ─────────────────────────────────────────────────────────────────────────────
-- Health records: private Storage bucket for parent-uploaded documents
--
-- Until now documents.file_url held the device-local picker URI (file://...),
-- so the file never left the phone and "Download" had nothing to open.
--
-- Object path convention: <parent_id>/<child_id>/<random>.<ext>
-- documents.file_url stores that object path (not a URL). Clients mint a
-- short-lived signed URL to view it; the bucket is never public.
--
-- Access:
--   - the owning parent can upload / read / delete objects under their own
--     <parent_id>/<child_id>/ folder, and only for a child they own;
--   - a doctor can read objects for a child they have an appointment with
--     (same rule as documents_select_doctor in 0009).
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  20 * 1024 * 1024,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when the object path is <auth.uid()>/<child the caller owns>/...
-- Text comparison only, so a malformed path is simply denied (no uuid cast error).
-- SECURITY INVOKER: children RLS already lets a parent read their own rows.
create or replace function public.is_own_document_object(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.children c
    where c.parent_id = auth.uid()
      and c.parent_id::text = (storage.foldername(p_name))[1]
      and c.id::text        = (storage.foldername(p_name))[2]
  );
$$;

-- True when the caller is a doctor with an appointment for the path's child.
create or replace function public.doctor_can_read_document_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.children c
    join public.appointments a on a.child_id = c.id
    where c.parent_id::text = (storage.foldername(p_name))[1]
      and c.id::text        = (storage.foldername(p_name))[2]
      and a.doctor_id = public.current_doctor_id()
  );
$$;

revoke execute on function public.is_own_document_object(text) from public, anon;
revoke execute on function public.doctor_can_read_document_object(text) from public, anon;
grant execute on function public.is_own_document_object(text) to authenticated;
grant execute on function public.doctor_can_read_document_object(text) to authenticated;

drop policy if exists "documents_storage_insert_own" on storage.objects;
create policy "documents_storage_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_own_document_object(name)
  );

drop policy if exists "documents_storage_select_own_or_doctor" on storage.objects;
create policy "documents_storage_select_own_or_doctor"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.is_own_document_object(name)
      or public.doctor_can_read_document_object(name)
    )
  );

drop policy if exists "documents_storage_delete_own" on storage.objects;
create policy "documents_storage_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and public.is_own_document_object(name)
  );

-- No UPDATE policy: uploads use a fresh random name, never overwrite.
