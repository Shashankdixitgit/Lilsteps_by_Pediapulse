// deno test --allow-env supabase/functions/_shared/refundAlerts_test.ts
//
// Refund-failure alerts (item 13): once per payment, payment facts only,
// the sweep finds stuck refunds, failed sends are retried a few times.
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import type { EmailMessage, EmailResult } from './email.ts';
import { alertRecipient, alertRefundProblem, renderRefundAlert, sweepRefundAlerts } from './refundAlerts.ts';
import { refundPaymentRow } from './razorpay.ts';
import { fakeAdmin, stubRazorpay } from './testing/fakeAdmin.ts';

const OLD = new Date(Date.now() - 60 * 60_000).toISOString();
const NEW = new Date(Date.now() - 5 * 60_000).toISOString();

function payment(over: any = {}) {
  return {
    id: 'p1', appointment_id: 'a1', parent_id: 'u1', status: 'refund_failed', amount_paise: 44900, currency: 'INR',
    razorpay_payment_id: 'pay_1', razorpay_link_id: 'plink_1', refund_id: null, refund_reason: 'parent_cancelled',
    paid_at: OLD, updated_at: OLD, ...over,
  };
}

function world(payments: any[]) {
  return fakeAdmin({
    payments,
    // The appointment row has a child; the alert must not carry anything of it.
    appointments: [{ id: 'a1', date: '2026-11-03', time: '17:30:00', child_id: 'c1', concern: 'fever and rash' }],
    children: [{ id: 'c1', name: 'Myra' }],
    notification_log: [],
  });
}

function mailbox(result: EmailResult = { ok: true }) {
  const sent: EmailMessage[] = [];
  const send = (m: EmailMessage) => {
    sent.push(m);
    return Promise.resolve(result);
  };
  return { sent, send };
}

Deno.test('alert: emailed once per payment, however often it is called', async () => {
  const f = world([payment()]);
  const box = mailbox();
  assertEquals(await alertRefundProblem(f.client, 'p1', 'refund_failed', { send: box.send }), 'sent');
  assertEquals(await alertRefundProblem(f.client, 'p1', 'refund_failed', { send: box.send }), 'already');
  assertEquals(await sweepRefundAlerts(f.client, { send: box.send }), []);
  assertEquals(box.sent.length, 1);
  assertEquals(box.sent[0].to, 'dev@lilstepsclinics.com');
  const log = f.tables.notification_log;
  assertEquals(log.length, 1);
  assertEquals(log[0].status, 'sent');
  assertEquals(log[0].parent_id, undefined);
  assertEquals(log[0].payload, { template: 'refund_alert', payment_id: 'p1', kind: 'refund_failed' });
});

Deno.test('alert: two senders racing still send one email (0052 unique index)', async () => {
  const f = world([payment()]);
  const box = mailbox();
  const both = await Promise.all([
    alertRefundProblem(f.client, 'p1', 'refund_failed', { send: box.send }),
    alertRefundProblem(f.client, 'p1', 'refund_failed', { send: box.send }),
  ]);
  assertEquals(both.sort(), ['already', 'sent']);
  assertEquals(box.sent.length, 1);
});

Deno.test('alert: payment facts only — ids, amount, reason, consult time; no child or health details', async () => {
  const f = world([payment({ refund_id: 'rfnd_9' })]);
  const box = mailbox();
  await alertRefundProblem(f.client, 'p1', 'refund_failed', { send: box.send, note: 'Razorpay 400' });
  const m = box.sent[0];
  for (const want of ['p1', '₹449.00', '44900 paise', 'parent_cancelled', 'pay_1', 'plink_1', 'rfnd_9', '2026-11-03 17:30', 'Razorpay 400']) {
    assertStringIncludes(m.text, want);
  }
  for (const banned of ['Myra', 'fever', 'rash', 'c1', 'u1']) {
    assert(!m.text.includes(banned) && !m.html.includes(banned) && !m.subject.includes(banned), `leaked ${banned}`);
  }
  assert(!/[\r\n]/.test(m.subject));
});

Deno.test('alert: a deleted account and booking still alert, saying so', () => {
  const m = renderRefundAlert(payment({ parent_id: null, appointment_id: null }) as any, null, 'refund_failed');
  assertStringIncludes(m.text, 'booking no longer exists');
  assertStringIncludes(m.text, 'deleted (nobody will retry this from the app)');
});

