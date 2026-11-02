// Shared Supabase helpers for Edge Functions.
//
// Keys: Supabase injects the new secret keys as `SUPABASE_SECRET_KEYS`, a JSON
// dictionary keyed by key name ({"default": "sb_secret_..."}). We prefer that
// and fall back to the legacy `SUPABASE_SERVICE_ROLE_KEY` so nothing breaks on
// a project that hasn't created the new keys yet. Once every function runs on
// the secret key, the legacy keys can be deactivated in the dashboard.
// Docs: https://supabase.com/docs/guides/functions/secrets

import {
  createClient,
  type SupabaseClient,
  type User,
} from 'https://esm.sh/@supabase/supabase-js@2.99.3';

import { jsonResponse } from './cors.ts';

function parseKeyDictionary(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value) out[name] = value;
      }
      return out;
    }
  } catch {
    // Malformed value — fall through to the legacy key.
  }
  return {};
}

const SECRET_KEYS = parseKeyDictionary(Deno.env.get('SUPABASE_SECRET_KEYS'));
const LEGACY_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Which key the admin client uses — logged once per cold start, never the value. */
export const ADMIN_KEY_SOURCE: 'secret_key' | 'legacy_service_role' | 'none' =
  SECRET_KEYS.default
    ? 'secret_key'
    : LEGACY_SERVICE_ROLE_KEY
      ? 'legacy_service_role'
      : 'none';

console.log(`[supabase] admin key source: ${ADMIN_KEY_SOURCE}`);

function adminKey(): string {
  return SECRET_KEYS.default ?? LEGACY_SERVICE_ROLE_KEY;
}

/** Client that bypasses RLS. Server-side only. */
export function createAdminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', adminKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The project's publishable (or legacy anon) key, for user-scoped clients. */
function publishableKey(): string {
  const keys = parseKeyDictionary(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'));
  return keys.default ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
}

/**
 * Client that acts AS the caller (their JWT from the request): RLS and
 * auth.uid() apply, e.g. for RPCs that check who is calling
 * (reschedule_appointment, book_followup).
 */
export function createUserClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', publishableKey(), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Why the caller could not be resolved:
 *  - 'session_ended': no token, or the token is invalid / expired / revoked
 *    (the app refreshes once, then signs that phone out);
 *  - 'unavailable': the auth service could not be reached or failed (network,
 *    5xx). Not the parent's fault: 503, "try again", never a sign-out.
 */
export type CallerFailure = 'session_ended' | 'unavailable';

/** An auth error that is a server/network problem, not a bad token. */
export function isAuthUnavailable(error: { status?: number; name?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return true;
  const status = error.status ?? 0;
  return status === 0 || status >= 500;
}

/** The user behind `Authorization: Bearer <user JWT>`, or why there is none. */
export async function resolveCaller(
  req: Request,
  admin: SupabaseClient,
): Promise<{ user: User } | { failure: CallerFailure }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { failure: 'session_ended' };
  const jwt = authHeader.slice('Bearer '.length).trim();
  if (!jwt) return { failure: 'session_ended' };
  try {
    const { data, error } = await admin.auth.getUser(jwt);
    if (error) return { failure: isAuthUnavailable(error) ? 'unavailable' : 'session_ended' };
    return data?.user ? { user: data.user } : { failure: 'session_ended' };
  } catch {
    // getUser threw (network): not a bad token.
    return { failure: 'unavailable' };
  }
}

/** The answer for a caller that could not be resolved (401 session_ended / 503 try again). */
export function callerFailureResponse(failure: CallerFailure): Response {
  return failure === 'unavailable'
    ? jsonResponse({ error: "Couldn't reach the server. Please try again.", code: 'auth_unavailable' }, 503)
    : jsonResponse({ error: 'Your session has ended. Please sign in again.', code: 'session_ended' }, 401);
}

/** Resolves the user behind `Authorization: Bearer <user JWT>`, or null. */
export async function getCaller(
  req: Request,
  admin: SupabaseClient,
): Promise<User | null> {
  const r = await resolveCaller(req, admin);
  return 'user' in r ? r.user : null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * True when the request carries one of this project's server keys (a secret
 * key on `apikey`, or the legacy service-role key on `apikey` / Bearer).
 * Used by cron-only functions so the public can't trigger mass sends.
 */
export function isServerCaller(req: Request): boolean {
  const presented = [
    req.headers.get('apikey') ?? '',
    (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''),
  ].filter(Boolean);
  const valid = [...Object.values(SECRET_KEYS), LEGACY_SERVICE_ROLE_KEY].filter(Boolean);
  return presented.some((p) => valid.some((v) => timingSafeEqual(p, v)));
}
