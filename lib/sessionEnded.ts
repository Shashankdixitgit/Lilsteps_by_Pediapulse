/**
 * The server said this phone's session has ended (mobile review must-fix 8).
 *
 * Sign-out used to revoke every session of the account, so signing out on
 * one phone left the parent's other phones half signed in: lists still
 * loaded from the cached token, but Pay, Cancel and Care Plan failed with
 * the raw text "Invalid session". Sign-out is now this device only
 * (context/auth signOut, scope 'local'). If the server still answers 401,
 * the app first refreshes the session once and repeats the request (a token
 * that just expired, a hiccup). Only when the refresh fails, or the repeat
 * still says the session has ended, is this phone signed out and the
 * sign-in screen says why. A 503 (the server couldn't reach the sign-in
 * service) never signs anyone out: "Couldn't reach the server".
 *
 * No React Native imports: tested with Deno (tests/deno/sessionEnded_test.ts).
 */

export const SESSION_ENDED_TEXT = 'You were signed out. Please sign in again.';

/** Edge Functions that are called without a signed-in session. */
const PUBLIC_FUNCTIONS = ['demo-signup', 'razorpay-return', 'storyboard-feedback'];

/** A 401 from one of our Edge Functions, sent with a user's token. */
export function isSessionEndedResponse(url: string, status: number, hadUserToken: boolean): boolean {
  if (status !== 401 || !hadUserToken) return false;
  const m = /\/functions\/v1\/([^/?#]+)/.exec(url);
  return !!m && !PUBLIC_FUNCTIONS.includes(m[1]);
}

/** A supabase-js FunctionsHttpError for an ended session. */
export function isSessionEndedError(error: unknown): boolean {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  return status === 401;
}

export const SERVER_UNAVAILABLE_TEXT = "Couldn't reach the server. Please try again.";

/** A supabase-js FunctionsHttpError for "the server couldn't check who you are right now" (503). */
export function isServerUnavailableError(error: unknown): boolean {
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  return status === 503;
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function bearer(init?: RequestInit): string {
  return (new Headers(init?.headers).get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
}

/** The response says plainly that the session has ended (code 'session_ended'). */
async function saysSessionEnded(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as { code?: string };
    return body?.code === 'session_ended';
  } catch {
    return false;
  }
}

/**
 * The fetch every Supabase request goes through (lib/supabase). A 401 from
 * one of our Edge Functions sent with the parent's token: refresh the
 * session once (shared by requests that fail together) and repeat the
 * request with the new token. Sign this phone out only when the refresh
 * fails, or the repeat still answers 401 'session_ended'. The caller always
 * gets a response.
 */
export function createSessionAwareFetch(deps: {
  baseFetch: Fetch;
  anonKey: string;
  /**
   * supabase.auth.refreshSession: the new access token, null when the session
   * is really over, or 'unavailable' when the refresh itself couldn't reach
   * the server (network blip, 5xx) — then the phone stays signed in.
   */
  refresh: () => Promise<string | null | 'unavailable'>;
  /** supabase.auth.signOut({ scope: 'local' }). */
  signOut: () => Promise<void>;
}): Fetch {
  let refreshing: Promise<string | null | 'unavailable'> | null = null;
  let endingSession = false;

  const endSession = () => {
    if (endingSession) return;
    endingSession = true;
    markSessionEnded();
    void deps
      .signOut()
      .catch(() => undefined)
      .finally(() => {
        endingSession = false;
      });
  };

  return async (input, init) => {
    const res = await deps.baseFetch(input, init);
    const token = bearer(init);
    const hadUserToken = !!token && token !== deps.anonKey;
    if (!isSessionEndedResponse(requestUrl(input), res.status, hadUserToken)) return res;

    refreshing ??= deps
      .refresh()
      .catch((): 'unavailable' => 'unavailable')
      .finally(() => {
        refreshing = null;
      });
    const fresh = await refreshing;
    if (fresh === 'unavailable') return res;
    if (!fresh) {
      endSession();
      return res;
    }
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${fresh}`);
    const again = await deps.baseFetch(input, { ...init, headers });
    if (again.status === 401 && (await saysSessionEnded(again))) endSession();
    return again;
  };
}

let pending = false;

export function markSessionEnded() {
  pending = true;
}

/** True once after the session ended (the sign-in screen shows SESSION_ENDED_TEXT). */
export function takeSessionEnded(): boolean {
  const p = pending;
  pending = false;
  return p;
}

/** Without taking it: AuthGate sends the parent to sign-in instead of the splash. */
export function sessionEndedPending(): boolean {
  return pending;
}