Deno.test('alert: a refund that went through since is not alerted', async () => {
  const f = world([payment({ status: 'refunded' })]);
  const box = mailbox();
  assertEquals(await alertRefundProblem(f.client, 'p1', 'refund_failed', { send: box.send }), 'resolved');
  assertEquals(box.sent.length, 0);
});

Deno.test('alert: a failed send is retried by the sweep, and given up after 3 tries', async () => {
  const f = world([payment()]);
  const down = mailbox({ ok: false, error: 'SMTP: 421' });
  assertEquals(await alertRefundProblem(f.client, 'p1', 'refund_failed', { send: down.send }), 'failed');
  assertEquals((await sweepRefundAlerts(f.client, { send: down.send }))[0].outcome, 'failed');
  assertEquals((await sweepRefundAlerts(f.client, { send: down.send }))[0].outcome, 'failed');
  assertEquals(down.sent.length, 3);
  // Out of tries: the sweep stops; a direct call says so too.
  assertEquals(await sweepRefundAlerts(f.client, { send: down.send }), []);
  assertEquals(await alertRefundProblem(f.client, 'p1', 'refund_failed', { send: down.send }), 'gave_up');
  assertEquals(down.sent.length, 3);
});

Deno.test('alert: an earlier failure then a working mail server sends exactly once', async () => {
  const f = world([payment()]);
  await alertRefundProblem(f.client, 'p1', 'refund_failed', { send: mailbox({ ok: false, error: 'x' }).send });
  const box = mailbox();
  assertEquals((await sweepRefundAlerts(f.client, { send: box.send }))[0].outcome, 'sent');
  assertEquals(await sweepRefundAlerts(f.client, { send: box.send }), []);
  assertEquals(box.sent.length, 1);
});

Deno.test('sweep: refund_failed, refund_due > 30 min, unanswered refund_pending > 30 min; nothing else', async () => {
  const f = world([
    payment({ id: 'failed' }),
    payment({ id: 'due_old', status: 'refund_due' }),
    payment({ id: 'due_new', status: 'refund_due', updated_at: NEW }),
    payment({ id: 'pending_lost', status: 'refund_pending' }),
    payment({ id: 'pending_ok', status: 'refund_pending', refund_id: 'rfnd_2' }),
    payment({ id: 'pending_new', status: 'refund_pending', updated_at: NEW }),
    payment({ id: 'refunded', status: 'refunded' }),
    payment({ id: 'paid', status: 'paid' }),
  ]);
  const box = mailbox();
  const r = await sweepRefundAlerts(f.client, { send: box.send });
  assertEquals(r.map((x) => `${x.paymentId}:${x.kind}:${x.outcome}`).sort(), [
    'due_old:refund_stuck:sent',
    'failed:refund_failed:sent',
    'pending_lost:refund_stuck:sent',
  ]);
});

Deno.test('sweep: at most maxEmails per run; the rest go next run', async () => {
  const f = world(Array.from({ length: 7 }, (_, i) => payment({ id: `p${i}` })));
  const box = mailbox();
  assertEquals((await sweepRefundAlerts(f.client, { send: box.send })).length, 5);
  assertEquals((await sweepRefundAlerts(f.client, { send: box.send })).length, 2);
  assertEquals(box.sent.length, 7);
});

Deno.test('refundPaymentRow: a Razorpay refusal leaves refund_failed and raises the alert', async () => {
  stubRazorpay({ status: 502, body: {} });
  const f = world([payment({ status: 'paid' })]);
  assertEquals(await refundPaymentRow(f.client, 'p1', 'parent_cancelled', { awaitAlert: true }), 'refund_failed');
  assertEquals(f.tables.payments[0].status, 'refund_failed');
  const alerts = f.tables.notification_log.filter((n) => n.template === 'refund_alert');
  assertEquals(alerts.length, 1);
  // No SMTP settings in tests: the attempt is recorded as skipped and the
  // sweep will try again.
  assertEquals(alerts[0].status, 'skipped');
});

Deno.test('alertRecipient: ALERT_EMAIL overrides, blank falls back', () => {
  assertEquals(alertRecipient(() => undefined), 'dev@lilstepsclinics.com');
  assertEquals(alertRecipient(() => '  '), 'dev@lilstepsclinics.com');
  assertEquals(alertRecipient(() => 'ops@lilstepsclinics.com'), 'ops@lilstepsclinics.com');
});
