// deno test --allow-env supabase/functions/_shared/razorpay_timeout_test.ts
//
// Review of PR #16, item 2: every Razorpay call has a timeout. A refund that
// times out is refund_failed (and the team is alerted); a Payment Link cancel
// that times out never blocks the cancel around it.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { RAZORPAY_TIMEOUT_MS, refundPaymentRow } from './razorpay.ts';
import { cancelConsult } from './consultCancel.ts';
import { fakeAdmin } from './testing/fakeAdmin.ts';

/** A Razorpay that never answers; it only honours the abort signal. */
function hangingRazorpay() {
  Deno.env.set('RAZORPAY_KEY_ID', 'rzp_test_x');
  Deno.env.set('RAZORPAY_KEY_SECRET', 'secret');
  Deno.env.set('RAZORPAY_TIMEOUT_MS', '50');
  const seen: Array<{ url: string; hadSignal: boolean }> = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    seen.push({ url: String(url), hadSignal: !!init?.signal });
    return new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    });
  }) as typeof fetch;
  return seen;
}

Deno.test('timeout: the default is 15 s', () => {
  assertEquals(RAZORPAY_TIMEOUT_MS, 15_000);
});

Deno.test('timeout: a refund Razorpay never answers becomes refund_failed and alerts the team', async () => {
  const seen = hangingRazorpay();
  const f = fakeAdmin({
    payments: [{ id: 'p1', appointment_id: null, parent_id: 'u1', status: 'paid', razorpay_payment_id: 'pay_1', amount_paise: 44900 }],
    notification_log: [],
  });
  const t0 = performance.now();
  assertEquals(await refundPaymentRow(f.client, 'p1', 'parent_cancelled', { awaitAlert: true }), 'refund_failed');
  assert(performance.now() - t0 < 5_000, 'refund waited for a stalled Razorpay');
  assert(seen.every((c) => c.hadSignal), 'a Razorpay call had no timeout signal');
  assertEquals(f.tables.payments[0].status, 'refund_failed');
  const alerts = f.tables.notification_log.filter((n) => n.template === 'refund_alert');
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].payload.payment_id, 'p1');
  Deno.env.delete('RAZORPAY_TIMEOUT_MS');
});

Deno.test('timeout: a stalled Payment Link cancel does not block cancelling the hold', async () => {
  const seen = hangingRazorpay();
  const f = fakeAdmin({
    appointments: [{ id: 'a1', parent_id: 'u1', status: 'awaiting_payment', date: '2030-01-07', time: '10:00:00' }],
    payments: [{ id: 'p1', appointment_id: 'a1', status: 'created', razorpay_link_id: 'plink_1', amount_paise: 44900 }],
    notification_log: [],
  });
  const appt = { id: 'a1', status: 'awaiting_payment', date: '2030-01-07', time: '10:00:00' };
  assertEquals(await cancelConsult(f.client, appt, { by: 'parent' }), { done: true, refund: 'not_paid' });
  assertEquals(seen.length, 1);
  assertEquals(f.tables.appointments[0].status, 'cancelled');
  assertEquals(f.tables.payments[0].status, 'cancelled');
  Deno.env.delete('RAZORPAY_TIMEOUT_MS');
});
