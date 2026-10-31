import { useEffect, useRef, useState } from 'react';

import {
  cancelConsult,
  findOwnHold,
  payForConsult,
  type PaymentState,
  REFUND_FAILED_TEXT,
} from '@/lib/consultPayment';

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
 * `resumeFor(target)` looks for a hold this parent already has on that slot
 * (the screen was closed mid-payment) so the screen can offer "Finish
 * paying". A hold that was made but never reached the payment page is
 * dropped when the screen goes away, so it doesn't count against the
 * two-hold limit.
 */
export function useConsultCheckout() {
  const held = useRef<{ id: string; key: string; sentToPayment: boolean } | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** True while a hold exists that can still be paid. */
  const [awaitingPayment, setAwaitingPayment] = useState(false);

  useEffect(
    () => () => {
      const h = held.current;
      if (h && !h.sentToPayment) void cancelConsult(h.id).catch(() => undefined);
    },
    [],
  );

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

  async function checkout(
    book: () => Promise<{ id: string }>,
    target: HoldTarget,
    label?: string,
  ): Promise<string | null> {
    setPaying(true);
    setNotice(null);
    let redirecting = false;
    try {
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
      const h = held.current;
      h.sentToPayment = true;
      const result = await payForConsult(h.id, label);
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

  return { checkout, resumeFor, adoptHold, releaseHold, paying, notice, awaitingPayment };
}
