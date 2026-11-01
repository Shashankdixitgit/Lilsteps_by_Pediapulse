/**
 * In-memory state for "Book a doctor" (describe → slots → confirm).
 *
 * The parent's concern is health information, so it is never put in the URL
 * (where it would land in browser history, logs and analytics). It lives
 * here for the length of one booking, and is saved on the booking itself
 * when the slot is held (hold_slot p_concern). A full page reload drops it,
 * which is fine: a held booking already has it on the server.
 */
let concern = '';
let flash: string | null = null;

/** describe: what the parent picked / typed ('' = skipped). */
export function setBookingConcern(text: string | null | undefined) {
  concern = (text ?? '').trim();
}

/** confirm: the concern for this booking ('' when none). */
export function getBookingConcern(): string {
  return concern;
}

/** A one-time message for the slot list (e.g. after cancelling a held booking). */
export function setSlotsNotice(text: string) {
  flash = text;
}

/** Read the slot-list message once; it is cleared as it is read. */
export function takeSlotsNotice(): string | null {
  const t = flash;
  flash = null;
  return t;
}
