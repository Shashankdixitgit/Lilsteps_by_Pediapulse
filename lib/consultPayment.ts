/**
 * Client side of pay-per-consult (the `consult-payment` Edge Function).
 *
 * The price shown here is display text only: the server sets the amount
 * (CONSULT_PRICE_PAISE in supabase/functions/_shared/razorpay.ts) and the
 * app never sends one.
 *
 * Flow: book_slot holds the slot ('awaiting_payment') → startConsultPayment
 * returns a Razorpay Payment Link → we open it in an auth session that closes
 * when Razorpay redirects back to RETURN_PATH → checkConsultPayment asks the
 * server, which checks with Razorpay (the webhook may already have done it).
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

export const CONSULT_PRICE_LABEL = '₹449';

/** app/payment-return.tsx — where Razorpay sends the browser back. */
export const RETURN_PATH = 'payment-return';

export type PaymentState = 'paid' | 'pending' | 'expired' | 'cancelled';

export type RefundOutcome = 'started' | 'none' | 'not_paid';

export interface PaymentStatus {
  state: PaymentState;
  /** Paid after the slot was gone: the money is on its way back. */
  refunded?: boolean;
  /** state 'pending': until when the slot stays held. */
  holdExpiresAt?: string;
}

/** The query keys Razorpay signs on the return URL; passed on to the server. */
const CALLBACK_KEYS = [
  'razorpay_payment_id',
  'razorpay_payment_link_id',
  'razorpay_payment_link_reference_id',
  'razorpay_payment_link_status',
  'razorpay_signature',
] as const;

async function errorText(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // not JSON
    }
  }
  return fallback;
}

async function call<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('consult-payment', { body });
  if (error || !data) throw new Error(await errorText(error, fallback));
  return data;
}

function callbackFrom(url: string | null): Record<string, string> | undefined {
  if (!url) return undefined;
  const { queryParams } = Linking.parse(url);
  const out: Record<string, string> = {};
  for (const k of CALLBACK_KEYS) {
    const v = queryParams?.[k];
    if (typeof v !== 'string') return undefined;
    out[k] = v;
  }
  return out;
}

export async function checkConsultPayment(
  appointmentId: string,
  returnedUrl: string | null = null,
): Promise<PaymentStatus> {
  return call(
    { action: 'status', appointmentId, callback: callbackFrom(returnedUrl) },
    "Couldn't check the payment. Please check your connection.",
  );
}

/**
 * Open the payment page and wait for the family to come back. Resolves with
 * the server's view of the payment (never with what the browser said).
 */
export async function payForConsult(appointmentId: string): Promise<PaymentStatus> {
  const returnUrl = Linking.createURL(RETURN_PATH);
  const started = await call<{ url?: string; state?: PaymentState }>(
    { action: 'start', appointmentId, returnUrl },
    "Couldn't open the payment page. Please check your connection and try again.",
  );
  if (started.state) return { state: started.state };
  if (!started.url) throw new Error("Couldn't open the payment page. Please try again.");

  const result = await WebBrowser.openAuthSessionAsync(started.url, returnUrl);
  const returnedUrl = result.type === 'success' ? result.url : null;

  // The webhook can land a moment after the browser closes: ask a few times.
  let last = await checkConsultPayment(appointmentId, returnedUrl);
  for (let i = 0; i < 3 && last.state === 'pending' && returnedUrl; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    last = await checkConsultPayment(appointmentId, returnedUrl);
  }
  return last;
}

/** Cancel a consult (or drop an unpaid hold). The server decides any refund. */
export async function cancelConsult(appointmentId: string): Promise<{ refund: RefundOutcome; late?: boolean }> {
  return call({ action: 'cancel', appointmentId }, "Couldn't cancel. Please check your connection and try again.");
}
