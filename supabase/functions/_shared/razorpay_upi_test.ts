// deno test --allow-env supabase/functions/_shared/razorpay_upi_test.ts
//
// Early-tester feedback (8 Nov 2026): the consult payment page shows UPI
// first. If Razorpay ever refuses those display options, the link is still
// made, without them, so no parent is left unable to pay.
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { createPaymentLink, RazorpayError, UPI_FIRST_CHECKOUT } from './razorpay.ts';

const INPUT = {
  paymentId: 'pay_row_1',
  appointmentId: 'appt_1',
  expireBy: new Date(Date.now() + 16 * 60_000),
  description: 'Consult',
  callbackUrl: 'https://example.test/return',
};

/** Razorpay that answers each POST with the next status in `statuses`. */
function fakeRazorpay(statuses: number[]) {
  Deno.env.set('RAZORPAY_KEY_ID', 'rzp_test_x');
  Deno.env.set('RAZORPAY_KEY_SECRET', 'secret');
  const bodies: any[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const status = statuses[bodies.length - 1] ?? 200;
    const text = status === 200 ? JSON.stringify({ id: 'plink_1', short_url: 'https://rzp.io/x' }) : '{"error":{}}';
    return Promise.resolve(new Response(text, { status }));
  }) as typeof fetch;
  return bodies;
}

Deno.test('upi: the payment link asks Razorpay to show UPI first', async () => {
  const bodies = fakeRazorpay([200]);
  const link = await createPaymentLink(INPUT);
  assertEquals(link.short_url, 'https://rzp.io/x');
  assertEquals(bodies.length, 1);
  assertEquals(bodies[0].options, { checkout: { config: UPI_FIRST_CHECKOUT } });
});

Deno.test('upi: a 400 for the options retries once without them', async () => {
  const bodies = fakeRazorpay([400, 200]);
  const link = await createPaymentLink(INPUT);
  assertEquals(link.id, 'plink_1');
  assertEquals(bodies.length, 2);
  assertEquals(bodies[1].options, undefined);
  assertEquals(bodies[1].reference_id, 'pay_row_1');
});

Deno.test('upi: other errors are not retried', async () => {
  const bodies = fakeRazorpay([500]);
  await assertRejects(() => createPaymentLink(INPUT), RazorpayError);
  assertEquals(bodies.length, 1);
});
