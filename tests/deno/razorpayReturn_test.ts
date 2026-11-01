// razorpay-return: where Razorpay's redirect sends the browser (should-fix 4).
//   deno test --no-check --allow-env --import-map=tests/deno/import_map.json tests/deno/
import { assertEquals } from 'jsr:@std/assert@1';
import { returnLocation } from '../../supabase/functions/razorpay-return/location.ts';

const FN = 'https://x.supabase.co/functions/v1/razorpay-return';
const q = '&razorpay_payment_id=pay_1&razorpay_signature=sig';
const APP = encodeURIComponent('lilsteps://payment-return');

Deno.test('app return: straight to lilsteps:// with the signed query (iOS, or no web origin)', () => {
  assertEquals(
    returnLocation(`${FN}?to=${APP}${q}`, 'https://app.example.test'),
    'lilsteps://payment-return?razorpay_payment_id=pay_1&razorpay_signature=sig',
  );
  assertEquals(
    returnLocation(`${FN}?to=${APP}&handoff=1${q}`, ''),
    'lilsteps://payment-return?razorpay_payment_id=pay_1&razorpay_signature=sig',
    'no web origin: as before',
  );
});

Deno.test('Android hand-off: via the web page with a "Return to LilSteps" button', () => {
  const loc = returnLocation(`${FN}?to=${APP}&handoff=1${q}`, 'https://app.example.test/, https://other.test');
  assertEquals(
    loc,
    'https://app.example.test/payment-return?app=' +
      encodeURIComponent('lilsteps://payment-return?razorpay_payment_id=pay_1&razorpay_signature=sig'),
  );
});

Deno.test('never an open redirect', () => {
  assertEquals(returnLocation(`${FN}?to=${encodeURIComponent('https://evil.test/x')}${q}`, 'https://app.example.test'), null);
  assertEquals(returnLocation(`${FN}${q}`, 'https://app.example.test'), null);
});
