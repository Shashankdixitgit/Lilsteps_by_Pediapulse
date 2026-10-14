-- PR #4 review: a bare 'lilsteps.dev' entry let anyone register any
-- @lilsteps.dev address. Allow only the exact test doctor logins.
-- demo.lilsteps.dev stays for the dev-only demo login; delete it at go-live.
delete from private.signup_email_allowlist where entry = 'lilsteps.dev';
insert into private.signup_email_allowlist (entry, note) values
  ('doctor.test@lilsteps.dev', 'Test doctor login (Dr. Emily Chen).'),
  ('doctor.madhav@lilsteps.dev', 'Test doctor login (Dr. Madhav).'),
  ('doctor.atish@lilsteps.dev', 'Test doctor login (Dr. Atish).'),
  ('doctor.shashank@lilsteps.dev', 'Test doctor login (Dr. Shashank).')
on conflict (entry) do nothing;
