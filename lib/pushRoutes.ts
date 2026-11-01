/**
 * Where a tapped push notification opens (mobile review should-fix 2).
 * The server puts `url` (an in-app path) in the push data; older pushes
 * only carry `type`. Never a URL to another site.
 *
 * No React Native imports: tested with Deno.
 */
export const PUSH_CHANNEL_ID = 'reminders';

export function pushTarget(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const url = typeof d.url === 'string' ? d.url : null;
  if (url && url.startsWith('/') && !url.startsWith('//') && !url.includes('://')) return url;
  if (d.type === 'message' && typeof d.conversationId === 'string' && /^[\w-]+$/.test(d.conversationId)) {
    return `/chat/${d.conversationId}`;
  }
  return null;
}
