// deno test --allow-env supabase/functions/_shared/carePlan_test.ts
//
// Care Plan (0053): the subscription state machine the webhook and the
// status check share, recording paid months (3 consults each), the plan
// emails, cancel at period end, and ending a plan on account deletion.
// Fake Supabase client; fake Razorpay (fetch).
// deno-lint-ignore-file no-explicit-any
import { assertEquals } from 'jsr:@std/assert@1';
import {
  applySubscription,
  cancelPlan,
  endPlansForDeletedAccount,
  nextPlanState,
  type PlanEmail,
  type PlanRow,
  type RazorpaySubscription,
  subscribeAnswer,
  verifyCarePlanPlan,
} from './carePlan.ts';
import { fakeAdmin, stubRazorpay } from './testing/fakeAdmin.ts';

const T0 = 1_790_000_000; // an event time (unix s)
const MONTH = 30 * 86_400;

function row(over: Partial<PlanRow> = {}): PlanRow {
  return {
    id: 'cp1',
    parent_id: 'u1',
    razorpay_subscription_id: 'sub_1',
    status: 'created',
    current_start: null,
    current_end: null,
    cancel_at_period_end: false,
    ended_at: null,
    paid_count: 0,
    last_event_at: null,
    ...over,
  };
}

function sub(over: Partial<RazorpaySubscription> = {}): RazorpaySubscription {
  return { id: 'sub_1', status: 'active', current_start: T0, current_end: T0 + MONTH, paid_count: 1, ...over };
}

function setup(planOver: Partial<PlanRow> = {}) {
  const f = fakeAdmin({ care_plans: [row(planOver)], care_plan_periods: [], notification_log: [] });
  const sent: PlanEmail[] = [];
  const notify = (e: PlanEmail) => void sent.push(e);
  return { f, sent, notify };
}

// ── nextPlanState (pure) ────────────────────────────────────────────────────

Deno.test('state: created → authenticated → active, dates from Razorpay', () => {
  let r = row();
  let t = nextPlanState(r, { status: 'authenticated', at: T0 });
  assertEquals([t.patch?.status, t.statusChanged, t.stale], ['authenticated', true, false]);
  r = { ...r, ...t.patch } as PlanRow;
  t = nextPlanState(r, { status: 'active', at: T0 + 1, current_start: T0, current_end: T0 + MONTH, paid_count: 1 });
  assertEquals(t.patch?.status, 'active');
  assertEquals(t.patch?.current_end, new Date((T0 + MONTH) * 1000).toISOString());
  assertEquals(t.patch?.paid_count, 1);
});

Deno.test('state: an older event arriving late never overwrites a newer state', () => {
  const r = row({ status: 'pending', last_event_at: T0 + 100 });
  const t = nextPlanState(r, { status: 'active', at: T0 + 50 });
  assertEquals([t.patch, t.stale], [null, true]);
});

Deno.test('state: same second — the state further along wins (authenticated after active is ignored)', () => {
  const r = row({ status: 'active', last_event_at: T0 });
  assertEquals(nextPlanState(r, { status: 'authenticated', at: T0 }).stale, true);
  // …but pending in the same second as active is a real change.
  assertEquals(nextPlanState(r, { status: 'pending', at: T0 }).patch?.status, 'pending');
});

Deno.test('state: final states are final, and apply even if their event looks older', () => {
  const live = row({ status: 'active', last_event_at: T0 + 100 });
  const t = nextPlanState(live, { status: 'cancelled', at: T0, ended_at: T0 });
  assertEquals([t.patch?.status, t.statusChanged], ['cancelled', true]);
  const done = row({ status: 'cancelled', last_event_at: T0 });
  assertEquals(nextPlanState(done, { status: 'active', at: T0 + 999 }).patch, null);
  assertEquals(nextPlanState(done, { status: 'cancelled', at: T0 + 999 }).patch, null);
});

Deno.test('state: halted → active again (customer retried) is allowed', () => {
  const r = row({ status: 'halted', last_event_at: T0 });
  assertEquals(nextPlanState(r, { status: 'active', at: T0 + 10 }).patch?.status, 'active');
});

Deno.test('state: a repeat of the same state and dates changes nothing', () => {
  const r = row({
    status: 'active',
    last_event_at: T0,
    current_start: new Date(T0 * 1000).toISOString(),
    current_end: new Date((T0 + MONTH) * 1000).toISOString(),
    paid_count: 1,
  });
  const t = nextPlanState(r, { status: 'active', at: T0, current_start: T0, current_end: T0 + MONTH, paid_count: 1 });
  assertEquals(t.patch, null);
});

