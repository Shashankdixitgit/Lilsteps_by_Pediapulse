-- ─────────────────────────────────────────────────────────────────────────────
-- Health records: a "Vaccination certificate" category.
--
-- The Vaccines tab's "Upload certificate" opens the upload screen preset to
-- this category, and Records gets a matching filter chip. Until now the only
-- fit was 'other', so certificates were mixed in with every other document.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents
  add constraint documents_category_check
  check (category in ('prescription', 'report', 'lab_test', 'visit_history', 'vaccination', 'other'));
