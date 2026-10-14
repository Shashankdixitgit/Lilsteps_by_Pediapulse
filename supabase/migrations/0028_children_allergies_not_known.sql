-- R3-05: onboarding lets a parent answer "Not known yet" for allergies, but
-- nothing was saved, so Profile showed "None recorded", the AI check-in was
-- told "None known" and the doctor dashboard said "No flags on file".
-- Keep that answer on the child. true = the parent said allergies are not
-- known yet (and named none); the app clears it once an allergy is added or
-- "None" is chosen. Display rule everywhere: allergies_not_known and no
-- allergy rows -> "Not known yet".

alter table public.children
  add column if not exists allergies_not_known boolean not null default false;

comment on column public.children.allergies_not_known is
  'Parent answered "Not known yet" for allergies at onboarding (no allergies named). Show "Not known yet", never "None", while true and no allergy rows exist.';
