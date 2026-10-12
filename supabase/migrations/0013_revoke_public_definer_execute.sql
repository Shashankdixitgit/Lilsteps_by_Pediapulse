-- iap_vaccine_schedule bypasses RLS and was callable by anon via /rest/v1/rpc.
-- It and the two trigger functions are only invoked from triggers / other
-- SECURITY DEFINER functions, so clients never need EXECUTE on them.
revoke execute on function public.iap_vaccine_schedule(uuid, date) from public, anon, authenticated;
revoke execute on function public.handle_new_child() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
