-- Give back an ai-checkin call that failed (R2-03).
--
-- ai_checkin_take() (migration 0032) records a call before Gemini is asked,
-- so parallel calls from one user are counted correctly. When Gemini then
-- fails (502, empty reply, timeout), that call must not count against the
-- parent's hourly limit: retries after an outage used to lock out a parent,
-- or the one login App Review shares, for most of an hour.
--
-- The edge function calls ai_checkin_refund() after a failed model call. It
-- removes the user's newest usage row for that action. Only the edge
-- function (service role) can execute it.

create or replace function public.ai_checkin_refund(
  p_user uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Same lock as ai_checkin_take(), so a refund and a take don't interleave.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_action, 0));

  delete from public.ai_checkin_usage
   where id = (
     select id
       from public.ai_checkin_usage
      where user_id = p_user and action = p_action
      order by created_at desc, id desc
      limit 1
   );
end;
$$;

revoke execute on function public.ai_checkin_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_checkin_refund(uuid, text) to service_role;
