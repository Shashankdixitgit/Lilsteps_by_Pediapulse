-- R2-13: onboarding step 1 asks for city and preferred language, and the
-- child-basics step asks "Your relationship to the child". These were
-- collected and thrown away (no columns). Save them on the parent so Review
-- and Profile can show them (a grandparent is shown as "Grandparent", not
-- "Parent"). All optional; NULL = not answered.

alter table public.parents
  add column if not exists city text,
  add column if not exists preferred_language text,
  add column if not exists relationship text;

alter table public.parents
  drop constraint if exists parents_relationship_check;
alter table public.parents
  add constraint parents_relationship_check
  check (relationship is null or relationship in ('Mother', 'Father', 'Grandparent', 'Guardian'));

-- 0015 replaced table-wide SELECT with a column list (to hide the push
-- token), so new columns must be granted explicitly. INSERT/UPDATE are
-- table-level grants and already cover them.
grant select (city, preferred_language, relationship) on public.parents to authenticated;