// ── applySubscription (webhook / status check) ──────────────────────────────

Deno.test('webhook: authenticated, activated, charged → one paid month, one "started" email', async () => {
  const { f, sent, notify } = setup();
  await applySubscription(f.client, sub({ status: 'authenticated', current_start: null, current_end: null, paid_count: 0 }), T0, { notify });
  await applySubscription(f.client, sub(), T0 + 1, { notify });
  // activated alone (no charge) on an active, charged subscription records the month too (webhook late)…
  assertEquals(f.tables.care_plan_periods.length, 1);
  const r = await applySubscription(f.client, sub(), T0 + 1, { notify, charge: { paymentId: 'pay_1', amount: 99900 } });
  assertEquals(r.periodCreated, false, '…so the charged event only fills in the payment id');
  assertEquals(f.tables.care_plan_periods.length, 1);
  assertEquals(f.tables.care_plan_periods[0].razorpay_payment_id, 'pay_1');
  assertEquals(f.tables.care_plan_periods[0].credits_total, 3);
  assertEquals(f.tables.care_plans[0].status, 'active');
  assertEquals(sent.map((e) => e.template), ['care_plan_started']);
  assertEquals(sent[0].payload, { plan_key: 'started:sub_1' });
});

Deno.test('webhook: the same charged event twice records one month and one email', async () => {
  const { f, sent, notify } = setup();
  const charge = { paymentId: 'pay_1', amount: 99900 };
  await applySubscription(f.client, sub(), T0, { notify, charge });
  await applySubscription(f.client, sub(), T0, { notify, charge });
  assertEquals(f.tables.care_plan_periods.length, 1);
  assertEquals(sent.length, 1);
});

Deno.test('webhook: a renewal adds the next month and a "renewed" email', async () => {
  const { f, sent, notify } = setup();
  await applySubscription(f.client, sub(), T0, { notify, charge: { paymentId: 'pay_1', amount: 99900 } });
  const next = sub({ current_start: T0 + MONTH, current_end: T0 + 2 * MONTH, paid_count: 2 });
  await applySubscription(f.client, next, T0 + MONTH, { notify, charge: { paymentId: 'pay_2', amount: 99900 } });
  assertEquals(f.tables.care_plan_periods.length, 2);
  assertEquals(sent.map((e) => e.template), ['care_plan_started', 'care_plan_renewed']);
  assertEquals(sent[1].payload, { plan_key: `renewed:sub_1:${T0 + MONTH}` });
  assertEquals(f.tables.care_plans[0].paid_count, 2);
});

Deno.test('webhook: renewal fails → pending (one email), retries fail → halted (one email), no new month', async () => {
  const { f, sent, notify } = setup({ status: 'active', last_event_at: T0 });
  const failed = sub({ status: 'pending', paid_count: 1 });
  await applySubscription(f.client, failed, T0 + MONTH, { notify });
  await applySubscription(f.client, failed, T0 + MONTH + 3600, { notify }); // Razorpay re-sends pending on each failed retry
  await applySubscription(f.client, sub({ status: 'halted', paid_count: 1 }), T0 + MONTH + 86_400, { notify });
  assertEquals(f.tables.care_plans[0].status, 'halted');
  assertEquals(f.tables.care_plan_periods.length, 0, 'a failed renewal gives no credits');
  assertEquals(sent.map((e) => [e.template, e.params.status]), [
    ['care_plan_payment_failed', 'pending'],
    ['care_plan_payment_failed', 'halted'],
  ]);
});

Deno.test('webhook: out of order — activated arriving after cancelled leaves it cancelled', async () => {
  const { f, sent, notify } = setup({ status: 'active', last_event_at: T0, cancel_at_period_end: true });
  await applySubscription(f.client, sub({ status: 'cancelled', ended_at: T0 + MONTH }), T0 + MONTH, { notify });
  await applySubscription(f.client, sub({ status: 'active' }), T0 + 5, { notify });
  assertEquals(f.tables.care_plans[0].status, 'cancelled');
  assertEquals(sent.map((e) => e.payload), [{ plan_key: 'cancelled:sub_1' }]);
});

