// deno test --allow-env supabase/functions/_shared/carePlanSync_test.ts
//
// Care Plan sync without subscription webhooks (0054, syncCarePlans /
// syncPlan): the 15-minute sweep fetches each subscription from Razorpay
// and applies it through applySubscription. Fake Supabase client; fake
// Razorpay (fetch) answering GET /v1/subscriptions/{id}.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { type PlanEmail, type PlanRow, type RazorpaySubscription, syncCarePlans, syncPlan } from './carePlan.ts';
import { RazorpayError } from './razorpay.ts';
import { fakeAdmin, type Row } from './testing/fakeAdmin.ts';

const DAY = 86_400;
const NOW = Math.floor(Date.now() / 1000);
const T0 = NOW - 40 * DAY; // first month started
const T1 = T0 + 30 * DAY; // renewal (10 days ago)
const iso = (u: number) => new Date(u * 1000).toISOString();

type Answer = RazorpaySubscription | { error: number; body?: string } | 'hang';

/** Fake Razorpay: subs[id] is what GET /subscriptions/{id} answers. */
function stubSubscriptions(subs: Record<string, Answer>) {
  Deno.env.set('RAZORPAY_KEY_ID', 'rzp_test_x');
  Deno.env.set('RAZORPAY_KEY_SECRET', 'secret');
  const calls: string[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const m = /\/subscriptions\/([^/?]+)$/.exec(String(url));
    if (!m || (init?.method ?? 'GET') !== 'GET') throw new Error(`unexpected Razorpay call ${init?.method} ${url}`);
    const id = decodeURIComponent(m[1]);
    calls.push(id);
    const a = subs[id];
    if (a === 'hang') {
      return new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)));
    }
    if (!a) return Promise.resolve(new Response('{"error":{"description":"The id provided does not exist"}}', { status: 400 }));
    if ('error' in a) return Promise.resolve(new Response(a.body ?? '{}', { status: a.error }));
    return Promise.resolve(new Response(JSON.stringify(a), { status: 200 }));
  }) as typeof fetch;
  return calls;
}

function plan(over: Partial<PlanRow> & { id: string } & Row): Row {
  return {
    parent_id: `parent_${over.id}`,
    razorpay_subscription_id: `sub_${over.id}`,
    status: 'active',
    current_start: iso(T0),
    current_end: iso(T1),
    cancel_at_period_end: false,
    ended_at: null,
    paid_count: 1,
    last_event_at: T0,
    last_synced_at: null,
    created_at: iso(T0 - DAY),
    ...over,
  };
}

const period = (planId: string, start: number) => ({
  id: `per_${planId}_${start}`,
  care_plan_id: planId,
  period_start: iso(start),
  period_end: iso(start + 30 * DAY),
});

function capture() {
  const emails: PlanEmail[] = [];
  const alerts: Array<{ subject: string; lines: string[] }> = [];
  return {
    emails,
    alerts,
    notify: (e: PlanEmail) => void emails.push(e),
    alert: (subject: string, lines: string[]) => {
      alerts.push({ subject, lines });
      return Promise.resolve();
    },
  };
}

Deno.test('sync: a renewal is recorded once across repeated runs (one month, one "renewed" email)', async () => {
  const f = fakeAdmin({ care_plans: [plan({ id: 'a' })], care_plan_periods: [period('a', T0)], notification_log: [] });
  const calls = stubSubscriptions({
    sub_a: { id: 'sub_a', status: 'active', current_start: T1, current_end: T1 + 30 * DAY, paid_count: 2 },
  });
  const c = capture();
  const first = await syncCarePlans(f.client, c);
  assertEquals([first.checked, first.periodsRecorded, first.errors.length], [1, 1, 0]);
  for (let i = 0; i < 3; i++) {
    const again = await syncCarePlans(f.client, c);
    assertEquals([again.checked, again.periodsRecorded, again.changed], [1, 0, 0]);
  }
  assertEquals(calls.length, 4);
  assertEquals(f.tables.care_plan_periods.map((p) => p.period_start).sort(), [iso(T0), iso(T1)]);
  assertEquals(c.emails.map((e) => e.template), ['care_plan_renewed']);
  assertEquals(c.emails[0].payload, { plan_key: `renewed:sub_a:${T1}` });
  const row = f.tables.care_plans[0];
  assertEquals([row.status, row.paid_count, row.current_start], ['active', 2, iso(T1)]);
});

Deno.test('sync: first payment — created → active with paid_count 1 records the first month ("started")', async () => {
  const f = fakeAdmin({
    care_plans: [plan({ id: 'n', status: 'created', current_start: null, current_end: null, paid_count: 0, last_event_at: null })],
    care_plan_periods: [],
    notification_log: [],
  });
  stubSubscriptions({ sub_n: { id: 'sub_n', status: 'active', current_start: T1, current_end: T1 + 30 * DAY, paid_count: 1 } });
  const c = capture();
  await syncCarePlans(f.client, c);
  await syncCarePlans(f.client, c);
  assertEquals(f.tables.care_plan_periods.length, 1);
  assertEquals(c.emails.map((e) => e.template), ['care_plan_started']);
});

