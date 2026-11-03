-- 0056: Dr. Madhav Chavan's identification headshot as his avatar.
--
-- doctors.avatar_url was unused until now; the parent app shows it in a small
-- circle wherever a doctor appears (DoctorAvatar), with the initial as the
-- fallback. The photo is the plain headshot Dr. Madhav approved for
-- lilstepsclinics.com (NMC 2026: identification only, no promotional use).
-- Parents can already read this column (DOCTOR_PUBLIC_COLUMNS; column SELECT
-- granted to authenticated), so no grant change is needed.

update public.doctors
   set avatar_url = 'https://lilstepsclinics.com/img/doctor/madhav-headshot-480.jpg'
 where id = '5f4325a9-627e-4580-9b89-48a0d9423465';
