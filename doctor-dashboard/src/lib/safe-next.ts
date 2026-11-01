import { stripBasePath } from '@/lib/base-path';

/**
 * The in-app path to return to after signing in, or '/' when `next` is not a
 * plain same-site path (blocks open redirects such as //evil.com or /\evil).
 *
 * Paths are app-relative (no basePath): redirect() and the proxy add the
 * prefix. A full public path such as '/doctor/settings' is accepted and
 * reduced to '/settings'.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  if (next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (/[\u0000-\u001f]/.test(next) || next.length > 1000) return '/';
  const path = stripBasePath(next);
  if (path.startsWith('//') || path.startsWith('/\\') || path.startsWith('/login')) return '/';
  return path;
}
