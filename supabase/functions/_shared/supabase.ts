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

/** Resolves the user behind `Authorization: Bearer <user JWT>`, or null. */
export async function getCaller(
  req: Request,
  admin: SupabaseClient,
): Promise<User | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const jwt = authHeader.slice('Bearer '.length).trim();
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
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
