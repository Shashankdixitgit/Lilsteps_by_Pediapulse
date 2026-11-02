// Edge Function: razorpay-return
//
// The callback_url of every consult Payment Link. Razorpay sends the browser
// here after the payment page with its signed result on the query string
// (razorpay_payment_id, razorpay_payment_link_id, …, razorpay_signature).
// We pass those on to the app's return URL (`to`), which closes the in-app
// browser; the app then asks consult-payment for the status, which verifies
// the signature and checks the link with Razorpay. Nothing is recorded here.
//
// Android hand-off (`handoff=1`, set by the Android app): after a UPI app
// switch, Chrome Custom Tabs can refuse a redirect to lilsteps:// that no tap
// started, and the parent is left on a blank page (mobile review should-fix
// 4). Edge Functions on *.supabase.co may not serve HTML, so when a web
// origin is configured (first of PAYMENT_RETURN_ORIGINS) we send the browser
// to the web app's /payment-return?app=… page instead, which tries the app
// link and shows a "Return to LilSteps" button (a tap is always allowed).
// With no web origin configured, the redirect goes straight to the app as
// before.
//
// Public: deploy with --no-verify-jwt (Razorpay's redirect carries no token).
// `to` must pass isAllowedReturnUrl, so this is not an open redirect.

import { returnLocation } from './location.ts';

function page(message: string, status: number): Response {
  // Plain text: *.supabase.co does not serve HTML from Edge Functions.
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

Deno.serve((req) => {
  if (req.method !== 'GET') return page('Not found.', 404);
  const location = returnLocation(req.url, Deno.env.get('PAYMENT_RETURN_ORIGINS'));
  if (!location) {
    return page('Payment received by Razorpay. Please go back to the LilSteps app.', 400);
  }
  return new Response(null, { status: 303, headers: { Location: location } });
});
