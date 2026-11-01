// deno test --allow-env supabase/functions/_shared/razorpay_refund_test.ts
//
// Regressions from the PR #6 review:
//  - item 4: a refund Razorpay refuses must come back as a failure, not as
//    "refund started" (finalizePaidLink used to report 'refunded' regardless).
//  - item 5: a failed claim update must not be treated as "nothing to refund",
//    and money owed (refund_due / refund_failed) is re-driven on later calls.
// The Supabase client is a small fake; Razorpay is a stubbed fetch.
// deno-lint-ignore-file no-explicit-any
import { assertEquals } from 'jsr:@std/assert@1';
import { finalizePaidLink, refundPaymentRow, retryOwedRefunds } from './razorpay.ts';

Deno.env.set('RAZORPAY_KEY_ID', 'rzp_test_x');
Deno.env.set('RAZORPAY_KEY_SECRET', 'secret');

type Row = Record<string, any>;

/** Just enough of the query builder for razorpay.ts's refund paths. */
function fakeAdmin(rows: Row[], opts: { rpc?: string; claimError?: boolean } = {}) {
  const builder = (table: string) => {
    let filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    const api: any = {
      select: () => api,
      update: (p: Row) => ((patch = p), api),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), api),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), api),
      order: () => api,
      limit: () => api,
      maybeSingle: () => run(true),
      single: () => run(true),
      then: (res: any, rej: any) => run(false).then(res, rej),
    };
    const run = (one: boolean) => {
      if (table !== 'payments') return Promise.resolve({ data: one ? null : [], error: null });
      if (patch && opts.claimError && patch.status === 'refund_pending' && patch.refund_reason) {
        return Promise.resolve({ data: null, error: { message: 'connection reset' } });
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      filters = [];
      return Promise.resolve({ data: one ? (hit[0] ?? null) : hit, error: null });
    };
    return api;
  };
  return {
    from: builder,
    rpc: () => Promise.resolve({ data: opts.rpc ?? 'refund_needed', error: null }),
  } as any;
}

function stubRazorpayRefund(status: number, body: unknown) {
  const calls: string[] = [];
  globalThis.fetch = ((url: string) => {
    calls.push(String(url));
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as typeof fetch;
  return calls;
}

Deno.test('item 4: refused refund is reported as refund_failed, all the way up', async () => {
  const rows: Row[] = [{ id: 'p1', appointment_id: 'a1', status: 'refund_due', razorpay_payment_id: 'pay_1', amount_paise: 44900 }];
  stubRazorpayRefund(400, { error: { description: 'invalid request sent' } });
  const outcome = await finalizePaidLink(fakeAdmin(rows), 'p1', 'pay_1', 44900);
  assertEquals(outcome, 'refund_failed');
  assertEquals(rows[0].status, 'refund_failed');
});

Deno.test('item 4: accepted refund is refund_started; processed refund marks refunded', async () => {
  const rows: Row[] = [{ id: 'p1', appointment_id: 'a1', status: 'refund_due', razorpay_payment_id: 'pay_1', amount_paise: 44900 }];
  stubRazorpayRefund(200, { id: 'rfnd_1', status: 'processed' });
  assertEquals(await finalizePaidLink(fakeAdmin(rows), 'p1', 'pay_1', 44900), 'refund_started');
  assertEquals(rows[0].status, 'refunded');
  assertEquals(rows[0].refund_id, 'rfnd_1');
});

Deno.test('item 5: a failed claim update is a failure, and Razorpay is not called', async () => {
  const rows = [{ id: 'p1', appointment_id: 'a1', status: 'paid', razorpay_payment_id: 'pay_1', amount_paise: 44900 }];
  const calls = stubRazorpayRefund(200, { id: 'rfnd_1', status: 'processed' });
  assertEquals(await refundPaymentRow(fakeAdmin(rows, { claimError: true }), 'p1', 'x'), 'refund_failed');
  assertEquals(calls.length, 0);
});

Deno.test('item 5: owed refunds are retried; a claimed (pending) one is not refunded twice', async () => {
  const rows = [
    { id: 'p1', appointment_id: 'a1', status: 'refund_failed', razorpay_payment_id: 'pay_1', amount_paise: 44900 },
    { id: 'p2', appointment_id: 'a1', status: 'refund_pending', razorpay_payment_id: 'pay_2', amount_paise: 44900 },
  ];
  const calls = stubRazorpayRefund(200, { id: 'rfnd_9', status: 'processed' });
  assertEquals(await retryOwedRefunds(fakeAdmin(rows), 'a1'), 'refunded');
  assertEquals(calls.length, 1);
  assertEquals(calls[0].includes('/payments/pay_1/refund'), true);
  assertEquals(rows[1].status, 'refund_pending');
});
