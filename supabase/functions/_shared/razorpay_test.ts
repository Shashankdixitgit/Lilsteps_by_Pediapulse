// deno test supabase/functions/_shared/razorpay_test.ts
// Expected hex digests were made independently with
//   printf '%s' '<message>' | openssl dgst -sha256 -hmac '<secret>'
import { assertEquals } from 'jsr:@std/assert@1';
import { verifyLinkCallbackSignature, verifyWebhookSignature } from './razorpay.ts';
import { isAllowedReturnUrl } from '../razorpay-return/allow.ts';

const BODY = '{"event":"payment_link.paid"}';
const BODY_SIG = '881f5d46466306406ea6299bdb81d8b02d3cd63e1695b07406cf527bf5189685';

Deno.test('webhook signature: accepts the right one, rejects the rest', async () => {
  assertEquals(await verifyWebhookSignature(BODY, BODY_SIG, 'whsec_test'), true);
  assertEquals(await verifyWebhookSignature(BODY, BODY_SIG.toUpperCase(), 'whsec_test'), true);
  assertEquals(await verifyWebhookSignature(BODY + ' ', BODY_SIG, 'whsec_test'), false);
  assertEquals(await verifyWebhookSignature(BODY, BODY_SIG, 'other_secret'), false);
  assertEquals(await verifyWebhookSignature(BODY, null, 'whsec_test'), false);
  assertEquals(await verifyWebhookSignature(BODY, BODY_SIG, ''), false);
});

const CALLBACK = {
  razorpay_payment_id: 'pay_XYZ',
  razorpay_payment_link_id: 'plink_ABC',
  razorpay_payment_link_reference_id: 'ref-1',
  razorpay_payment_link_status: 'paid',
  razorpay_signature: 'a45d01247b210600ebecaa5d80e4c22270a8fed8afed43c9d6d9afb25ff6928d',
};

Deno.test('payment link callback signature', async () => {
  assertEquals(await verifyLinkCallbackSignature(CALLBACK, 'keysecret'), true);
  assertEquals(await verifyLinkCallbackSignature({ ...CALLBACK, razorpay_payment_id: 'pay_OTHER' }, 'keysecret'), false);
  assertEquals(await verifyLinkCallbackSignature({ ...CALLBACK, razorpay_payment_link_status: 'created' }, 'keysecret'), false);
  assertEquals(await verifyLinkCallbackSignature(CALLBACK, 'wrong'), false);
  assertEquals(await verifyLinkCallbackSignature(CALLBACK, ''), false);
});

Deno.test('return URL allowlist', () => {
  Deno.env.delete('PAYMENT_RETURN_ALLOW_DEV');
  Deno.env.set('PAYMENT_RETURN_ORIGINS', 'https://lilstepsclinics.com, https://app.example.org/');
  assertEquals(isAllowedReturnUrl('lilsteps://payment-return'), true);
  assertEquals(isAllowedReturnUrl('https://lilstepsclinics.com/payment-return'), true);
  assertEquals(isAllowedReturnUrl('https://app.example.org/payment-return'), true);
  assertEquals(isAllowedReturnUrl('https://evil.example.com/payment-return'), false);
  assertEquals(isAllowedReturnUrl('https://lilstepsclinics.com.evil.com/x'), false);
  assertEquals(isAllowedReturnUrl('http://lilstepsclinics.com/payment-return'), false);
  assertEquals(isAllowedReturnUrl('javascript:alert(1)'), false);
  assertEquals(isAllowedReturnUrl('exp://192.168.1.2:8081/--/payment-return'), false);
  assertEquals(isAllowedReturnUrl('http://localhost:8081/payment-return'), false);
  Deno.env.set('PAYMENT_RETURN_ALLOW_DEV', 'true');
  assertEquals(isAllowedReturnUrl('exp://192.168.1.2:8081/--/payment-return'), true);
  assertEquals(isAllowedReturnUrl('http://localhost:8081/payment-return'), true);
});
