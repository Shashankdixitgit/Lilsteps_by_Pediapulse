import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  bookWithCarePlan,
  cancelConsult,
  checkConsultPayment,
  clearPendingWebPayment,
  CONSULT_PRICE_LABEL,
  findOwnHold,
  payForConsult,
  PaymentPageError,
  type PaymentState,
  type PaymentStatus,
  REFUND_FAILED_TEXT,
} from '@/lib/consultPayment';

/** Shown when the payment page could not be opened; the hold is dropped. */
export const SLOT_NOT_KEPT_TEXT = "Couldn't open the payment page. Your slot was not kept — please try again.";

/** The slot a hold is for; a hold for another target is dropped first. */
export interface HoldTarget {
  childId: string;
  doctorId: string;
  date: string;
  time: string;
}

const keyOf = (t: HoldTarget) => `${t.childId}|${t.doctorId}|${t.date}|${t.time}`;

/**
 * Book-then-pay for the two booking screens (consult/confirm, checkin/summary).
 *
 * `checkout(book, target)` holds the slot with `book` (hold_slot), opens the
 * payment page, and resolves with the booking id when the server says it is
 * paid. A retry for the same target reuses the held booking; a new target
 * drops the old hold first. Anything else leaves a calm `notice`: not
 * finished (slot still held, Pay again), or ran out (slot released).
 *
 * `checkoutWithPlan(book, target)` holds the slot the same way, then books
 * it with one of this month's Care Plan consults (no payment page). If the
 * plan has none left (another booking took the last one a moment ago), the
 * hold is kept and a calm notice offers ₹449 instead: `checkout` for the
 * same target then reuses that hold.
 *
 * `resumeFor(target)` looks for a hold this parent already has on that slot
 * (the screen was closed mid-payment) so the screen can offer "Finish
 * paying". A hold that was made but never reached the payment page is
 * dropped when the screen goes away, so it doesn't count against the
 * two-hold limit.
 *
 * If the payment page can't be opened at all, the hold is released straight
 * away and `checkout` throws SLOT_NOT_KEPT_TEXT.
 *
 * Web: the page leaves for Razorpay. If the parent comes back with the
 * browser's Back button, the page can be restored from the back/forward
 * cache with the button still busy; `pageshow` (persisted) and
 * `visibilitychange` clear that and ask the server about the hold again.
 */
