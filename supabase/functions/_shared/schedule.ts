// Small, pure helpers for consult times (reschedule, follow-ups, reminders).
// Clinic times are IST wall-clock (date + time columns, +05:30, no DST).

const IST_OFFSET_MS = 330 * 60 * 1000;

/** Consult start as a Date: date + time are clinic (IST, +05:30) wall time. */
export function consultStart(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 8)}+05:30`);
}

/**
 * notification_log payload.starts_at for a consult time ("2026-11-03T17:30").
 * Part of the one-message index (0051): one reschedule email / reminder per
 * consult time.
 */
export function startsAtKey(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}`;
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
