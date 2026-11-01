// Pure logic of razorpay-return (tested in tests/deno/razorpayReturn_test.ts).
import { isAllowedReturnUrl } from './allow.ts';

export const PASS_ON = [
  'razorpay_payment_id',
  'razorpay_payment_link_id',
  'razorpay_payment_link_reference_id',
  'razorpay_payment_link_status',
  'razorpay_signature',
];

/** The web app's origin for the Android hand-off page, if configured. */
export function handoffOrigin(origins: string | undefined): string | null {
  return (
    (origins ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .find((o) => o.startsWith('https://')) ?? null
  );
}

/** Where to send the browser: the target with Razorpay's query on it, maybe via the hand-off page. */
export function returnLocation(reqUrl: string, origins: string | undefined): string | null {
  const url = new URL(reqUrl);
  const to = url.searchParams.get('to') ?? '';
  if (!isAllowedReturnUrl(to)) return null;
  const target = new URL(to);
  for (const key of PASS_ON) {
    const v = url.searchParams.get(key);
    if (v !== null) target.searchParams.set(key, v.slice(0, 200));
  }
  const origin = url.searchParams.get('handoff') === '1' && target.protocol === 'lilsteps:' ? handoffOrigin(origins) : null;
  if (!origin) return target.toString();
  return `${origin}/payment-return?app=${encodeURIComponent(target.toString())}`;
}