Deno.test('sync: renewal fails → pending (one email), then halted (one email), no new month, repeats change nothing', async () => {
  const f = fakeAdmin({ care_plans: [plan({ id: 'h' })], care_plan_periods: [period('h', T0)], notification_log: [] });
  const subs: Record<string, Answer> = {
    sub_h: { id: 'sub_h', status: 'pending', current_start: T0, current_end: T1, paid_count: 1 },
  };
  stubSubscriptions(subs);
  const c = capture();
  await syncCarePlans(f.client, c);
  await syncCarePlans(f.client, c);
  assertEquals(f.tables.care_plans[0].status, 'pending');
  subs.sub_h = { id: 'sub_h', status: 'halted', current_start: T0, current_end: T1, paid_count: 1 };
  await syncCarePlans(f.client, c);
  await syncCarePlans(f.client, c);
  assertEquals(f.tables.care_plans[0].status, 'halted');
  assertEquals(f.tables.care_plan_periods.length, 1, 'a failed renewal never gives a new month');
  assertEquals(c.emails.map((e) => [e.template, e.params?.status]), [
    ['care_plan_payment_failed', 'pending'],
    ['care_plan_payment_failed', 'halted'],
  ]);
  // The parent updates the card: Razorpay charges and the plan is active again with the new month.
  subs.sub_h = { id: 'sub_h', status: 'active', current_start: T1, current_end: T1 + 30 * DAY, paid_count: 2 };
  const r = await syncCarePlans(f.client, c);
  assertEquals([f.tables.care_plans[0].status, r.periodsRecorded], ['active', 1]);
});

Deno.test('sync: a plan set to end at the month\'s end becomes cancelled when Razorpay ends it (one email)', async () => {
  const f = fakeAdmin({
    care_plans: [plan({ id: 'x', cancel_at_period_end: true })],
    care_plan_periods: [period('x', T0)],
    notification_log: [],
  });
  stubSubscriptions({ sub_x: { id: 'sub_x', status: 'cancelled', current_start: T0, current_end: T1, ended_at: T1, paid_count: 1 } });
  const c = capture();
  const r = await syncCarePlans(f.client, c);
  assertEquals(r.changed, 1);
  const row = f.tables.care_plans[0];
  assertEquals([row.status, row.ended_at], ['cancelled', iso(T1)]);
  assertEquals(c.emails.map((e) => e.payload), [{ plan_key: 'cancelled:sub_x' }]);
  // Ended 10 days ago (Razorpay's ended_at): out of the recently-ended window, not fetched again.
  const again = await syncCarePlans(f.client, c);
  assertEquals(again.checked, 0);
});

Deno.test('sync: one Razorpay error (500, timeout, unknown id) never stops the batch; every row is stamped', async () => {
  Deno.env.set('RAZORPAY_TIMEOUT_MS', '50');
  try {
    const f = fakeAdmin({
      care_plans: [
        plan({ id: 'e1', created_at: iso(T0 - 4 * DAY) }),
        plan({ id: 'e2', created_at: iso(T0 - 3 * DAY) }),
        plan({ id: 'e3', created_at: iso(T0 - 2 * DAY) }),
        plan({ id: 'ok', created_at: iso(T0 - DAY) }),
      ],
      care_plan_periods: [period('ok', T0)],
      notification_log: [],
    });
    stubSubscriptions({
      sub_e1: { error: 500 },
      sub_e2: 'hang',
      // sub_e3 unknown to Razorpay (e.g. a test-mode id under live keys)
      sub_ok: { id: 'sub_ok', status: 'active', current_start: T1, current_end: T1 + 30 * DAY, paid_count: 2 },
    });
    const c = capture();
    const r = await syncCarePlans(f.client, c);
    assertEquals(r.checked, 4);
    assertEquals(r.errors.map((e) => e.planId), ['e1', 'e2', 'e3']);
    assertEquals(r.errors[1].error, 'Razorpay timeout');
    assertEquals(r.periodsRecorded, 1);
    assertEquals(f.tables.care_plans.every((p) => typeof p.last_synced_at === 'string'), true);
    // Failed rows keep their state.
    assertEquals(f.tables.care_plans.filter((p) => p.id !== 'ok').map((p) => p.status), ['active', 'active', 'active']);
  } finally {
    Deno.env.delete('RAZORPAY_TIMEOUT_MS');
  }
});

