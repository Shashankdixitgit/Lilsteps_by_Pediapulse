/**
 * The in-app path to return to after signing in, or '/' when `next` is not a
 * plain same-site path (blocks open redirects such as //evil.com or /\evil).
 */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/login')) return '/';
  if (/[\u0000-\u001f]/.test(next) || next.length > 1000) return '/';
  return next;
}
