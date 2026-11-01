// Edge Function: demo-signup
//
// Hosted web demo / dev demo login ONLY. Test accounts use
// phone-<10 digits>@demo.lilsteps.dev, which can't receive email, so with
// email confirmation on they could never finish signing up. This creates
// such an account already confirmed; the app then signs in with its password.
//
// Locked down:
//   • off unless DEMO_SIGNUP_ENABLED=true (unset it at go-live, together with
//     deleting the demo.lilsteps.dev sign-up allow-list row and demo users);
//   • only phone-<10 digits>@demo.lilsteps.dev, only with that number's fixed
//     demo password (lib demoCredentials), so it can't create real accounts;
//   • at most DEMO_SIGNUPS_PER_HOUR demo accounts per hour overall.
// verify_jwt = false: the caller is signed out (no user token yet).

import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

const DEMO_EMAIL_RE = /^phone-(\d{10})@demo\.lilsteps\.dev$/;
const DEMO_SIGNUPS_PER_HOUR = 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (Deno.env.get('DEMO_SIGNUP_ENABLED') !== 'true') return jsonResponse({ error: 'Not available' }, 404);

  let body: { email?: unknown; password?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const m = DEMO_EMAIL_RE.exec(email);
  if (!m || body.password !== `Demo-${m[1]}-Lilsteps1`) {
    return jsonResponse({ error: 'Not a demo account' }, 400);
  }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';

  const admin = createAdminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: countErr } = await admin
    .from('parents')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@demo.lilsteps.dev')
    .gte('created_at', since);
  if (countErr) {
    console.error('[demo-signup] count failed', countErr.message);
    return jsonResponse({ error: 'Could not create the demo account' }, 500);
  }
  if ((count ?? 0) >= DEMO_SIGNUPS_PER_HOUR) return jsonResponse({ error: 'Too many demo accounts' }, 429);

  const { error } = await admin.auth.admin.createUser({
    email,
    password: body.password as string,
    email_confirm: true,
    user_metadata: name ? { name } : undefined,
  });
  // Already made (e.g. a tester tapped twice): the app signs in either way.
  if (error && !/already|exists|registered/i.test(error.message)) {
    console.error('[demo-signup] create failed', error.message);
    return jsonResponse({ error: 'Could not create the demo account' }, 500);
  }
  return jsonResponse({ ok: true });
});
