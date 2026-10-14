-- R2-27: a chat opened from "You're booked" should say which consult it is
-- about. There is one conversation per child + doctor, and 0015 removed the
-- parent UPDATE policy on conversations, so the parent app links the
-- conversation to the newly booked appointment through this function. It
-- only accepts an appointment of the same parent, child and doctor.
create or replace function public.link_conversation_appointment(
  p_conversation_id uuid,
  p_appointment_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations c
     set appointment_id = p_appointment_id
   where c.id = p_conversation_id
     and c.parent_id = auth.uid()
     and exists (
       select 1 from public.appointments a
        where a.id = p_appointment_id
          and a.parent_id = auth.uid()
          and a.child_id = c.child_id
          and a.doctor_id = c.doctor_id
     );
end;
$$;

revoke execute on function public.link_conversation_appointment(uuid, uuid) from public, anon;
grant execute on function public.link_conversation_appointment(uuid, uuid) to authenticated;

-- R2-21: the parent app asked create-meet-event for every booking, and got a
-- 400 (shown as a console error) whenever the doctor hadn't connected Google
-- Calendar, which is every doctor today. The app now asks this first and
-- only calls the function when it can succeed. Returns a yes/no only; the
-- token table stays unreadable to parents.
create or replace function public.doctor_has_google_calendar(p_doctor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.doctor_google_tokens t
     where t.doctor_id = p_doctor_id
       and t.refresh_token is not null
  );
$$;

revoke execute on function public.doctor_has_google_calendar(uuid) from public, anon;
grant execute on function public.doctor_has_google_calendar(uuid) to authenticated;
