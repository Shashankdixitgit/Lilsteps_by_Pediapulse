import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client for SERVER code only (server actions). Used for the
 * password-reset attempt limit and the "is this a doctor login" check,
 * which the browser must never be able to call.
 *
 * Key: SUPABASE_SECRET_KEY (sb_secret_…) or the legacy
 * SUPABASE_SERVICE_ROLE_KEY — a plain env var on Cloud Run, never
 * NEXT_PUBLIC_*. Returns null when it isn't set; callers then refuse.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
