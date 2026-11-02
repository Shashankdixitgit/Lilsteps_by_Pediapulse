// Edge Function: demo-signup
//
// Hosted web demo / dev demo login ONLY. Test accounts use
// phone-<10 digits>@demo.lilsteps.dev, which can't receive email, so with
// email confirmation on they could never finish signing up. This creates
// such an account already confirmed; the app then signs in with its password.
//
// Locked down:
//   • off unless DEMO_SIGNUP_ENABLED=true. It MUST be off (unset) on the
//     production project at go-live, together with deleting the
//     demo.lilsteps.dev sign-up allow-list row and the demo users;
//   • only phone-<10 digits>@demo.lilsteps.dev, only with that number's fixed
//     demo password (lib demoCredentials), so it can't create real accounts;
//   • at most DEMO_SIGNUPS_PER_IP per caller IP per hour (0046
//     note_auth_attempt) and DEMO_SIGNUPS_PER_HOUR demo accounts overall.
// verify_jwt = false: the caller is signed out (no user token yet).

import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabase.ts';

const DEMO_EMAIL_RE = /^phone-(\d{10})@demo\.lilsteps\.dev$/;
// A client team testing together shares one office Wi-Fi (one IP): 5 an hour
// ran out in minutes (mobile review must-fix 7). Still capped, and only
// fixed-password @demo.lilsteps.dev accounts can be made at all.
const DEMO_SIGNUPS_PER_HOUR = 150;
const DEMO_SIGNUPS_PER_IP = 25;

/** A limit was hit: a 429 the app turns into plain words (code 'demo_limit'). */
function limitReached(): Response {
  return jsonResponse(
    { error: 'Too many demo accounts were created in the last hour. Please try again later.', code: 'demo_limit' },
    429,
  );
}

/** The caller's IP as the Supabase gateway reports it (first X-Forwarded-For hop). */
function callerIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

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
  const { data: ipAllowed, error: ipErr } = await admin.rpc('note_auth_attempt', {
    p_key: `demo-signup-ip:${callerIp(req)}`,
    p_max: DEMO_SIGNUPS_PER_IP,
    p_window_seconds: 3600,
  });
  if (ipErr) {
    console.error('[demo-signup] ip limit failed', ipErr.message);
    return jsonResponse({ error: 'Could not create the demo account' }, 500);
  }
  if (!ipAllowed) return limitReached();

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
  if ((count ?? 0) >= DEMO_SIGNUPS_PER_HOUR) return limitReached();

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
