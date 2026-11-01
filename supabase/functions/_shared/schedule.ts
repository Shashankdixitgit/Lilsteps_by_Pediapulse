// Small, pure helpers for consult times (reschedule, follow-ups, reminders).
// Clinic times are IST wall-clock (date + time columns, +05:30, no DST).

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Consult start as a Date: date + time are clinic (IST, +05:30) wall time. */
export function consultStart(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 8)}+05:30`);
}

/**
 * notification_log payload.starts_at for a consult time and its move count
 * ("2026-11-03T17:30#1"). Part of the one-message index (0051): one
 * reschedule email / reminder per move, even when a consult is moved back to
 * a time it had before.
 */
export function startsAtKey(date: string, time: string, rescheduleCount: number): string {
  return `${date}T${time.slice(0, 5)}#${rescheduleCount}`;
}

/** A parent cancelling late still gets a full refund if the doctor moved the consult this recently. */
export const DOCTOR_MOVE_REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a parent's late cancel (under the 2-hour line) is still refunded
 * in full: the doctor moved this consult within the last 24 hours, so the
 * new time may simply not suit the family.
 */
export function doctorMovedRecently(
  lastRescheduledBy: string | null | undefined,
  rescheduledAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (lastRescheduledBy !== 'doctor' || !rescheduledAt) return false;
  const at = new Date(rescheduledAt).getTime();
  return Number.isFinite(at) && now - at <= DOCTOR_MOVE_REFUND_WINDOW_MS;
}

/** An instant as IST date ("2026-11-03") and time ("16:30"), for email wording. */
export function istParts(at: Date): { date: string; time: string } {
  const iso = new Date(at.getTime() + IST_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * Where Razorpay sends the family back after paying from an email link: the
 * web app's payment-return page when a web origin is configured, otherwise
 * the installed app. Either way the webhook confirms the consult.
 */
export function emailPaymentReturnUrl(origins: string | undefined): string {
  const first = (origins ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .find(Boolean);
  return first ? `${first}/payment-return` : 'lilsteps://payment-return';
}

/**
 * The Payment Link for a follow-up lives as long as its hold, less the grace
 * minutes the hold keeps for a late webhook. Never under Razorpay's 15-minute
 * minimum (the hold is at least 1 hour, see book_followup).
 */
export function followupLinkExpiry(holdExpiresAt: string, graceMinutes: number, now = Date.now()): Date {
  const end = new Date(holdExpiresAt).getTime() - graceMinutes * 60_000;
  return new Date(Math.max(end, now + 16 * 60_000));
}