Deno.test('webhook: a subscription that is not ours is reported unmatched', async () => {
  const { f, notify } = setup();
  const r = await applySubscription(f.client, sub({ id: 'sub_other' }), T0, { notify });
  assertEquals(r.matched, false);
  assertEquals(f.tables.care_plan_periods.length, 0);
});

Deno.test('webhook: found by notes.care_plan_id when saving the subscription id failed', async () => {
  const f = fakeAdmin({
    care_plans: [row({ id: '0b8f6f8e-0000-4000-8000-000000000001', razorpay_subscription_id: null })],
    care_plan_periods: [],
  });
  const r = await applySubscription(
    f.client,
    sub({ id: 'sub_9', notes: { care_plan_id: '0b8f6f8e-0000-4000-8000-000000000001' } }),
    T0,
    { notify: () => {} },
  );
  assertEquals(r.matched, true);
  assertEquals(f.tables.care_plans[0].razorpay_subscription_id, 'sub_9');
});

Deno.test('webhook: a deleted account (parent_id null) gets its state mirrored but no email', async () => {
  const { f, sent, notify } = setup({ parent_id: null });
  await applySubscription(f.client, sub({ status: 'cancelled' }), T0, { notify });
  assertEquals(f.tables.care_plans[0].status, 'cancelled');
  assertEquals(sent.length, 0);
});

// ── cancelPlan ──────────────────────────────────────────────────────────────

Deno.test('cancel: active plan → Razorpay cancel at cycle end, stays usable to the end, one email', async () => {
  const calls = stubRazorpay();
  const end = new Date((T0 + MONTH) * 1000).toISOString();
  const { f, sent, notify } = setup({ status: 'active', current_end: end, paid_count: 1 });
  const r = await cancelPlan(f.client, structuredClone(f.tables.care_plans[0]) as PlanRow, { notify });
  assertEquals(r, { state: 'ends', endsAt: end });
  assertEquals(calls.map((c) => [c.url.replace(/^.*\/v1/, ''), c.body]), [
    ['/subscriptions/sub_1/cancel', { cancel_at_cycle_end: true }],
  ]);
  assertEquals(f.tables.care_plans[0].status, 'active', 'still active until Razorpay ends it');
  assertEquals(f.tables.care_plans[0].cancel_at_period_end, true);
  assertEquals(sent.map((e) => [e.template, e.payload]), [['care_plan_cancelled', { plan_key: 'cancelled:sub_1' }]]);
  assertEquals(typeof sent[0].params.until, 'string');

  // Asking again: no second Razorpay call, no second email.
  const again = await cancelPlan(f.client, structuredClone(f.tables.care_plans[0]) as PlanRow, { notify });
  assertEquals(again.state, 'ends');
  assertEquals(calls.length, 1);
  assertEquals(sent.length, 1);

  // When the month ends Razorpay sends subscription.cancelled: same email key, so no second email.
  await applySubscription(f.client, sub({ status: 'cancelled' }), T0 + MONTH, { notify });
  assertEquals(f.tables.care_plans[0].status, 'cancelled');
  assertEquals(sent.length, 2);
  assertEquals(sent[1].payload, sent[0].payload, 'notification_log index (plan_key) keeps it to one');
});

Deno.test('cancel: never paid (created) or renewal failed (halted) → ends now', async () => {
  for (const status of ['created', 'halted'] as const) {
    const calls = stubRazorpay();
    const { f, sent, notify } = setup({ status, paid_count: status === 'halted' ? 1 : 0 });
    assertEquals(await cancelPlan(f.client, structuredClone(f.tables.care_plans[0]) as PlanRow, { notify }), { state: 'cancelled' });
    assertEquals(calls[0].body, { cancel_at_cycle_end: false });
    assertEquals(f.tables.care_plans[0].status, 'cancelled');
    assertEquals(sent.length, status === 'created' ? 0 : 1);
  }
});

