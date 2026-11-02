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

/** Paths of the tab screens: opening one shows the tab bar already. */
const TAB_PATHS = new Set(['/', '/records', '/vaccine', '/consult', '/growth']);

/**
 * How to open the remembered link after sign-in, as a list of router steps.
 * Native: a stack screen (e.g. /consult/updates) opened with replace was
 * the only screen left, so its back arrow did nothing, there was no tab bar
 * and Android back closed the app (mobile review must-fix 12). The tabs go
 * underneath it first. Web keeps one replace: the browser has its own history.
 */
export function returnToSteps(path: string, platform: string): { op: 'replace' | 'push'; href: string }[] {
  const bare = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (platform === 'web' || TAB_PATHS.has(bare)) return [{ op: 'replace', href: path }];
  return [
    { op: 'replace', href: '/(tabs)' },
    { op: 'push', href: path },
  ];
}
