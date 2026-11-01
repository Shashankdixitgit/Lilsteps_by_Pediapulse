/**
 * Client side of pay-per-consult (the `consult-payment` Edge Function).
 *
 * The price shown here is display text only: the server sets the amount
 * (CONSULT_PRICE_PAISE in supabase/functions/_shared/razorpay.ts) and the
 * app never sends one.
 *
 * Flow: hold_slot holds the slot ('awaiting_payment') → startConsultPayment
 * returns a Razorpay Payment Link →
 *  - native: we open it in an auth session (lib/paymentBrowser: ephemeral
 *    on iOS, so no sign-in alert) that closes when Razorpay redirects back
 *    to RETURN_PATH, then ask the server for the status;
 *  - web: a popup opened after two network calls is blocked, so the whole
 *    page goes to Razorpay and app/payment-return.tsx picks up from the
 *    booking saved in sessionStorage (PENDING_KEY).
 * The server checks with Razorpay (the webhook may already have done it),
 * and also sends the confirmation SMS and makes the Meet link.
 */
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { openPaymentPage } from '@/lib/paymentBrowser';
import { isSessionEndedError, SESSION_ENDED_TEXT } from '@/lib/sessionEnded';
import { supabase } from '@/lib/supabase';
import { SUPPORT_EMAIL } from '@/lib/support';

export const CONSULT_PRICE_LABEL = '₹449';

/** Gap between status checks after the payment page closes (tests shorten it). */
export const paymentRecheckMs = { value: 2000 };

/** app/payment-return.tsx — where Razorpay sends the browser back. */
export const RETURN_PATH = 'payment-return';

/** Web only: the booking being paid for while the page is away at Razorpay. */
const PENDING_KEY = 'lilsteps.pendingConsultPayment';

export type PaymentState = 'paid' | 'pending' | 'expired' | 'cancelled';

export type RefundOutcome = 'started' | 'failed' | 'none' | 'not_paid';

/**
 * A Care Plan consult that was cancelled (0053): back to the plan; used
 * (under 2 h); expired (the parent cancelled after its plan month ended);
 * or a free one owed (the doctor cancelled after the month ended).
 */
export type PlanCreditOutcome = 'returned' | 'used' | 'expired' | 'rebook_owed';

export interface CancelOutcome {
  refund: RefundOutcome;
  late?: boolean;
  plan?: PlanCreditOutcome;
}

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
  // The session ended on the server: the app is signing out (lib/sessionEnded).
  if (isSessionEndedError(error)) return SESSION_ENDED_TEXT;
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

export const PAYMENT_PAGE_FAILED_TEXT = "Couldn't open the payment page. Please check your connection and try again.";

/**
 * The payment page could not be opened (the 'start' step failed), so no
 * payment can have been made. useConsultCheckout releases the hold.
 */
export class PaymentPageError extends Error {
  /** What the server said, e.g. a return-URL problem; kept for debugging. */
  readonly detail: string;
  constructor(detail: string) {
    super(PAYMENT_PAGE_FAILED_TEXT);
    this.name = 'PaymentPageError';
    this.detail = detail;
  }
}

/**
 * Open the payment page and wait for the family to come back. Resolves with
 * the server's view of the payment (never with what the browser said). On
 * web the page navigates away instead and this resolves 'redirecting'.
 */
export async function payForConsult(appointmentId: string, label?: string): Promise<PaymentStatus> {
  const returnUrl = Linking.createURL(RETURN_PATH);
  let started: { url?: string; state?: PaymentState };
  try {
    started = await call<{ url?: string; state?: PaymentState }>(
      // Android: come back through the web hand-off page (razorpay-return).
      { action: 'start', appointmentId, returnUrl, handoff: Platform.OS === 'android' },
      PAYMENT_PAGE_FAILED_TEXT,
    );
  } catch (e) {
    throw new PaymentPageError(e instanceof Error ? e.message : PAYMENT_PAGE_FAILED_TEXT);
  }
  if (started.state) return { state: started.state };
  if (!started.url) throw new PaymentPageError(PAYMENT_PAGE_FAILED_TEXT);

  if (Platform.OS === 'web') {
    savePending({ appointmentId, label });
    globalThis.location.href = started.url;
    return { state: 'redirecting' };
  }

  // iOS: an ephemeral session (no "wants to use rzp.io to Sign In" alert);
  // the page also closes by itself if the server hears "paid" first.
  const { returnedUrl } = await openPaymentPage(
    started.url,
    returnUrl,
    Platform.OS === 'ios'
      ? async () => (await checkConsultPayment(appointmentId)).state === 'paid'
      : undefined,
  );

  // The webhook can land a moment after the browser closes, and on Android
  // the redirect back can be blocked after a UPI app switch (no returned
  // URL even though the parent paid): keep asking for a while either way.
  let last = await checkConsultPayment(appointmentId, returnedUrl);
  const tries = returnedUrl ? 5 : 3;
  for (let i = 0; i < tries && last.state === 'pending'; i++) {
    await new Promise((r) => setTimeout(r, paymentRecheckMs.value));
    last = await checkConsultPayment(appointmentId, returnedUrl);
  }
  return last;
}

/**
 * Book a held slot with one of this month's Care Plan consults instead of
 * paying. 'no_credit' / 'no_plan': the hold stays, so the family can pay
 * ₹449 for it instead. The server checks the plan (0053); the app only asks.
 */
export async function bookWithCarePlan(
  appointmentId: string,
): Promise<{ state: 'paid' | 'no_credit' | 'no_plan' | 'expired'; plan?: boolean }> {
  return call({ action: 'use_plan', appointmentId }, "Couldn't book with your plan. Please check your connection and try again.");
}

/** Cancel a consult (or drop an unpaid hold). The server decides any refund. */
export async function cancelConsult(appointmentId: string): Promise<CancelOutcome> {
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

/** One of this parent's unpaid holds on a day (the slot picker shows it as theirs). */
export interface OwnHold {
  id: string;
  doctor_id: string;
  time: string;
  hold_expires_at: string | null;
  concern: string | null;
  doctors: { name: string } | null;
}

/** This child's live unpaid holds on one clinic day, optionally for one doctor. */
export async function fetchOwnHoldsOn(childId: string, date: string, doctorId?: string | null): Promise<OwnHold[]> {
  let q = supabase
    .from('appointments')
    .select('id, doctor_id, time, hold_expires_at, concern, doctors(name)')
    .eq('child_id', childId)
    .eq('date', date)
    .eq('status', 'awaiting_payment')
    .gt('hold_expires_at', new Date().toISOString());
  if (doctorId) q = q.eq('doctor_id', doctorId);
  const { data } = await q.returns<OwnHold[]>();
  return data ?? [];
}