export function useConsultCheckout() {
  const held = useRef<{ id: string; key: string; sentToPayment: boolean } | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** True while a hold exists that can still be paid. */
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  /** Web: the page was sent to Razorpay and has not come back yet. */
  const awayAtPayment = useRef(false);

  useEffect(
    () => () => {
      const h = held.current;
      if (h && !h.sentToPayment) void cancelConsult(h.id).catch(() => undefined);
    },
    [],
  );

  // Web: back from Razorpay without paying (Back button, bfcache restore).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void backFromPaymentPage();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void backFromPaymentPage();
    };
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Listeners only read refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Clear the busy state and show what the server now says about the hold. */
  async function backFromPaymentPage() {
    if (!awayAtPayment.current) return;
    awayAtPayment.current = false;
    setPaying(false);
    const h = held.current;
    if (!h) return;
    let status: PaymentStatus;
    try {
      status = await checkConsultPayment(h.id);
    } catch {
      // Can't tell right now: offer to pay again (the server re-checks).
      setAwaitingPayment(true);
      setNotice(pendingText());
      return;
    }
    if (status.state === 'pending' || status.state === 'redirecting') {
      setAwaitingPayment(true);
      setNotice(pendingText(status.holdExpiresAt));
      return;
    }
    if (status.state === 'paid') {
      // The return page reads the saved booking and shows "You're booked".
      router.replace('/payment-return');
      return;
    }
    held.current = null;
    clearPendingWebPayment();
    setAwaitingPayment(false);
    setNotice(endedText(status.state, status.refunded, status.refundFailed));
  }

  function pendingText(holdExpiresAt?: string | null): string {
    const mins = holdExpiresAt
      ? Math.max(1, Math.round((new Date(holdExpiresAt).getTime() - Date.now()) / 60000))
      : null;
    return mins
      ? `Payment not finished. Your slot is held for about ${mins} more minute${mins === 1 ? '' : 's'}.`
      : 'Payment not finished. Your slot is held for a few more minutes.';
  }

  function endedText(state: PaymentState, refunded?: boolean, refundFailed?: boolean): string {
    const lead =
      state === 'cancelled'
        ? 'This booking was cancelled.'
        : 'The time to pay ran out and the slot was released.';
    if (refundFailed) return `${lead} ${REFUND_FAILED_TEXT}`;
    if (refunded) return `${lead} The amount taken is being refunded to you.`;
    return `${lead} Please go back and pick another time.`;
  }

  /**
   * Take over a hold found on the server (the screen was closed mid-payment).
   * It is kept on unmount; it expires by itself if the family walks away.
   */
  function adoptHold(id: string, target: HoldTarget, holdExpiresAt: string | null) {
    held.current = { id, key: keyOf(target), sentToPayment: true };
    setAwaitingPayment(true);
    setNotice(pendingText(holdExpiresAt));
  }

  async function resumeFor(target: HoldTarget): Promise<boolean> {
    const hold = await findOwnHold(target).catch(() => null);
    if (!hold) return false;
    adoptHold(hold.id, target, hold.hold_expires_at);
    return true;
  }

  /** The hold for this target: reused, or made with `book` (an old target's hold is dropped first). */
  async function holdFor(book: () => Promise<{ id: string }>, target: HoldTarget) {
    const key = keyOf(target);
    if (held.current && held.current.key !== key) {
      // The parent picked another time: give the old slot back.
      await cancelConsult(held.current.id).catch(() => undefined);
      held.current = null;
      setAwaitingPayment(false);
    }
    if (!held.current) {
      const appt = await book();
      held.current = { id: appt.id, key, sentToPayment: false };
    }
    return held.current;
  }

  async function checkoutWithPlan(book: () => Promise<{ id: string }>, target: HoldTarget): Promise<string | null> {
    setPaying(true);
    setNotice(null);
    try {
      const h = await holdFor(book, target);
      const result = await bookWithCarePlan(h.id);
      if (result.state === 'paid') {
        held.current = null;
        setAwaitingPayment(false);
        return h.id;
      }
      if (result.state === 'no_credit' || result.state === 'no_plan') {
        // The slot stays held for a moment: paying for it reuses the hold.
        setNotice(
          result.state === 'no_credit'
            ? `Your plan consults for this month are used up. You can book this one for ${CONSULT_PRICE_LABEL}.`
            : `Your Care Plan has no consults to use right now. You can book this one for ${CONSULT_PRICE_LABEL}.`,
        );
        return null;
      }
      held.current = null;
      setAwaitingPayment(false);
      setNotice(endedText('expired'));
      return null;
    } finally {
      setPaying(false);
    }
  }

  async function checkout(
    book: () => Promise<{ id: string }>,
    target: HoldTarget,
    label?: string,
    /** false: never drop this hold (a follow-up the doctor booked). */
    releaseOnFail = true,
  ): Promise<string | null> {
    setPaying(true);
    setNotice(null);
    let redirecting = false;
    try {
      const h = await holdFor(book, target);
      h.sentToPayment = true;
      const result = await openPayment(h, label, releaseOnFail);
      if (result.state === 'redirecting') {
        redirecting = true;
        return null;
      }
      if (result.state === 'paid') {
        held.current = null;
        setAwaitingPayment(false);
        return h.id;
      }
      if (result.state === 'pending') {
        setAwaitingPayment(true);
        setNotice(pendingText(result.holdExpiresAt));
        return null;
      }
      held.current = null;
      setAwaitingPayment(false);
      setNotice(endedText(result.state, result.refunded, result.refundFailed));
      return null;
    } finally {
      // Web: the page is leaving for Razorpay; keep the button busy.
      if (!redirecting) setPaying(false);
    }
  }

  /**
   * payForConsult, except that when the payment page can't be opened the
   * hold is released at once (no payment can have been made), instead of
   * keeping the slot from other families until it runs out.
   */
  async function openPayment(
    h: { id: string },
    label: string | undefined,
    releaseOnFail: boolean,
  ): Promise<PaymentStatus> {
    try {
      const result = await payForConsult(h.id, label);
      if (result.state === 'redirecting') awayAtPayment.current = true;
      return result;
    } catch (e) {
      if (!(e instanceof PaymentPageError)) throw e;
      if (!releaseOnFail) throw new Error(e.message);
      await cancelConsult(h.id).catch(() => undefined);
      held.current = null;
      setAwaitingPayment(false);
      throw new Error(SLOT_NOT_KEPT_TEXT);
    }
  }

  /** Drop an unpaid hold (Cancel booking) so the slot goes back to others. */
  async function releaseHold(): Promise<void> {
    const h = held.current;
    if (!h) return;
    setPaying(true);
    try {
      await cancelConsult(h.id);
      held.current = null;
      setAwaitingPayment(false);
      setNotice(null);
    } finally {
      setPaying(false);
    }
  }

  return { checkout, checkoutWithPlan, resumeFor, adoptHold, releaseHold, paying, notice, awaitingPayment };
}
