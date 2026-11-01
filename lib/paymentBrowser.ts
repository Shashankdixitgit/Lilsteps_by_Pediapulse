/**
 * Opens a Razorpay page (consult Payment Link or Care Plan subscription) in
 * the in-app browser on iOS and Android.
 *
 * iOS: an auth session (ASWebAuthenticationSession) is what closes the
 * browser by itself when Razorpay redirects to lilsteps://payment-return.
 * By default it shares Safari's cookies, and iOS then asks first:
 * "LilSteps wants to use rzp.io to Sign In" (mobile review must-fix 3).
 * An ephemeral session shares no cookies and shows no such alert, and the
 * redirect back to the app still works. A payment page needs no Safari
 * cookies, so nothing is lost.
 *
 * Android: there is no auth session; expo-web-browser opens a Custom Tab and
 * resolves when the redirect arrives or the parent closes the tab. Android
 * shows no prompt. preferEphemeralSession is ignored there.
 *
 * `isDone` (optional): while the page is open the app asks the server every
 * few seconds; once it says the payment went through, the page is closed for
 * the parent (iOS). Razorpay's subscription page has no redirect back, so
 * without this the parent had to tap "Cancel" after paying (must-fix 13).
 * Android cannot close a Custom Tab from the app: there the parent closes it
 * and the server's answer is already known.
 */
import * as WebBrowser from 'expo-web-browser';

/** Exported for tests: how often the server is asked while the page is open. */
export const paymentPagePoll = { everyMs: 3000, maxMs: 20 * 60 * 1000 };

export const PAYMENT_SESSION_OPTIONS = { preferEphemeralSession: true } as const;

export interface PaymentPageResult {
  /** The lilsteps://payment-return URL Razorpay sent back, when it did. */
  returnedUrl: string | null;
  /** True when the server said "paid" while the page was still open. */
  doneWhileOpen: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function openPaymentPage(
  url: string,
  returnUrl: string,
  isDone?: () => Promise<boolean>,
): Promise<PaymentPageResult> {
  let closed = false;
  let doneWhileOpen = false;
  const session = WebBrowser.openAuthSessionAsync(url, returnUrl, PAYMENT_SESSION_OPTIONS).finally(() => {
    closed = true;
  });

  if (isDone) {
    void (async () => {
      const started = Date.now();
      while (!closed && Date.now() - started < paymentPagePoll.maxMs) {
        await sleep(paymentPagePoll.everyMs);
        if (closed) return;
        let done = false;
        try {
          done = await isDone();
        } catch {
          // offline for a moment: ask again next time
        }
        if (done && !closed) {
          doneWhileOpen = true;
          try {
            WebBrowser.dismissAuthSession();
          } catch {
            // Android: a Custom Tab cannot be closed by the app.
          }
          return;
        }
      }
    })();
  }

  const result = await session;
  return { returnedUrl: result.type === 'success' ? (result as { url: string }).url : null, doneWhileOpen };
}
