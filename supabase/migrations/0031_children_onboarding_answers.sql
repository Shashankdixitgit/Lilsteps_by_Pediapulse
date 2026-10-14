-- C1 (approved): keep every path-specific onboarding answer (birth history,
-- feeding, milestones, sleep, development, diet, school, puberty, mood,
-- baby-vaccines answer, vaccine answers) on the child, so the child's doctor
-- sees them on the dashboard.
--
-- One jsonb column on children, written by the app at onboarding confirm
-- (in the same insert as the child). Access follows the children row, so no
-- new policy is needed:
--   - parent:  children_select_own / children_update_own (parent_id = auth.uid())
--   - doctor:  children_select_doctor (only children with an appointment
--              with that doctor)
-- Nobody else can read it.
--
-- Shape (v1), already in plain labels so every reader shows the same text:
--   {
--     "v": 1,
--     "path": "A" | "B" | "C",
--     "saved_at": "<ISO timestamp>",
--     "sections": [ { "title": "Birth history",
--                     "items": [ { "label": "Full term or premature?",
--                                  "value": "Premature, 34 weeks" } ] } ],
--     "raw": { "<section key>": { ...answers as entered... } }
--   }
-- Only answered questions are listed in "sections".

alter table public.children
  add column if not exists onboarding_answers jsonb;

-- Must be a JSON object, and small (a full answer set is ~3 KB): stops a
-- client from storing arbitrary large blobs on the child row.
alter table public.children
  drop constraint if exists children_onboarding_answers_shape;
alter table public.children
  add constraint children_onboarding_answers_shape
  check (
    onboarding_answers is null
    or (jsonb_typeof(onboarding_answers) = 'object' and pg_column_size(onboarding_answers) <= 32768)
  );

comment on column public.children.onboarding_answers is
  'Path-specific onboarding answers in plain labels (C1). Shape v1: {v, path, saved_at, sections:[{title, items:[{label, value}]}], raw}. Shown to the child''s doctor on the dashboard. Readable only by the parent and doctors with an appointment with the child (children RLS).';
