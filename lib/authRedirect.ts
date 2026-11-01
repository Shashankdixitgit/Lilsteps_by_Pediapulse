/**
 * Where to go after sign-in when a signed-out parent opened a protected
 * link (e.g. /records from an email). Set by AuthGate, read once by the
 * sign-in screen. In memory: the sign-in screen is in the same app session.
 */
let returnTo: string | null = null;

/** Only in-app paths ("/records", "/consult/updates?x=1"); never another site. */
function isAppPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('://');
}

export function setReturnTo(path: string | null) {
  returnTo = path && isAppPath(path) && path !== '/' ? path : null;
}

/** The saved path, cleared as it is read. */
export function takeReturnTo(): string | null {
  const p = returnTo;
  returnTo = null;
  return p;
}
