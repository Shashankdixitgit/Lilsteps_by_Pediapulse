/**
 * The server said this phone's session has ended (mobile review must-fix 8).
 *
 * Sign-out used to revoke every session of the account, so signing out on
 * one phone left the parent's other phones half signed in: lists still
 * loaded from the cached token, but Pay, Cancel and Care Plan failed with
 * the raw text "Invalid session". Sign-out is now this device only
 * (context/auth signOut, scope 'local'). If the server still answers 401
 * (the session was revoked another way, or it expired), the app signs this
 * phone out and the sign-in screen says why.
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