Deno.test('cancel: Razorpay refuses → nothing changes here', async () => {
  globalThis.fetch = (() => Promise.resolve(new Response('{"error":{}}', { status: 400 }))) as typeof fetch;
  const { f, sent, notify } = setup({ status: 'active', paid_count: 1 });
  let threw = false;
  try {
    await cancelPlan(f.client, structuredClone(f.tables.care_plans[0]) as PlanRow, { notify });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(f.tables.care_plans[0].cancel_at_period_end, false);
  assertEquals(sent.length, 0);
});

Deno.test('account deletion: every live plan is ended now at Razorpay', async () => {
  const calls = stubRazorpay();
  const f = fakeAdmin({
    care_plans: [
      row({ id: 'a', status: 'active', razorpay_subscription_id: 'sub_a' }),
      row({ id: 'b', status: 'cancelled', razorpay_subscription_id: 'sub_b' }),
    ],
  });
  assertEquals(await endPlansForDeletedAccount(f.client, 'u1'), { ended: 1, alerted: 0 });
  assertEquals(calls.map((c) => [c.url.replace(/^.*\/v1/, ''), c.body.cancel_at_cycle_end]), [['/subscriptions/sub_a/cancel', false]]);
  assertEquals(f.tables.care_plans.map((p: any) => p.status), ['cancelled', 'cancelled']);
});

// ── Plan emails ─────────────────────────────────────────────────────────────

Deno.test('emails: generic subjects, no child details, the right line for each case', async () => {
  const { renderEmail, SERVER_ONLY_TEMPLATES } = await import('./templates.ts');
  const params = { until: 'Tuesday, 3 November', price: '₹999', child: 'Asha', doctor: 'Dr. Rao', parent: 'Priya' };
  const subjects: Record<string, string> = {
    care_plan_started: 'Your LilSteps Care Plan has started',
    care_plan_renewed: 'Your LilSteps Care Plan has renewed',
    care_plan_payment_failed: 'Your LilSteps Care Plan payment did not go through',
    care_plan_cancelled: 'Your LilSteps Care Plan was cancelled',
  };
  for (const [key, subject] of Object.entries(subjects)) {
    const e = renderEmail(key, params);
    assertEquals(e.subject, subject);
    assertEquals(/Asha|Rao/.test(e.text + e.html), false, `${key}: no child or doctor`);
    assertEquals(e.text.includes('{{'), false);
    assertEquals(SERVER_ONLY_TEMPLATES.includes(key), true, `${key}: the notify endpoint can't send it`);
  }
  assertEquals(renderEmail('care_plan_cancelled', { until: 'Tuesday, 3 November' }).text.includes('until Tuesday, 3 November'), true);
  assertEquals(renderEmail('care_plan_cancelled', { ended: 'yes' }).text.includes('has ended'), true);
  assertEquals(renderEmail('care_plan_payment_failed', { status: 'halted' }).text.includes('paused'), true);
  // A plan consult's confirmation and cancellation say what happens to the plan consult.
  const conf = renderEmail('appointment_confirmation', { child: 'Asha', doctor: 'Dr. Rao', date: '2026-11-03', time: '10:00', plan: 'yes' });
  assertEquals(conf.text.includes('using one of your Care Plan consults'), true);
  assertEquals(conf.text.includes('gives the consult back to your plan'), true);
  const back = renderEmail('appointment_cancelled', { child: 'Asha', doctor: 'Dr. Rao', refund: 'plan_returned' });
  assertEquals(back.text.includes('gone back to your Care Plan'), true);
  const used = renderEmail('appointment_cancelled', { refund: 'plan_used' });
  assertEquals(used.text.includes('counts as used'), true);
  // Review #1: a parent cancel after the plan month ended.
  const expired = renderEmail('appointment_cancelled', { refund: 'plan_expired' });
  assertEquals(expired.text.includes('could not go back to the plan'), true);
  assertEquals(expired.text.includes('free consult'), false, 'no free consult is promised to the parent');
});

Deno.test('account deletion: a subscription Razorpay already ended does not block the deletion', async () => {
  const calls: string[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${String(url).replace(/^.*\/v1/, '')}`);
    if (String(url).endsWith('/cancel')) return Promise.resolve(new Response('{"error":{}}', { status: 400 }));
    return Promise.resolve(new Response(JSON.stringify({ id: 'sub_a', status: 'cancelled' }), { status: 200 }));
  }) as typeof fetch;
  const f = fakeAdmin({ care_plans: [row({ id: 'a', status: 'active', razorpay_subscription_id: 'sub_a' })] });
  assertEquals(await endPlansForDeletedAccount(f.client, 'u1', { alert: () => Promise.resolve() }), { ended: 1, alerted: 0 });
  assertEquals(calls, ['POST /subscriptions/sub_a/cancel', 'GET /subscriptions/sub_a']);
  assertEquals(f.tables.care_plans[0].status, 'cancelled');
});


// ── Review fixes (PR #17) ───────────────────────────────────────────────────

/** A fake Razorpay answering per path; records every call. */
function razorpay(answers: Record<string, { status: number; body: unknown }>) {
  Deno.env.set('RAZORPAY_KEY_ID', 'rzp_test_x');
  Deno.env.set('RAZORPAY_KEY_SECRET', 'secret');
  const calls: Array<{ call: string; body: any }> = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const call = `${init?.method ?? 'GET'} ${String(url).replace(/^.*\/v1/, '')}`;
    calls.push({ call, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const a = answers[call] ?? { status: 200, body: {} };
    return Promise.resolve(new Response(JSON.stringify(a.body), { status: a.status }));
  }) as typeof fetch;
  return calls;
}

function alerts() {
  const sent: Array<{ subject: string; lines: string[] }> = [];
  return { sent, alert: (subject: string, lines: string[]) => (sent.push({ subject, lines }), Promise.resolve()) };
}

// #2 account deletion is never trapped

Deno.test('#2 deletion: a plan already set to end at the month\'s end → no Razorpay call (it refuses a second cancel)', async () => {
  const calls = razorpay({});
  const a = alerts();
  const f = fakeAdmin({ care_plans: [row({ status: 'active', paid_count: 1, cancel_at_period_end: true })] });
  assertEquals(await endPlansForDeletedAccount(f.client, 'u1', { alert: a.alert }), { ended: 1, alerted: 0 });
  assertEquals(calls.length, 0);
  assertEquals(a.sent.length, 0);
});

Deno.test('#2 deletion: subscription unknown to Razorpay (404, e.g. test id under live keys) counts as ended', async () => {
  razorpay({ 'POST /subscriptions/sub_1/cancel': { status: 404, body: { error: { description: 'The id provided does not exist' } } } });
  const a = alerts();
  const f = fakeAdmin({ care_plans: [row({ status: 'active', paid_count: 1 })] });
  assertEquals(await endPlansForDeletedAccount(f.client, 'u1', { alert: a.alert }), { ended: 1, alerted: 0 });
  assertEquals(f.tables.care_plans[0].status, 'cancelled');
  assertEquals(a.sent.length, 0);
});

Deno.test('#2 deletion: "does not exist" in a 400 body also counts as ended', async () => {
  razorpay({ 'POST /subscriptions/sub_1/cancel': { status: 400, body: { error: { description: 'Subscription does not exist' } } } });
  const f = fakeAdmin({ care_plans: [row({ status: 'active', paid_count: 1 })] });
  assertEquals(await endPlansForDeletedAccount(f.client, 'u1', { alert: alerts().alert }), { ended: 1, alerted: 0 });
});

Deno.test('#2 deletion: any other Razorpay failure → team alerted, deletion continues (no throw)', async () => {
  razorpay({
    'POST /subscriptions/sub_1/cancel': { status: 500, body: { error: {} } },
    'GET /subscriptions/sub_1': { status: 500, body: { error: {} } },
  });
  const a = alerts();
  const f = fakeAdmin({ care_plans: [row({ status: 'active', paid_count: 1 })] });
  assertEquals(await endPlansForDeletedAccount(f.client, 'u1', { alert: a.alert }), { ended: 0, alerted: 1 });
  assertEquals(a.sent[0].subject.includes('by hand'), true);
  assertEquals(a.sent[0].lines.some((l) => l.includes('sub_1')), true);
});

// #3 a subscription we ended that Razorpay later reports alive

Deno.test('#3 revived: our unpaid plan was cancelled, the parent paid the old link → alert + plan reopened, month recorded', async () => {
  razorpay({});
  const a = alerts();
  const { f, sent, notify } = setup({ status: 'cancelled', last_event_at: T0 });
  const r = await applySubscription(f.client, sub({ status: 'authenticated', paid_count: 0, current_start: null, current_end: null }), T0 + 60, { notify, alert: a.alert });
  assertEquals(r.revived, 'reopened');
  assertEquals(f.tables.care_plans[0].status, 'authenticated');
  assertEquals(f.tables.care_plans[0].ended_at, null);
  assertEquals(a.sent.length, 1);
  assertEquals(a.sent[0].subject.includes('reopened'), true);
  // ...and the charge that follows gives the month, as for any plan.
  await applySubscription(f.client, sub(), T0 + 61, { notify, alert: a.alert, charge: { paymentId: 'pay_9', amount: 99900 } });
  assertEquals(f.tables.care_plan_periods.length, 1);
  assertEquals(f.tables.care_plans[0].status, 'active');
  assertEquals(sent.map((e) => e.template), ['care_plan_started']);
  assertEquals(a.sent.length, 1, 'one alert');
});

Deno.test('#3 revived: parent already has another live plan → cancelled at Razorpay NOW + refund alert, no credits', async () => {
  const calls = razorpay({});
  const a = alerts();
  const f = fakeAdmin({
    care_plans: [
      row({ id: 'old', status: 'expired', last_event_at: T0 }),
      row({ id: 'new', status: 'active', razorpay_subscription_id: 'sub_new', paid_count: 1 }),
    ],
    care_plan_periods: [],
  });
  const r = await applySubscription(f.client, sub(), T0 + 60, { notify: () => {}, alert: a.alert, charge: { paymentId: 'pay_dup', amount: 99900 } });
  assertEquals(r.revived, 'cancelled');
  assertEquals(calls.map((c) => [c.call, c.body?.cancel_at_cycle_end]), [['POST /subscriptions/sub_1/cancel', false]]);
  assertEquals(f.tables.care_plan_periods.length, 0, 'no consults from a duplicate subscription');
  assertEquals(f.tables.care_plans.find((p: any) => p.id === 'old')?.status, 'expired');
  assertEquals(a.sent[0].subject.includes('refund'), true);
  assertEquals(a.sent[0].lines.some((l) => l.includes('pay_dup')), true);
});

Deno.test('#3 revived: a deleted account\'s plan charged again → cancelled at Razorpay + refund alert', async () => {
  const calls = razorpay({});
  const a = alerts();
  const { f } = setup({ status: 'cancelled', parent_id: null, last_event_at: T0 });
  const r = await applySubscription(f.client, sub(), T0 + 60, { notify: () => {}, alert: a.alert, charge: { paymentId: 'pay_x', amount: 99900 } });
  assertEquals(r.revived, 'cancelled');
  assertEquals(calls[0].call, 'POST /subscriptions/sub_1/cancel');
  assertEquals(a.sent.length, 1);
});

Deno.test('#3 not revived: an OLDER "active" event for a plan Razorpay already cancelled is just stale (no alert)', async () => {
  const calls = razorpay({});
  const a = alerts();
  const { f } = setup({ status: 'cancelled', last_event_at: T0 + 100 });
  const r = await applySubscription(f.client, sub(), T0 + 50, { notify: () => {}, alert: a.alert });
  assertEquals(r.revived, undefined);
  assertEquals(f.tables.care_plans[0].status, 'cancelled');
  assertEquals([calls.length, a.sent.length], [0, 0]);
});

// #4 authorised with no paid month

Deno.test('#4 cancel: authenticated with no paid month → cancelled NOW (cancel_at_cycle_end false), no email', async () => {
  const calls = razorpay({});
  const { f, sent, notify } = setup({ status: 'authenticated', paid_count: 0 });
  assertEquals(await cancelPlan(f.client, structuredClone(f.tables.care_plans[0]) as PlanRow, { notify }), { state: 'cancelled' });
  assertEquals(calls.map((c) => c.body), [{ cancel_at_cycle_end: false }]);
  assertEquals(f.tables.care_plans[0].status, 'cancelled');
  assertEquals(typeof f.tables.care_plans[0].last_event_at, 'number', 'stamped, so only newer Razorpay news can revive it');
  assertEquals(sent.length, 0);
});

Deno.test('#4 cancel: authenticated WITH a recorded paid month → at cycle end', async () => {
  const calls = razorpay({});
  const f = fakeAdmin({
    care_plans: [row({ status: 'authenticated', paid_count: 0 })],
    care_plan_periods: [{ id: 'm1', care_plan_id: 'cp1', period_start: 'x', period_end: 'y' }],
    notification_log: [],
  });
  const r = await cancelPlan(f.client, structuredClone(f.tables.care_plans[0]) as PlanRow, { notify: () => {} });
  assertEquals(r.state, 'ends');
  assertEquals(calls.map((c) => c.body), [{ cancel_at_cycle_end: true }]);
});

Deno.test('#4 subscribe: an authorised plan is "starting", never "active"; halted / paused are replaced', () => {
  assertEquals(subscribeAnswer(row({ status: 'authenticated' })), 'starting');
  assertEquals(subscribeAnswer(row({ status: 'active' })), 'active');
  assertEquals(subscribeAnswer(row({ status: 'pending' })), 'pending');
  assertEquals(subscribeAnswer(row({ status: 'halted' })), 'replace');
  assertEquals(subscribeAnswer(row({ status: 'paused' })), 'replace');
  assertEquals(subscribeAnswer(row({ status: 'created' })), 'reuse');
  assertEquals(subscribeAnswer(null), null);
});

// #5 the fetch path records a month only when Razorpay counts more paid months than we have

Deno.test('#5 fetch: active, paid_count not above recorded months → no new month (even with new dates)', async () => {
  const f = fakeAdmin({
    care_plans: [row({ status: 'active', paid_count: 1, last_event_at: T0 })],
    care_plan_periods: [{ id: 'm1', care_plan_id: 'cp1', period_start: new Date(T0 * 1000).toISOString(), period_end: 'z' }],
    notification_log: [],
  });
  // Razorpay moved to the next cycle but its charge isn't confirmed (paid_count still 1).
  const r = await applySubscription(f.client, sub({ current_start: T0 + MONTH, current_end: T0 + 2 * MONTH, paid_count: 1 }), T0 + MONTH + 5, { notify: () => {} });
  assertEquals(r.periodCreated, false);
  assertEquals(f.tables.care_plan_periods.length, 1);
  // paid_count 2 > 1 recorded → the month is recorded.
  const r2 = await applySubscription(f.client, sub({ current_start: T0 + MONTH, current_end: T0 + 2 * MONTH, paid_count: 2 }), T0 + MONTH + 6, { notify: () => {} });
  assertEquals(r2.periodCreated, true);
  assertEquals(f.tables.care_plan_periods.length, 2);
});

// #6 paused, wrong amount, plan check

Deno.test('#6 paused: active → paused is a real change; no credits are recorded from it', async () => {
  const { f } = setup({ status: 'active', last_event_at: T0, paid_count: 1 });
  f.tables.care_plan_periods.push({ id: 'm1', care_plan_id: 'cp1', period_start: 'a', period_end: 'b' });
  const r = await applySubscription(f.client, sub({ status: 'paused', paid_count: 1 }), T0 + 10, { notify: () => {} });
  assertEquals([r.status, r.statusChanged, r.periodCreated], ['paused', true, false]);
  assertEquals(nextPlanState(row({ status: 'paused', last_event_at: T0 }), { status: 'active', at: T0 + 1 }).patch?.status, 'active');
});

Deno.test('#6 wrong charge amount → no consults for the month + team alert', async () => {
  const a = alerts();
  const { f, sent, notify } = setup({ status: 'active', last_event_at: T0 });
  const r = await applySubscription(f.client, sub(), T0 + 1, { notify, alert: a.alert, charge: { paymentId: 'pay_odd', amount: 1000 } });
  assertEquals(r.periodCreated, false);
  assertEquals(f.tables.care_plan_periods.length, 0);
  assertEquals(sent.length, 0);
  assertEquals(a.sent[0].subject.includes('wrong amount'), true);
  assertEquals(a.sent[0].lines.some((l) => l.includes('pay_odd')), true);
});

Deno.test('#6 subscribe checks the Razorpay plan is ₹999 / monthly / INR (good answer cached)', async () => {
  const good = { id: 'plan_good', period: 'monthly', interval: 1, item: { amount: 99900, currency: 'INR' } };
  const calls = razorpay({
    'GET /plans/plan_good': { status: 200, body: good },
    'GET /plans/plan_cheap': { status: 200, body: { ...good, id: 'plan_cheap', item: { amount: 9900, currency: 'INR' } } },
    'GET /plans/plan_yearly': { status: 200, body: { ...good, id: 'plan_yearly', period: 'yearly' } },
  });
  assertEquals(await verifyCarePlanPlan('plan_cheap'), false);
  assertEquals(await verifyCarePlanPlan('plan_yearly'), false);
  assertEquals(await verifyCarePlanPlan('plan_good'), true);
  assertEquals(await verifyCarePlanPlan('plan_good'), true);
  assertEquals(calls.filter((c) => c.call === 'GET /plans/plan_good').length, 1, 'cached after a good answer');
});
