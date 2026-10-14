-- Doctors can read the full check-in conversation for their own appointments,
-- matching checkin_sessions_select_doctor.
create policy checkin_messages_select_doctor on public.checkin_messages
  for select using (
    exists (
      select 1 from public.appointments a
      where a.ai_summary_id = checkin_messages.session_id
        and a.doctor_id = public.current_doctor_id()
    )
  );
