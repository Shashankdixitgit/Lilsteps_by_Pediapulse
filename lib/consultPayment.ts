/**
 * Client side of pay-per-consult (the `consult-payment` Edge Function).
 *
 * The price shown here is display text only: the server sets the amount
 * (CONSULT_PRICE_PAISE in supabase/functions/_shared/razorpay.ts) and the
 * app never sends one.
 *
 * Flow: hold_slot holds the slot ('awaiting_payment') → startConsultPayment
 * returns a Razorpay Payment Link →
 *  - native: we open it in an auth session that closes when Razorpay
 *    redirects back to RETURN_PATH, then ask the server for the status;
 *  - web: a popup opened after two network calls is blocked, so the whole
 *    page goes to Razorpay and app/payment-return.tsx picks up from the
 *    booking saved in sessionStorage (PENDING_KEY).
 * The server checks with Razorpay (the webhook may already have done it),
 * and also sends the confirmation SMS and makes the Meet link.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { SUPPORT_EMAIL } from '@/lib/support';

export const CONSULT_PRICE_LABEL = '₹449';

/** app/payment-return.tsx — where Razorpay sends the browser back. */
export const RETURN_PATH = 'payment-return';

/** Web only: the booking being paid for while the page is away at Razorpay. */
const PENDING_KEY = 'lilsteps.pendingConsultPayment';

export type PaymentState = 'paid' | 'pending' | 'expired' | 'cancelled';

export type RefundOutcome = 'started' | 'failed' | 'none' | 'not_paid';

export interface PaymentStatus {
  state: PaymentState | 'redirecting';
  /** Paid after the slot was gone: the money is on its way back. */
  refunded?: boolean;
  /** Paid after the slot was gone, and the refund could not be started. */
  refundFailed?: boolean;
  /** state 'pending': until when the slot stays held. */
  holdExpiresAt?: string;
}

/** Wording for a refund that could not be started (Razorpay said no). */
export const REFUND_FAILED_TEXT =
  `We couldn't start your refund automatically. Our team will process it, or contact ${SUPPORT_EMAIL}.`;

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

// ── Web: remember the booking across the full-page trip to Razorpay ────────

export interface PendingWebPayment {
  appointmentId: string;
  /** What was booked, for the return page, e.g. "Dr. Rao, tomorrow at 10:30". */
  label?: string;
}

function savePending(p: PendingWebPayment) {
  try {
    globalThis.sessionStorage?.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    // Private mode etc.: the return page then just sends the family home.
  }
}

export function readPendingWebPayment(): PendingWebPayment | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingWebPayment) : null;
  } catch {
    return null;
  }
}

export function clearPendingWebPayment() {
  try {
    globalThis.sessionStorage?.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/**
 * Open the payment page and wait for the family to come back. Resolves with
 * the server's view of the payment (never with what the browser said). On
 * web the page navigates away instead and this resolves 'redirecting'.
 */
export async function payForConsult(appointmentId: string, label?: string): Promise<PaymentStatus> {
  const returnUrl = Linking.createURL(RETURN_PATH);
  const started = await call<{ url?: string; state?: PaymentState }>(
    { action: 'start', appointmentId, returnUrl },
    "Couldn't open the payment page. Please check your connection and try again.",
  );
  if (started.state) return { state: started.state };
  if (!started.url) throw new Error("Couldn't open the payment page. Please try again.");

  if (Platform.OS === 'web') {
    savePending({ appointmentId, label });
    globalThis.location.href = started.url;
    return { state: 'redirecting' };
  }

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

/**
 * Move a paid, upcoming consult to another open slot of the same doctor
 * (free; 2 hours or more before the start). The server checks every rule
 * (reschedule_appointment, 0051) and emails the new time.
 */
export async function rescheduleConsult(
  appointmentId: string,
  slotId: string,
): Promise<{ id: string; date: string; time: string; reschedule_count: number }> {
  const res = await call<{ appointment: { id: string; date: string; time: string; reschedule_count: number } }>(
    { action: 'reschedule', appointmentId, slotId },
    "Couldn't move the consult. Please check your connection and try again.",
  );
  return res.appointment;
}

/** How many times a consult can be moved, and how close to the start (same line as refunds). */
export const MAX_RESCHEDULES = 3;
export const RESCHEDULE_CUTOFF_MINUTES = 120;

/** This parent's own unpaid hold on one slot, if the app lost track of it. */
export async function findOwnHold(params: {
  childId: string;
  doctorId: string;
  date: string;
  time: string;
}): Promise<{ id: string; hold_expires_at: string | null } | null> {
  const { data } = await supabase
    .from('appointments')
    .select('id, hold_expires_at')
    .eq('child_id', params.childId)
    .eq('doctor_id', params.doctorId)
    .eq('date', params.date)
    .eq('time', params.time)
    .eq('status', 'awaiting_payment')
    .gt('hold_expires_at', new Date().toISOString())
    .maybeSingle<{ id: string; hold_expires_at: string | null }>();
  return data ?? null;
}

/** This parent's unpaid hold booked from one check-in, if any. */
export async function findOwnHoldForCheckin(
  childId: string,
  sessionId: string,
): Promise<{ id: string; doctor_id: string; date: string; time: string; hold_expires_at: string | null } | null> {
  const { data } = await supabase
    .from('appointments')
    .select('id, doctor_id, date, time, hold_expires_at')
    .eq('child_id', childId)
    .eq('ai_summary_id', sessionId)
    .eq('status', 'awaiting_payment')
    .gt('hold_expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; doctor_id: string; date: string; time: string; hold_expires_at: string | null }>();
  return data ?? null;
}
