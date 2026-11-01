// deno test --allow-env supabase/functions/_shared/consultCancel_test.ts
//
// The cancel + refund helper shared by consult-payment `cancel` and
// delete-account (item 11). Fake Supabase client, fake Razorpay (fetch).
// deno-lint-ignore-file no-explicit-any
import { assertEquals } from 'jsr:@std/assert@1';
import { cancelConsult } from './consultCancel.ts';
import { istParts } from './schedule.ts';
import { fakeAdmin, stubRazorpay } from './testing/fakeAdmin.ts';

const FAR = { date: '2030-01-07', time: '10:00:00' };
function soon() {
  const p = istParts(new Date(Date.now() + 60 * 60_000)); // 1 h from now: under the 2 h line
  return { date: p.date, time: `${p.time}:00` };
}

function setup(apptStatus: string, when = FAR, payments: any[] = []) {
  const appt = { id: 'a1', parent_id: 'u1', status: apptStatus, ...when, last_rescheduled_by: null, rescheduled_at: null };
  const f = fakeAdmin({ appointments: [{ ...appt }], payments, notification_log: [] });
  return { f, appt };
}

const paid = (over: any = {}) => ({
  id: 'p1', appointment_id: 'a1', parent_id: 'u1', status: 'paid', razorpay_payment_id: 'pay_1', amount_paise: 44900, ...over,
});

Deno.test('cancel: early parent cancel of a paid consult refunds in full, once', async () => {
  const calls = stubRazorpay();
  const { f, appt } = setup('upcoming', FAR, [paid()]);
  const r = await cancelConsult(f.client, appt, { by: 'parent' });
  assertEquals(r, { done: true, refund: 'started' });
  assertEquals(f.tables.appointments[0].status, 'cancelled');
  assertEquals(f.tables.appointments[0].cancel_reason, 'parent');
  const refunds = calls.filter((c) => c.url.endsWith('/payments/pay_1/refund'));
  assertEquals(refunds.length, 1);
  assertEquals(refunds[0].body.amount, 44900);
  assertEquals(refunds[0].body.notes.reason, 'parent_cancelled');
  assertEquals(f.tables.payments[0].status, 'refunded');
});

Deno.test('cancel: late parent cancel is not refunded under the rules', async () => {
  const calls = stubRazorpay();
  const { f, appt } = setup('upcoming', soon(), [paid()]);
  assertEquals(await cancelConsult(f.client, appt, { by: 'parent' }), { done: true, refund: 'none', late: true });
  assertEquals(calls.length, 0);
  assertEquals(f.tables.payments[0].status, 'paid');
});

Deno.test('cancel: a late parent cancel is still refunded if the doctor moved it in the last 24 h', async () => {
  const calls = stubRazorpay();
  const { f, appt } = setup('upcoming', soon(), [paid()]);
  const moved = { ...appt, last_rescheduled_by: 'doctor', rescheduled_at: new Date(Date.now() - 3600_000).toISOString() };
  const r = await cancelConsult(f.client, moved, { by: 'parent', refundReason: 'account_deleted' });
  assertEquals(r, { done: true, refund: 'started' });
  assertEquals(calls[0].body.notes.reason, 'account_deleted');
});

Deno.test('cancel: doctor cancel refunds even when late', async () => {
  stubRazorpay();
  const { f, appt } = setup('upcoming', soon(), [paid()]);
  assertEquals(await cancelConsult(f.client, appt, { by: 'doctor' }), { done: true, refund: 'started' });
  assertEquals(f.tables.payments[0].refund_reason, 'doctor_cancelled');
});

Deno.test('cancel: an unpaid hold is dropped and its open link cancelled at Razorpay', async () => {
  const calls = stubRazorpay();
  const { f, appt } = setup('awaiting_payment', FAR, [
    { id: 'p1', appointment_id: 'a1', status: 'created', razorpay_link_id: 'plink_1', amount_paise: 44900 },
  ]);
  assertEquals(await cancelConsult(f.client, appt, { by: 'parent' }), { done: true, refund: 'not_paid' });
  assertEquals(calls.map((c) => c.url.replace('https://api.razorpay.com/v1', '')), ['/payment_links/plink_1/cancel']);
  assertEquals(f.tables.payments[0].status, 'cancelled');
});

Deno.test('cancel: Razorpay refusing the refund reports failed and leaves refund_failed', async () => {
  stubRazorpay({ status: 400, body: { error: { description: 'x' } } });
  const { f, appt } = setup('upcoming', FAR, [paid()]);
  assertEquals(await cancelConsult(f.client, appt, { by: 'parent', awaitAlert: true }), { done: true, refund: 'failed' });
  assertEquals(f.tables.payments[0].status, 'refund_failed');
  // ...and the team alert was attempted (no SMTP in tests: logged as skipped).
  const alert = f.tables.notification_log.filter((n) => n.template === 'refund_alert');
  assertEquals(alert.length, 1);
  assertEquals(alert[0].payload.payment_id, 'p1');
});

Deno.test('cancel: nothing changes for a cancelled, past or changed booking', async () => {
  const calls = stubRazorpay();
  const a = setup('cancelled');
  assertEquals(await cancelConsult(a.f.client, a.appt, { by: 'parent' }), { done: false, why: 'already_cancelled' });
  const b = setup('completed');
  assertEquals(await cancelConsult(b.f.client, b.appt, { by: 'parent' }), { done: false, why: 'not_cancellable' });
  // We read 'awaiting_payment' but it was paid meanwhile: no blind cancel.
  const c = setup('upcoming', FAR, [paid()]);
  assertEquals(await cancelConsult(c.f.client, { ...c.appt, status: 'awaiting_payment' }, { by: 'parent' }), {
    done: false,
    why: 'changed',
  });
  assertEquals(c.f.tables.appointments[0].status, 'upcoming');
  assertEquals(calls.length, 0);
});
