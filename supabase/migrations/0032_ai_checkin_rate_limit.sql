-- Per-user rate limit for the ai-checkin edge function.
--
-- Many testers share one Gemini key, so one person (or a stuck client) must
-- not be able to use up the quota for everyone. The edge function calls
-- ai_checkin_take() before each model call; it records the call and says
-- whether the user is still under the limit for that action.
--
-- Only the edge function (service role) touches this table: RLS is on with no
-- policies, and clients cannot execute the function.

create table if not exists public.ai_checkin_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('chat', 'summary')),
  created_at timestamptz not null default now()
);

create index if not exists ai_checkin_usage_user_action_time
  on public.ai_checkin_usage (user_id, action, created_at desc);

alter table public.ai_checkin_usage enable row level security;
revoke all on public.ai_checkin_usage from anon, authenticated;

comment on table public.ai_checkin_usage is
  'One row per ai-checkin model call (service role only). Rows older than a day are pruned by ai_checkin_take().';

-- Returns allowed = true and records the call when the user has made fewer
-- than p_limit calls of p_action in the last p_window_seconds. Otherwise
-- returns allowed = false and how many seconds until a call frees up.
-- A transaction-scoped advisory lock per user + action makes parallel calls
-- from one user count correctly.
create or replace function public.ai_checkin_take(
  p_user uuid,
  p_action text,
  p_limit int,
  p_window_seconds int
)
returns table (allowed boolean, retry_after_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(secs => p_window_seconds);
  v_count int;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_action, 0));

  delete from public.ai_checkin_usage
   where user_id = p_user and created_at < now() - interval '1 day';

  select count(*), min(created_at)
    into v_count, v_oldest
    from public.ai_checkin_usage
   where user_id = p_user and action = p_action and created_at >= v_since;

  if v_count >= p_limit then
    return query select
      false,
      greatest(
        60,
        ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - now())))::int
      );
    return;
  end if;

  insert into public.ai_checkin_usage (user_id, action) values (p_user, p_action);
  return query select true, 0;
end;
$$;

revoke execute on function public.ai_checkin_take(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.ai_checkin_take(uuid, text, int, int) to service_role;
