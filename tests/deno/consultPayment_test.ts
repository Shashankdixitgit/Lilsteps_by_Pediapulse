// Client payment flow (lib/consultPayment.ts) with Expo/RN/Supabase stubbed.
//   deno test --no-check --allow-env --import-map=tests/deno/import_map.json tests/deno/
// (--no-check: the app file is type-checked by the app's own tsc; here its
// imports are stubs.)
//
// Regression (PR #6 review, item 8): on web the payment page must open by a
// full-page redirect — an auth-session popup opened after two network calls
// is blocked by browsers — and the booking must be remembered for the
// return page.
import { assertEquals } from 'jsr:@std/assert@1';
import { Platform } from 'react-native';
import { opened, setNextResult } from 'expo-web-browser';
import { invoked, setInvokeHandler } from '@/lib/supabase';
import {
  clearPendingWebPayment,
  payForConsult,
  readPendingWebPayment,
  rescheduleConsult,
} from '../../lib/consultPayment.ts';

const LINK = 'https://rzp.io/rzp/test123';

function fakeServer(state: 'paid' | 'pending') {
  setInvokeHandler((_name, body) => {
    if (body.action === 'start') return { url: LINK, expiresAt: new Date().toISOString() };
    if (body.action === 'status') return { state };
    return {};
  });
}

Deno.test('web: full-page redirect to Razorpay, no popup, booking remembered', async () => {
  Platform.OS = 'web';
  const loc = { href: 'https://app.example.test/consult/confirm' };
  // deno-lint-ignore no-explicit-any
  (globalThis as any).location = loc;
  opened.length = 0;
  invoked.length = 0;
  fakeServer('pending');

  const result = await payForConsult('appt-1', 'Dr. Rao, tomorrow at 10:30');

  assertEquals(result.state, 'redirecting');
  assertEquals(loc.href, LINK);
  assertEquals(opened.length, 0, 'no auth-session popup on web');
  assertEquals(invoked.map((c) => c.body.action), ['start'], 'no status check before leaving');
  assertEquals(readPendingWebPayment(), { appointmentId: 'appt-1', label: 'Dr. Rao, tomorrow at 10:30' });
  clearPendingWebPayment();
  assertEquals(readPendingWebPayment(), null);
});

Deno.test('native: auth session, then the server status (not the browser) decides', async () => {
  Platform.OS = 'ios';
  opened.length = 0;
  invoked.length = 0;
  fakeServer('paid');
  setNextResult({
    type: 'success',
    url:
      'lilsteps://payment-return?razorpay_payment_id=pay_1&razorpay_payment_link_id=plink_1' +
      '&razorpay_payment_link_reference_id=ref&razorpay_payment_link_status=paid&razorpay_signature=abc',
  });

  const result = await payForConsult('appt-2');

  assertEquals(result.state, 'paid');
  assertEquals(opened, [LINK]);
  const status = invoked.find((c) => c.body.action === 'status');
  assertEquals(status?.body.callback?.razorpay_payment_link_id, 'plink_1', 'signed callback passed to the server');
});

Deno.test('start is server-priced: the client never sends an amount', async () => {
  Platform.OS = 'android';
  invoked.length = 0;
  fakeServer('paid');
  setNextResult({ type: 'cancel' });
  await payForConsult('appt-3');
  for (const c of invoked) assertEquals('amount' in c.body || 'amount_paise' in c.body, false);
});

Deno.test('reschedule: asks the server with the booking and the new slot only, returns the new time', async () => {
  invoked.length = 0;
  setInvokeHandler((_name, body) =>
    body.action === 'reschedule'
      ? { appointment: { id: body.appointmentId, date: '2026-11-04', time: '09:00', reschedule_count: 1 } }
      : {},
  );
  const moved = await rescheduleConsult('appt-4', 'slot-9');
  assertEquals(invoked, [{ name: 'consult-payment', body: { action: 'reschedule', appointmentId: 'appt-4', slotId: 'slot-9' } }]);
  assertEquals(moved, { id: 'appt-4', date: '2026-11-04', time: '09:00', reschedule_count: 1 });
});