Deno.test('sync: capped batch, longest-unchecked first (never-checked first), the rest next run', async () => {
  const f = fakeAdmin({
    care_plans: [
      plan({ id: 'recent', last_synced_at: iso(NOW - 60) }),
      plan({ id: 'old', last_synced_at: iso(NOW - 3600) }),
      plan({ id: 'never', last_synced_at: null }),
    ],
    care_plan_periods: [period('recent', T0), period('old', T0), period('never', T0)],
    notification_log: [],
  });
  const same = (id: string) => ({ id, status: 'active', current_start: T0, current_end: T1, paid_count: 1 });
  const calls = stubSubscriptions({ sub_recent: same('sub_recent'), sub_old: same('sub_old'), sub_never: same('sub_never') });
  await syncCarePlans(f.client, { ...capture(), limit: 2 });
  assertEquals(calls, ['sub_never', 'sub_old']);
  await syncCarePlans(f.client, { ...capture(), limit: 2 });
  assertEquals(calls.slice(2, 3), ['sub_recent']);
});

Deno.test('sync: which plans are asked about — live and recently ended ones with a subscription id only', async () => {
  const f = fakeAdmin({
    care_plans: [
      plan({ id: 'live' }),
      plan({ id: 'halted', status: 'halted' }),
      plan({ id: 'paused', status: 'paused' }),
      plan({ id: 'noid', status: 'created', razorpay_subscription_id: null }),
      plan({ id: 'oldend', status: 'cancelled', ended_at: iso(NOW - 10 * DAY) }),
      plan({ id: 'newend', status: 'expired', ended_at: iso(NOW - 3600) }),
      plan({ id: 'endnull', status: 'completed', ended_at: null }),
    ],
    care_plan_periods: [],
    notification_log: [],
  });
  const calls = stubSubscriptions({});
  await syncCarePlans(f.client, capture());
  assertEquals(calls.sort(), ['sub_halted', 'sub_live', 'sub_newend', 'sub_paused']);
});

Deno.test('sync: a plan we ended an hour ago (unpaid page) that Razorpay now shows paid → reopened + team alert', async () => {
  const endedAt = NOW - 3600;
  const f = fakeAdmin({
    care_plans: [
      plan({ id: 'rv', status: 'expired', paid_count: 0, current_start: null, current_end: null, ended_at: iso(endedAt), last_event_at: endedAt }),
    ],
    care_plan_periods: [],
    notification_log: [],
  });
  stubSubscriptions({ sub_rv: { id: 'sub_rv', status: 'active', current_start: NOW - 600, current_end: NOW + 30 * DAY, paid_count: 1 } });
  const c = capture();
  const r = await syncCarePlans(f.client, c);
  assertEquals(r.changed, 1);
  assertEquals(f.tables.care_plans[0].status, 'active');
  assertEquals(f.tables.care_plan_periods.length, 1);
  assertEquals(c.alerts.map((a) => a.subject), ['Care Plan: an ended subscription was paid, plan reopened']);
  // Next run: nothing new.
  await syncCarePlans(f.client, c);
  assertEquals([f.tables.care_plan_periods.length, c.alerts.length], [1, 1]);
});

Deno.test('sync: stops starting fetches after the time budget; the rest are counted as deferred', async () => {
  const f = fakeAdmin({
    care_plans: [plan({ id: 'b1' }), plan({ id: 'b2' }), plan({ id: 'b3' })],
    care_plan_periods: [],
    notification_log: [],
  });
  const same = (id: string) => ({ id, status: 'active', current_start: T0, current_end: T1, paid_count: 0 });
  const calls = stubSubscriptions({ sub_b1: same('sub_b1'), sub_b2: same('sub_b2'), sub_b3: same('sub_b3') });
  let clock = 0;
  const r = await syncCarePlans(f.client, { ...capture(), budgetMs: 1500, now: () => (clock += 1000) });
  assertEquals([r.checked, r.deferred, calls.length], [1, 2, 1]);
});

Deno.test('sync: Razorpay keys not set → skipped, no query, no calls', async () => {
  const f = fakeAdmin({ care_plans: [plan({ id: 'k' })] });
  const calls = stubSubscriptions({});
  Deno.env.delete('RAZORPAY_KEY_SECRET');
  const r = await syncCarePlans(f.client, capture());
  assertEquals([r.skipped, calls.length], ['razorpay_not_configured', 0]);
});

Deno.test('syncPlan (use_plan): the shorter timeout applies, and the row is stamped before the fetch', async () => {
  const f = fakeAdmin({ care_plans: [plan({ id: 'u' })], care_plan_periods: [], notification_log: [] });
  stubSubscriptions({ sub_u: 'hang' });
  const started = Date.now();
  await assertRejects(() => syncPlan(f.client, { id: 'u', razorpay_subscription_id: 'sub_u' }, { timeoutMs: 50 }), RazorpayError);
  assertEquals(Date.now() - started < 5000, true);
  assertEquals(typeof f.tables.care_plans[0].last_synced_at, 'string');
});
