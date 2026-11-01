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
  const { f, sent, notify } = setup({ status: 'active', current_end: end });
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
    const { f, sent, notify } = setup({ status });
    assertEquals(await cancelPlan(f.client, structuredClone(f.tables.care_plans[0]) as PlanRow, { notify }), { state: 'cancelled' });
    assertEquals(calls[0].body, { cancel_at_cycle_end: false });
    assertEquals(f.tables.care_plans[0].status, 'cancelled');
    assertEquals(sent.length, status === 'created' ? 0 : 1);
  }
});

Deno.test('cancel: Razorpay refuses → nothing changes here', async () => {
  globalThis.fetch = (() => Promise.resolve(new Response('{"error":{}}', { status: 400 }))) as typeof fetch;
  const { f, sent, notify } = setup({ status: 'active' });
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
  assertEquals(await endPlansForDeletedAccount(f.client, 'u1'), 1);
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
});

Deno.test('account deletion: a subscription Razorpay already ended does not block the deletion', async () => {
  const calls: string[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${String(url).replace(/^.*\/v1/, '')}`);
    if (String(url).endsWith('/cancel')) return Promise.resolve(new Response('{"error":{}}', { status: 400 }));
    return Promise.resolve(new Response(JSON.stringify({ id: 'sub_a', status: 'cancelled' }), { status: 200 }));
  }) as typeof fetch;
  const f = fakeAdmin({ care_plans: [row({ id: 'a', status: 'active', razorpay_subscription_id: 'sub_a' })] });
  assertEquals(await endPlansForDeletedAccount(f.client, 'u1'), 1);
  assertEquals(calls, ['POST /subscriptions/sub_a/cancel', 'GET /subscriptions/sub_a']);
  assertEquals(f.tables.care_plans[0].status, 'cancelled');
});

Deno.test('account deletion: Razorpay down → throws (the account is not deleted while billing may go on)', async () => {
  globalThis.fetch = (() => Promise.resolve(new Response('oops', { status: 503 }))) as typeof fetch;
  const f = fakeAdmin({ care_plans: [row({ id: 'a', status: 'active', razorpay_subscription_id: 'sub_a' })] });
  let threw = false;
  try {
    await endPlansForDeletedAccount(f.client, 'u1');
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
  assertEquals(f.tables.care_plans[0].status, 'active');
});
