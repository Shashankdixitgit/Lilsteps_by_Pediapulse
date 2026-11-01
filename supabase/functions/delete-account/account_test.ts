// deno test --allow-env supabase/functions/delete-account/account_test.ts
//
// Item 11: deleting an account cancels its not-yet-started consults with the
// SAME refund rules as a parent cancel (full 2 h+ ahead or doctor moved it in
// the last 24 h; otherwise none), leaves consults that already started alone,
// and a failed refund never blocks the deletion: the payment stays
// refund_failed, unlinked from the deleted parent, and the team is alerted.
// deno-lint-ignore-file no-explicit-any
import { assertEquals } from 'jsr:@std/assert@1';
import { deleteAccountData, settleConsultsBeforeDelete } from './account.ts';
import { istParts } from '../_shared/schedule.ts';
import { fakeAdmin, stubRazorpay } from '../_shared/testing/fakeAdmin.ts';

/** An IST date + time `minutes` from now (negative: in the past). */
function at(minutes: number) {
  const p = istParts(new Date(Date.now() + minutes * 60_000));
  return { date: p.date, time: `${p.time}:00` };
}

const pay = (id: string, appointment_id: string, over: any = {}) => ({
  id, appointment_id, parent_id: 'u1', status: 'paid', razorpay_payment_id: `pay_${id}`, amount_paise: 44900, ...over,
});

function account() {
  return fakeAdmin({
    parents: [{ id: 'u1', name: 'Priya' }, { id: 'u2', name: 'Other' }],
    children: [{ id: 'c1', parent_id: 'u1' }],
    appointments: [
      // Paid, 2 days away: refunded in full.
      { id: 'a_early', parent_id: 'u1', status: 'upcoming', ...at(2 * 24 * 60) },
      // Paid, 30 minutes away: cancelled, not refunded (refund policy).
      { id: 'a_late', parent_id: 'u1', status: 'upcoming', ...at(30) },
      // Paid, started an hour ago and still 'upcoming' (never closed): untouched.
      { id: 'a_past', parent_id: 'u1', status: 'upcoming', ...at(-60) },
      // Unpaid hold with an open link: dropped.
      { id: 'a_hold', parent_id: 'u1', status: 'awaiting_payment', ...at(3 * 24 * 60) },
      // Already happened: untouched.
      { id: 'a_done', parent_id: 'u1', status: 'completed', date: '2026-10-01', time: '10:00:00' },
      // Someone else's consult: untouched.
      { id: 'a_other', parent_id: 'u2', status: 'upcoming', ...at(2 * 24 * 60) },
    ],
    payments: [
      pay('early', 'a_early'),
      pay('late', 'a_late'),
      pay('past', 'a_past'),
      { id: 'hold', appointment_id: 'a_hold', parent_id: 'u1', status: 'created', razorpay_link_id: 'plink_hold', amount_paise: 44900 },
      pay('done', 'a_done'),
      pay('other', 'a_other', { parent_id: 'u2' }),
    ],
    notification_log: [{ id: 'n1', parent_id: 'u1', template: 'appointment_confirmation', status: 'sent' }],
    documents: [],
    health_notes: [],
    prescriptions: [],
  });
}

const refundCalls = (calls: Array<{ url: string; body: any }>) => calls.filter((c) => c.url.includes('/refund'));

Deno.test('delete-account: same refund rules as a parent cancel; started consults left alone; hold dropped', async () => {
  const calls = stubRazorpay({ status: 200, body: { id: 'rfnd_1', status: 'pending' } });
  const f = account();
  const s = await settleConsultsBeforeDelete(f.client, 'u1');
  assertEquals(s, { cancelled: 3, lateNotRefunded: 1, refundsStarted: 1, refundsFailed: 0 });

  const refunds = refundCalls(calls);
  assertEquals(refunds.length, 1);
  assertEquals(refunds[0].url.endsWith('/payments/pay_early/refund'), true);
  assertEquals(refunds[0].body.amount, 44900);
  assertEquals(refunds[0].body.notes.reason, 'account_deleted');
  assertEquals(calls.some((c) => c.url.endsWith('/payment_links/plink_hold/cancel')), true);

  const appt = (id: string) => f.tables.appointments.find((a) => a.id === id)!.status;
  assertEquals(
    ['a_early', 'a_late', 'a_past', 'a_hold', 'a_done', 'a_other'].map(appt),
    ['cancelled', 'cancelled', 'upcoming', 'cancelled', 'completed', 'upcoming'],
  );
  const p = (id: string) => f.tables.payments.find((x) => x.id === id)!;
  assertEquals(
    ['early', 'late', 'past', 'hold', 'done', 'other'].map((id) => p(id).status),
    ['refund_pending', 'paid', 'paid', 'cancelled', 'paid', 'paid'],
  );

  // Then the existing deletion runs; payment records stay, unlinked.
  await deleteAccountData(f.client, 'u1');
  assertEquals(f.deletedUsers, ['u1']);
  assertEquals([p('early').parent_id, p('early').appointment_id, p('past').parent_id], [null, null, null]);
  assertEquals(p('other').parent_id, 'u2');
  assertEquals(f.tables.notification_log.filter((n) => n.id === 'n1').length, 0);
});

