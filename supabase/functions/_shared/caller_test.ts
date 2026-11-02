// PR #26 review items 2b and 5 (server side).
//   deno test --allow-env --no-check supabase/functions/_shared/caller_test.ts
import { assertEquals } from 'jsr:@std/assert@1';
import { callerFailureResponse, isAuthUnavailable } from './supabase.ts';
import { renderTemplate } from './templates.ts';

Deno.test('auth errors: bad token = session ended; network / 5xx = unavailable (503, never a sign-out)', async () => {
  assertEquals(isAuthUnavailable({ status: 401, name: 'AuthApiError' }), false);
  assertEquals(isAuthUnavailable({ status: 403, name: 'AuthApiError' }), false);
  assertEquals(isAuthUnavailable({ status: 0, name: 'AuthRetryableFetchError' }), true);
  assertEquals(isAuthUnavailable({ status: 502, name: 'AuthApiError' }), true);
  assertEquals(isAuthUnavailable(null), false);
  const ended = callerFailureResponse('session_ended');
  assertEquals(ended.status, 401);
  assertEquals((await ended.json()).code, 'session_ended');
  const down = callerFailureResponse('unavailable');
  assertEquals(down.status, 503);
  assertEquals((await down.json()).code, 'auth_unavailable');
});

Deno.test('push data: /chat/{{conversationId}} only for a safe id', () => {
  assertEquals(renderTemplate('new_message', { doctor: 'Dr X', conversationId: 'abc-123' }).data?.url, '/chat/abc-123');
  const bad = renderTemplate('new_message', { doctor: 'Dr X', conversationId: '../profile' }).data;
  assertEquals(bad?.url, undefined);
  assertEquals(renderTemplate('vaccine_due_soon', { vaccine: 'MMR', child: 'Myra', date: '1 Dec' }).data?.url, '/vaccine');
});
