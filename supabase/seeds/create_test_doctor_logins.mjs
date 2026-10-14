// Create (or reset) dashboard logins for the test doctors.
//
// Usage (from doctor-dashboard/, so @supabase/supabase-js resolves):
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service role key> \
//   node ../supabase/seeds/create_test_doctor_logins.mjs [email ...]
//
// Each login gets a new strong random password, email already confirmed.
// Passwords are printed once (email<TAB>password) and stored nowhere else.
// Then run step 2 of 03_test_doctors.sql to link the logins to the doctors.
// Never commit the printed passwords.
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/`);
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_EMAILS = [
  'doctor.madhav@lilsteps.dev',
  'doctor.atish@lilsteps.dev',
  'doctor.shashank@lilsteps.dev',
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const emails = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_EMAILS;
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function strongPassword() {
  // 18 random bytes -> 24 URL-safe chars, plus a fixed suffix so every
  // password policy (upper, lower, digit, symbol) is met.
  return `${randomBytes(18).toString('base64url')}-Ls9`;
}

async function findUser(email) {
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

for (const raw of emails) {
  const email = raw.toLowerCase();
  const password = strongPassword();
  const existing = await findUser(email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
  }
  console.log(`${email}\t${password}`);
}
