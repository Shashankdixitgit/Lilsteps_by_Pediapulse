-- 0036: close the Meet-room leak (P1 step 2, the FOLLOW-UP at the end of 0035).
--
-- Parents and doctors share the `authenticated` role, and doctors_select_all
-- lets every signed-in user read every doctor row. Until now that included
-- default_meet_link, so a parent could read another doctor's fixed room.
--
-- The parent app reads its own consult's link through
-- get_my_appointment_meet_link (0035); the dashboard reads the doctor's own
-- room through get_my_meet_link (0035). Nothing else selects the column as
-- `authenticated`, so the table-wide SELECT grant is replaced by a column list
-- without default_meet_link. A column REVOKE alone would do nothing while the
-- table grant exists. UPDATE stays table-wide so Settings can still save it.
--
-- If a column is added to doctors later, add it to this grant too.

revoke select on public.doctors from authenticated;
grant select (id, name, specialisation, hospital, avatar_url, is_available,
              created_at, qualifications, bio, has_dashboard_login,
              has_google_calendar, has_meet_link)
  on public.doctors to authenticated;