Deno.test('review #16 HIGH: attend a consult, then delete the account — no refund', async () => {
  const calls = stubRazorpay();
  const f = fakeAdmin({
    parents: [{ id: 'u1' }],
    // Every live 'upcoming' row in the past looks like this: the consult took
    // place but nobody closed it.
    appointments: [
      { id: 'a1', parent_id: 'u1', status: 'upcoming', ...at(-24 * 60) },
      { id: 'a2', parent_id: 'u1', status: 'upcoming', ...at(-5) },
    ],
    payments: [pay('p1', 'a1'), pay('p2', 'a2')],
    notification_log: [],
  });
  assertEquals(await settleConsultsBeforeDelete(f.client, 'u1'), {
    cancelled: 0, lateNotRefunded: 0, refundsStarted: 0, refundsFailed: 0,
  });
  assertEquals(calls.length, 0);
  assertEquals(f.tables.payments.map((x) => x.status), ['paid', 'paid']);
});

Deno.test('delete-account: a late cancel is still refunded when the doctor moved the consult in the last 24 h', async () => {
  const calls = stubRazorpay();
  const f = fakeAdmin({
    parents: [{ id: 'u1' }],
    appointments: [{
      id: 'a1', parent_id: 'u1', status: 'upcoming', ...at(30),
      last_rescheduled_by: 'doctor', rescheduled_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    }],
    payments: [pay('p1', 'a1')],
    notification_log: [],
  });
  assertEquals((await settleConsultsBeforeDelete(f.client, 'u1')).refundsStarted, 1);
  assertEquals(refundCalls(calls).length, 1);
});

Deno.test('delete-account: a failed refund still deletes; the payment stays refund_failed and the team is alerted', async () => {
  stubRazorpay({ status: 500, body: {} });
  const f = account();
  const s = await settleConsultsBeforeDelete(f.client, 'u1');
  assertEquals(s, { cancelled: 3, lateNotRefunded: 1, refundsStarted: 0, refundsFailed: 1 });

  await deleteAccountData(f.client, 'u1');
  assertEquals(f.deletedUsers, ['u1']);
  const p = f.tables.payments.find((x) => x.id === 'early')!;
  assertEquals(p.status, 'refund_failed');
  assertEquals(p.parent_id, null);
  // The alert row was written before the deletion (awaited), and survives it.
  const alerts = f.tables.notification_log.filter((n) => n.template === 'refund_alert');
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].payload.payment_id, 'early');
});

Deno.test('delete-account: money already owed back is refunded too, and not twice in one run', async () => {
  const calls = stubRazorpay({ status: 200, body: { id: 'rfnd_1', status: 'processed' } });
  const f = fakeAdmin({
    parents: [{ id: 'u1' }],
    appointments: [],
    payments: [
      { id: 'p_owed', appointment_id: null, parent_id: 'u1', status: 'refund_failed', refund_reason: 'no_consult_for_payment', razorpay_payment_id: 'pay_9', amount_paise: 44900 },
    ],
    notification_log: [],
  });
  assertEquals(await settleConsultsBeforeDelete(f.client, 'u1'), { cancelled: 0, lateNotRefunded: 0, refundsStarted: 1, refundsFailed: 0 });
  assertEquals(refundCalls(calls).length, 1);
  assertEquals(refundCalls(calls)[0].body.notes.reason, 'no_consult_for_payment');
  assertEquals(f.tables.payments[0].status, 'refunded');
});

Deno.test('delete-account: a consult paid between reading and cancelling is read again and refunded', async () => {
  const calls = stubRazorpay();
  const f = fakeAdmin({
    parents: [{ id: 'u1' }],
    appointments: [{ id: 'a1', parent_id: 'u1', status: 'awaiting_payment', date: '2030-01-07', time: '10:00:00' }],
    payments: [{ id: 'p1', appointment_id: 'a1', parent_id: 'u1', status: 'created', razorpay_link_id: 'plink_1', amount_paise: 44900 }],
    notification_log: [],
  });
  // The webhook confirms the payment after settle read the booking, just
  // before its first cancel lands.
  const realFrom = f.client.from;
  let updates = 0;
  f.client.from = (t: string) => {
    const q = realFrom(t);
    if (t === 'appointments') {
      const update = q.update;
      q.update = (patch: any) => {
        if (updates++ === 0) {
          f.tables.appointments[0].status = 'upcoming';
          Object.assign(f.tables.payments[0], { status: 'paid', razorpay_payment_id: 'pay_1' });
        }
        return update(patch);
      };
    }
    return q;
  };
  assertEquals(await settleConsultsBeforeDelete(f.client, 'u1'), { cancelled: 1, lateNotRefunded: 0, refundsStarted: 1, refundsFailed: 0 });
  assertEquals(refundCalls(calls).length, 1);
  assertEquals(f.tables.appointments[0].status, 'cancelled');
});
