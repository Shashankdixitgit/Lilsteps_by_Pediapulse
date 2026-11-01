// Client Care Plan flow (lib/carePlan.ts) with Expo/RN/Supabase stubbed.
//   deno test --no-check --allow-env --import-map=tests/deno/import_map.json tests/deno/
import { assertEquals } from 'jsr:@std/assert@1';
import { Platform } from 'react-native';
import { dismissed, opened, openedOptions, resetBrowser, setNextResult } from 'expo-web-browser';
import { invoked, setInvokeHandler } from '@/lib/supabase';
import { type CarePlan, subscribeToCarePlan, takePendingCarePlan, viewOf } from '../../lib/carePlan.ts';
import { bookWithCarePlan } from '../../lib/consultPayment.ts';
import { planRecheckMs } from '../../lib/carePlan.ts';
import { paymentPagePoll } from '../../lib/paymentBrowser.ts';

planRecheckMs.value = 5;
paymentPagePoll.everyMs = 5;

const PAGE = 'https://rzp.io/rzp/sub123';
const plan = (over: Partial<CarePlan> = {}): CarePlan => ({
  status: 'active',
  cancel_at_period_end: false,
  current_end: '2026-12-01T00:00:00Z',
  ended_at: null,
  credits_total: 3,
  credits_left: 2,
  period_end: '2026-12-01T00:00:00Z',
  ...over,
});

Deno.test('view: what the parent sees for each server state', () => {
  assertEquals(viewOf(null).kind, 'none');
  assertEquals(viewOf(plan()), { kind: 'active', left: 2, total: 3, renewsOn: '2026-12-01T00:00:00Z' });
  assertEquals(viewOf(plan({ cancel_at_period_end: true })).kind, 'ending');
  // Authenticated/active but no paid month recorded yet: still starting.
  assertEquals(viewOf(plan({ credits_left: null, credits_total: null, period_end: null })).kind, 'starting');
  assertEquals(viewOf(plan({ status: 'created' })).kind, 'starting');
  assertEquals(viewOf(plan({ status: 'pending' })).kind, 'retrying');
  assertEquals(viewOf(plan({ status: 'halted' })).kind, 'paused');
  // Cancelled at Razorpay but the paid month still runs: the consults left stay usable.
  assertEquals(viewOf(plan({ status: 'cancelled' })).kind, 'ended');
  assertEquals(viewOf(plan({ status: 'cancelled', credits_left: null, credits_total: null, period_end: null })).kind, 'none');
});

Deno.test('subscribe, web: full-page redirect to Razorpay, checked again on return', async () => {
  Platform.OS = 'web';
  const loc = { href: 'https://app.example.test/profile/care-plan' };
  // deno-lint-ignore no-explicit-any
  (globalThis as any).location = loc;
  opened.length = 0;
  invoked.length = 0;
  setInvokeHandler((_n, body) => (body.action === 'subscribe' ? { url: PAGE } : { plan: plan() }));
  assertEquals(await subscribeToCarePlan(), { state: 'redirecting' });
  assertEquals(loc.href, PAGE);
  assertEquals(opened.length, 0, 'no popup on web');
  assertEquals(invoked.map((c) => [c.name, c.body.action]), [['care-plan', 'subscribe']]);
  assertEquals(takePendingCarePlan(), true);
  assertEquals(takePendingCarePlan(), false, 'only once');
});

Deno.test('subscribe, native: auth session, then the server is asked (never the browser result)', async () => {
  Platform.OS = 'ios';
  opened.length = 0;
  invoked.length = 0;
  setNextResult({ type: 'cancel' }); // Razorpay's page has no redirect back: the parent taps Done
  setInvokeHandler((_n, body) => (body.action === 'subscribe' ? { url: PAGE } : { plan: plan({ credits_left: 3 }) }));
  const r = await subscribeToCarePlan();
  assertEquals(opened, [PAGE]);
  assertEquals(r.state === 'done' && viewOf(r.plan).kind, 'active');
  assertEquals(invoked.map((c) => c.body.action), ['subscribe', 'status']);
});

Deno.test('subscribe: already subscribed → no page, just the plan', async () => {
  Platform.OS = 'android';
  opened.length = 0;
  setInvokeHandler((_n, body) => (body.action === 'subscribe' ? { state: 'active' } : { plan: plan() }));
  const r = await subscribeToCarePlan();
  assertEquals(opened.length, 0);
  assertEquals(r.state, 'done');
});

Deno.test('booking with the plan: one call, no amount sent', async () => {
  invoked.length = 0;
  setInvokeHandler(() => ({ state: 'paid', plan: true }));
  assertEquals(await bookWithCarePlan('appt-9'), { state: 'paid', plan: true });
  assertEquals(invoked, [{ name: 'consult-payment', body: { action: 'use_plan', appointmentId: 'appt-9' } }]);
});

// Mobile review must-fix 13: Razorpay's subscription page has no redirect
// back; the app closes it once the server confirms the plan.
Deno.test('subscribe, iOS: page closed by the app when the plan is confirmed; ephemeral session', async () => {
  Platform.OS = 'ios';
  resetBrowser();
  invoked.length = 0;
  let checks = 0;
  setInvokeHandler((_n, body) =>
    body.action === 'subscribe'
      ? { url: PAGE }
      : { plan: ++checks >= 2 ? plan() : plan({ status: 'created', credits_left: null, credits_total: null }) },
  );
  setNextResult('holdOpen');
  const r = await subscribeToCarePlan();
  assertEquals(dismissed, 1, 'closed by the app, no "Cancel" tap');
  assertEquals(openedOptions, [{ preferEphemeralSession: true }]);
  assertEquals(r.state === 'done' && viewOf(r.plan).kind, 'active');
});

Deno.test('subscribe, Android: closed by the parent, slow confirmation is waited for', async () => {
  Platform.OS = 'android';
  resetBrowser();
  let checks = 0;
  setInvokeHandler((_n, body) =>
    body.action === 'subscribe'
      ? { url: PAGE }
      : { plan: ++checks >= 4 ? plan() : plan({ status: 'created', credits_left: null, credits_total: null }) },
  );
  setNextResult({ type: 'cancel' });
  const r = await subscribeToCarePlan();
  assertEquals(r.state === 'done' && viewOf(r.plan).kind, 'active', 'no "Not finished yet" for a slow webhook');
});
