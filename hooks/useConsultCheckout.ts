import { useRef, useState } from 'react';

import { type AppointmentRow, onConsultPaid } from '@/hooks/useAppointments';
import { cancelConsult, payForConsult, type PaymentState } from '@/lib/consultPayment';

/**
 * Book-then-pay for the two booking screens (consult/confirm, checkin/summary).
 *
 * `checkout(book, key)` holds the slot with `book` (once — a retry for the
 * same `key`, e.g. doctor + date + time, reuses the held booking; a new key
 * drops the old hold first), opens the payment page, and resolves with the booking id
 * when the server says it is paid. Anything else leaves a calm `notice`:
 * not finished (slot still held, Pay again), or ran out (slot released).
 */
export function useConsultCheckout() {
  const held = useRef<AppointmentRow | null>(null);
  const heldKey = useRef<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** True while a hold exists that can still be paid. */
  const [awaitingPayment, setAwaitingPayment] = useState(false);

  function describe(state: PaymentState, refunded?: boolean, holdExpiresAt?: string): string {
    if (state === 'pending') {
      const mins = holdExpiresAt
        ? Math.max(1, Math.round((new Date(holdExpiresAt).getTime() - Date.now()) / 60000))
        : null;
      return mins
        ? `Payment not finished. Your slot is held for about ${mins} more minute${mins === 1 ? '' : 's'}.`
        : 'Payment not finished. Your slot is held for a few more minutes.';
    }
    return refunded
      ? 'The time to pay ran out and the slot was released. Any amount taken is being refunded to you.'
      : 'The time to pay ran out and the slot was released. Please go back and pick another time.';
  }

  async function checkout(book: () => Promise<AppointmentRow>, key = ''): Promise<string | null> {
    setPaying(true);
    setNotice(null);
    try {
      if (held.current && heldKey.current !== key) {
        // The parent picked another time: give the old slot back.
        await cancelConsult(held.current.id).catch(() => undefined);
        held.current = null;
        setAwaitingPayment(false);
      }
      if (!held.current) {
        held.current = await book();
        heldKey.current = key;
      }
      const appt = held.current;
      const result = await payForConsult(appt.id);
      if (result.state === 'paid') {
        held.current = null;
        setAwaitingPayment(false);
        void onConsultPaid(appt);
        return appt.id;
      }
      if (result.state === 'pending') {
        setAwaitingPayment(true);
        setNotice(describe('pending', false, result.holdExpiresAt));
        return null;
      }
      held.current = null;
      setAwaitingPayment(false);
      setNotice(describe(result.state, result.refunded));
      return null;
    } finally {
      setPaying(false);
    }
  }

  /** Drop an unpaid hold (Cancel booking) so the slot goes back to others. */
  async function releaseHold(): Promise<void> {
    const appt = held.current;
    if (!appt) return;
    setPaying(true);
    try {
      await cancelConsult(appt.id);
      held.current = null;
      setAwaitingPayment(false);
      setNotice(null);
    } finally {
      setPaying(false);
    }
  }

  return { checkout, releaseHold, paying, notice, awaitingPayment };
}
