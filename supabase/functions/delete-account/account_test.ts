// deno test --allow-env supabase/functions/delete-account/account_test.ts
//
// Item 11: deleting an account cancels its upcoming consults and refunds the
// paid ones in full (through the shared cancel helper), and a failed refund
// never blocks the deletion: the payment stays refund_failed, unlinked from
// the deleted parent, and the team alert is raised.
// deno-lint-ignore-file no-explicit-any
import { assertEquals } from 'jsr:@std/assert@1';
import { deleteAccountData, settleConsultsBeforeDelete } from './account.ts';
import { istParts } from '../_shared/schedule.ts';
import { fakeAdmin, stubRazorpay } from '../_shared/testing/fakeAdmin.ts';

function soon() {
  const p = istParts(new Date(Date.now() + 30 * 60_000)); // under the 2 h line
  return { date: p.date, time: `${p.time}:00` };
}

function account() {
  return fakeAdmin({
    parents: [{ id: 'u1', name: 'Priya' }, { id: 'u2', name: 'Other' }],
    children: [{ id: 'c1', parent_id: 'u1' }],
    appointments: [
      // Paid, 30 minutes away: a normal parent cancel would not be refunded.
      { id: 'a_paid', parent_id: 'u1', status: 'upcoming', ...soon() },
      // Unpaid hold with an open link.
      { id: 'a_hold', parent_id: 'u1', status: 'awaiting_payment', date: '2030-01-07', time: '11:00:00' },
      // Already happened: untouched, no refund.
      { id: 'a_done', parent_id: 'u1', status: 'completed', date: '2026-10-01', time: '10:00:00' },
      // Someone else's consult: untouched.
      { id: 'a_other', parent_id: 'u2', status: 'upcoming', date: '2030-01-07', time: '12:00:00' },
    ],
    payments: [
      { id: 'p_paid', appointment_id: 'a_paid', parent_id: 'u1', status: 'paid', razorpay_payment_id: 'pay_1', amount_paise: 44900 },
      { id: 'p_hold', appointment_id: 'a_hold', parent_id: 'u1', status: 'created', razorpay_link_id: 'plink_2', amount_paise: 44900 },
      { id: 'p_done', appointment_id: 'a_done', parent_id: 'u1', status: 'paid', razorpay_payment_id: 'pay_3', amount_paise: 44900 },
      { id: 'p_other', appointment_id: 'a_other', parent_id: 'u2', status: 'paid', razorpay_payment_id: 'pay_4', amount_paise: 44900 },
    ],
    notification_log: [{ id: 'n1', parent_id: 'u1', template: 'appointment_confirmation', status: 'sent' }],
    documents: [],
    health_notes: [],
    prescriptions: [],
  });
}

const refundCalls = (calls: Array<{ url: string; body: any }>) => calls.filter((c) => c.url.includes('/refund'));

Deno.test('delete-account: paid upcoming consult refunded in full even when late; hold cancelled; others untouched', async () => {
  const calls = stubRazorpay({ status: 200, body: { id: 'rfnd_1', status: 'pending' } });
  const f = account();
  const s = await settleConsultsBeforeDelete(f.client, 'u1');
  assertEquals(s, { cancelled: 2, refundsStarted: 1, refundsFailed: 0 });

  const refunds = refundCalls(calls);
  assertEquals(refunds.length, 1);
  assertEquals(refunds[0].url.endsWith('/payments/pay_1/refund'), true);
  assertEquals(refunds[0].body.amount, 44900);
  assertEquals(refunds[0].body.notes.reason, 'account_deleted');
  assertEquals(calls.some((c) => c.url.endsWith('/payment_links/plink_2/cancel')), true);

  const appt = (id: string) => f.tables.appointments.find((a) => a.id === id)!;
  assertEquals([appt('a_paid').status, appt('a_hold').status, appt('a_done').status, appt('a_other').status], [
    'cancelled', 'cancelled', 'completed', 'upcoming',
  ]);
  const pay = (id: string) => f.tables.payments.find((p) => p.id === id)!;
  assertEquals([pay('p_paid').status, pay('p_hold').status, pay('p_done').status, pay('p_other').status], [
    'refund_pending', 'cancelled', 'paid', 'paid',
  ]);

  // Then the existing deletion runs; payment records stay, unlinked.
  await deleteAccountData(f.client, 'u1');
  assertEquals(f.deletedUsers, ['u1']);
  assertEquals(pay('p_paid').parent_id, null);
  assertEquals(pay('p_paid').appointment_id, null);
  assertEquals(pay('p_other').parent_id, 'u2');
  assertEquals(f.tables.notification_log.filter((n) => n.id === 'n1').length, 0);
});

Deno.test('delete-account: a failed refund still deletes; the payment stays refund_failed and the team is alerted', async () => {
  stubRazorpay({ status: 500, body: {} });
  const f = account();
  const s = await settleConsultsBeforeDelete(f.client, 'u1');
  assertEquals(s, { cancelled: 2, refundsStarted: 0, refundsFailed: 1 });

  await deleteAccountData(f.client, 'u1');
  assertEquals(f.deletedUsers, ['u1']);
  const p = f.tables.payments.find((x) => x.id === 'p_paid')!;
  assertEquals(p.status, 'refund_failed');
  assertEquals(p.parent_id, null);
  // The alert row was written before the deletion (awaited), and survives it.
  const alerts = f.tables.notification_log.filter((n) => n.template === 'refund_alert');
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].payload.payment_id, 'p_paid');
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
  assertEquals(await settleConsultsBeforeDelete(f.client, 'u1'), { cancelled: 0, refundsStarted: 1, refundsFailed: 0 });
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
  assertEquals(await settleConsultsBeforeDelete(f.client, 'u1'), { cancelled: 1, refundsStarted: 1, refundsFailed: 0 });
  assertEquals(refundCalls(calls).length, 1);
  assertEquals(f.tables.appointments[0].status, 'cancelled');
});
