// Edge Function: razorpay-return
//
// The callback_url of every consult Payment Link. Razorpay sends the browser
// here after the payment page with its signed result on the query string
// (razorpay_payment_id, razorpay_payment_link_id, …, razorpay_signature).
// We pass those on to the app's return URL (`to`), which closes the in-app
// browser; the app then asks consult-payment for the status, which verifies
// the signature and checks the link with Razorpay. Nothing is recorded here.
//
// Public: deploy with --no-verify-jwt (Razorpay's redirect carries no token).
// `to` must pass isAllowedReturnUrl, so this is not an open redirect.

import { isAllowedReturnUrl } from './allow.ts';

const PASS_ON = [
  'razorpay_payment_id',
  'razorpay_payment_link_id',
  'razorpay_payment_link_reference_id',
  'razorpay_payment_link_status',
  'razorpay_signature',
];

function page(message: string, status: number): Response {
  const html =
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    `<title>LilSteps</title><p style="font:16px system-ui;margin:40px 20px">${message}</p>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve((req) => {
  if (req.method !== 'GET') return page('Not found.', 404);
  const url = new URL(req.url);
  const to = url.searchParams.get('to') ?? '';
  if (!isAllowedReturnUrl(to)) {
    return page('Payment received by Razorpay. Please go back to the LilSteps app.', 400);
  }

  const target = new URL(to);
  for (const key of PASS_ON) {
    const v = url.searchParams.get(key);
    if (v !== null) target.searchParams.set(key, v.slice(0, 200));
  }
  return new Response(null, { status: 303, headers: { Location: target.toString() } });
});
