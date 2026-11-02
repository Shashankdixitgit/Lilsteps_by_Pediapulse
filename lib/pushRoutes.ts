/**
 * Where a tapped push notification opens (mobile review should-fix 2).
 * The server puts `url` (an in-app path) in the push data; older pushes
 * only carry `type`. Only known app paths, with ids of letters, digits,
 * '_' and '-', are ever opened: never another site or an odd path.
 *
 * No React Native imports: tested with Deno.
 */
export const PUSH_CHANNEL_ID = 'reminders';

/** Paths a tap may open as they are (PR #26 review item 5). */
const PUSH_PATHS = new Set(['/(tabs)', '/consult', '/vaccine', '/records', '/checkin', '/profile/care-plan']);
/** Paths that take one id: /chat/<id>, /consult/<id>, /records/<id>. */
const PUSH_ID_PREFIXES = ['/chat/', '/consult/', '/records/'];
const ID_RE = /^[\w-]+$/;

export function isAllowedPushPath(path: string): boolean {
  if (PUSH_PATHS.has(path)) return true;
  const prefix = PUSH_ID_PREFIXES.find((p) => path.startsWith(p));
  return !!prefix && ID_RE.test(path.slice(prefix.length));
}

export function pushTarget(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const url = typeof d.url === 'string' ? d.url : null;
  if (url && isAllowedPushPath(url)) return url;
  if (d.type === 'message' && typeof d.conversationId === 'string' && ID_RE.test(d.conversationId)) {
    return `/chat/${d.conversationId}`;
  }
  return null;
}
