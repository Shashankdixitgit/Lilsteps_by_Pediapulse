-- 0039: one-time consent before check-in answers go to the AI service (R2-09,
-- Apple guideline 5.1.2(i)).
--
-- The check-in sends the parent's answers to Google Gemini, processed outside
-- India. Before the first check-in the app shows a consent step; "Agree and
-- continue" records the time here. NULL = not agreed yet.
--
-- The time comes from the database (record_ai_consent), not the phone, and a
-- parent can only set it on their own row. Parents read it back through the
-- existing parents_select policy (own row). Doctors who can read the parent
-- row may see it too, which is fine: it is a yes/no fact, not health data.

alter table public.parents
  add column if not exists ai_consent_at timestamptz;

comment on column public.parents.ai_consent_at is
  'When the parent agreed that check-in answers are processed by Google Gemini (outside India). NULL = not yet.';

-- Read: column-level grant, like the other parent columns.
grant select (ai_consent_at) on public.parents to authenticated;
-- The app sets it through record_ai_consent() below (server time). The
-- table-wide UPDATE grant plus parents_update_own still limit any direct
-- write to the parent's own row.

create or replace function public.record_ai_consent()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.parents
     set ai_consent_at = coalesce(ai_consent_at, now())
   where id = auth.uid()
  returning ai_consent_at into v_at;
  if v_at is null then
    raise exception 'Parent profile not found' using errcode = 'P0002';
  end if;
  return v_at;
end;
$$;

revoke all on function public.record_ai_consent() from public, anon;
grant execute on function public.record_ai_consent() to authenticated;
