-- 0037: check-in messages get their time from the database, not the phone (C1).
--
-- The app saves the parent's answer and the AI reply in one insert, with
-- times 1 ms apart from the phone's clock. A phone with a wrong clock (or a
-- check-in resumed on a second phone) could still put the history out of
-- order. clock_timestamp() moves forward for every row, so rows in one insert
-- keep their order (parent first, then the reply) and later turns always sort
-- after earlier ones. The app and dashboard keep ordering by created_at.

create or replace function private.checkin_message_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists checkin_messages_server_time on public.checkin_messages;
create trigger checkin_messages_server_time
  before insert on public.checkin_messages
  for each row execute function private.checkin_message_server_time();
