/**
 * Client side of the LilSteps Care Plan (the `care-plan` Edge Function and
 * get_my_care_plan, migration 0053).
 *
 * ₹999 a month, 3 video consults per billing month, renews monthly until
 * cancelled. Prices here are display text only: the amount is set on the
 * Razorpay Plan on the server, never sent by the app.
 *
 * Subscribing opens Razorpay's subscription page (short_url) the same way a
 * consult payment does (lib/consultPayment.ts):
 *  - native: an auth session (lib/paymentBrowser, ephemeral on iOS so no
 *    sign-in alert). Razorpay's subscription page has no redirect back, so
 *    the app asks the server every few seconds and closes the page itself
 *    once the plan is confirmed (iOS; on Android the parent taps ✕);
 *  - web: the whole page goes to Razorpay (a popup opened after a network
 *    call is blocked). The Care Plan screen checks again when it is opened.
 * Either way only the server's view (webhook / Razorpay fetch) counts.
 */
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { RETURN_PATH } from '@/lib/consultPayment';
import { openPaymentPage } from '@/lib/paymentBrowser';
import {
  isServerUnavailableError,
  isSessionEndedError,
  SERVER_UNAVAILABLE_TEXT,
  SESSION_ENDED_TEXT,
} from '@/lib/sessionEnded';
import { supabase } from '@/lib/supabase';

export const CARE_PLAN_PRICE_LABEL = '₹999';
export const CARE_PLAN_CONSULTS = 3;

/** Web only: a subscription page was opened, check the plan on return. */
const PENDING_KEY = 'lilsteps.pendingCarePlan';

export type CarePlanStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'expired';

/** get_my_care_plan() (0053). */
export interface CarePlan {
  status: CarePlanStatus | null;
  cancel_at_period_end: boolean;
  current_end: string | null;
  ended_at: string | null;
  /** This paid month; null when no paid month covers today. */
  credits_total: number | null;
  credits_left: number | null;
  period_end: string | null;
}

/** What the parent sees, worked out from the server's plan row. */
export type CarePlanView =
  | { kind: 'none' }
  | { kind: 'starting' }
  | { kind: 'active'; left: number; total: number; renewsOn: string | null }
  | { kind: 'ending'; left: number; total: number; endsOn: string | null }
  | { kind: 'retrying'; left: number | null; total: number | null }
  | { kind: 'paused' }
  | { kind: 'ended'; left: number; total: number; endsOn: string | null };

export function viewOf(plan: CarePlan | null): CarePlanView {
  if (!plan) return { kind: 'none' };
  const left = plan.credits_left;
  const total = plan.credits_total;
  switch (plan.status) {
    case 'created':
      return { kind: 'starting' };
    case 'authenticated':
    case 'active':
      if (left === null || total === null) return { kind: 'starting' };
      return plan.cancel_at_period_end
        ? { kind: 'ending', left, total, endsOn: plan.period_end ?? plan.current_end }
        : { kind: 'active', left, total, renewsOn: plan.current_end };
    case 'pending':
      return { kind: 'retrying', left, total };
    case 'halted':
    case 'paused':
      return { kind: 'paused' };
    default:
      // cancelled / completed / expired: a month already paid for still runs.
      if (left !== null && total !== null && plan.period_end) {
        return { kind: 'ended', left, total, endsOn: plan.period_end };
      }
      return { kind: 'none' };
  }
}

/** Plan consults the parent can use right now (0 when none). */
export function creditsLeft(plan: CarePlan | null): number {
  return plan?.credits_left ?? 0;
}

async function errorText(error: unknown, fallback: string): Promise<string> {
  // The session ended on the server: the app is signing out (lib/sessionEnded).
  if (isSessionEndedError(error)) return SESSION_ENDED_TEXT;
  // The server couldn't check the session just now (503): not signed out.
  if (isServerUnavailableError(error)) return SERVER_UNAVAILABLE_TEXT;
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
  const { data, error } = await supabase.functions.invoke<T>('care-plan', { body });
  if (error || !data) throw new Error(await errorText(error, fallback));
  return data;
}

/** The plan as stored (fast; no call to Razorpay). */
export async function getMyCarePlan(): Promise<CarePlan | null> {
  const { data, error } = await supabase.rpc('get_my_care_plan');
  if (error) throw new Error("Couldn't load your Care Plan. Please check your connection.");
  return (data as CarePlan | null) ?? null;
}

/** The plan after the server has checked with Razorpay (after subscribing, on the plan screen). */
export async function refreshCarePlan(): Promise<CarePlan | null> {
  const res = await call<{ plan: CarePlan | null }>(
    { action: 'status' },
    "Couldn't check your Care Plan. Please check your connection.",
  );
  return res.plan;
}

function markPending() {
  try {
    globalThis.sessionStorage?.setItem(PENDING_KEY, '1');
  } catch {
    // ignore
  }
}

/** Web: true once after coming back from Razorpay's subscription page. */
export function takePendingCarePlan(): boolean {
  try {
    const v = globalThis.sessionStorage?.getItem(PENDING_KEY);
    if (v) globalThis.sessionStorage?.removeItem(PENDING_KEY);
    return !!v;
  } catch {
    return false;
  }
}

export type SubscribeResult =
  | { state: 'redirecting' }
  | { state: 'done'; plan: CarePlan | null };

/** Gap between plan checks after the page closes (tests shorten it). */
export const planRecheckMs = { value: 2000 };

/** The first payment is in: the plan has a paid month (or is otherwise settled). */
function isConfirmed(plan: CarePlan | null): boolean {
  const kind = viewOf(plan).kind;
  return kind !== 'starting' && kind !== 'none';
}

/** Open Razorpay's subscription page and come back with the server's view of the plan. */
export async function subscribeToCarePlan(): Promise<SubscribeResult> {
  const started = await call<{ url?: string; state?: string }>(
    { action: 'subscribe' },
    "Couldn't open the plan page. Please check your connection and try again.",
  );
  if (!started.url) return { state: 'done', plan: await refreshCarePlan() };

  if (Platform.OS === 'web') {
    markPending();
    globalThis.location.href = started.url;
    return { state: 'redirecting' };
  }

  // Razorpay's subscription page never redirects back, so the app watches
  // the server while it is open and closes it once the plan is confirmed
  // (iOS). Android can't close a Custom Tab: the parent taps ✕.
  let seen: CarePlan | null = null;
  // Stored plan (get_my_care_plan) on most polls; a Razorpay check every 4th.
  await openPaymentPage(started.url, Linking.createURL(RETURN_PATH), async ({ full }) => {
    seen = full ? await refreshCarePlan() : await getMyCarePlan();
    return isConfirmed(seen);
  });
  // The webhook can land a moment after the page closes: keep asking.
  let plan = isConfirmed(seen) ? seen : await refreshCarePlan();
  for (let i = 0; i < 5 && !isConfirmed(plan); i++) {
    await new Promise((r) => setTimeout(r, planRecheckMs.value));
    plan = await refreshCarePlan();
  }
  return { state: 'done', plan };
}

export async function cancelCarePlan(): Promise<{ state: 'ends' | 'cancelled' | 'none'; endsAt?: string | null }> {
  return call({ action: 'cancel' }, "Couldn't cancel the plan. Please check your connection and try again.");
}

/** "3 November" (India time). */
export function planDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
}
