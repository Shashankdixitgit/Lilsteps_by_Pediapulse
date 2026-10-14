/**
 * Phone numbers: one canonical form (E.164, "+919876543210") for sign-up,
 * login and display. Indian parents usually type the 10-digit number without
 * the country code, so a bare 10-digit number is treated as Indian (+91).
 * Without this, "9876543210" and "+919876543210" became two separate
 * accounts (R2-04).
 */

/**
 * "98765 43210" -> "+919876543210"
 * "919876543210" -> "+919876543210"
 * "09876543210" -> "+919876543210" (trunk prefix)
 * "+91 09876543210" -> "+919876543210" (trunk 0 typed after the code, R3-10)
 * "+1 (415) 555-0100" -> "+14155550100"
 * Anything else keeps its digits, with the leading "+" if it had one.
 */
export function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  // "+91 0…" / "91 0…": Indian numbers never start with 0 after the country
  // code; the 0 is the domestic trunk prefix. Kept, it made a second account.
  if (digits.length === 13 && digits.startsWith('910')) return `+91${digits.slice(3)}`;
  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return digits;
}

/** True when the normalised number looks like a dialable E.164 number. */
export function isValidPhone(normalised: string): boolean {
  if (normalised.startsWith('+91')) return /^\+91[6-9]\d{9}$/.test(normalised);
  return /^\+\d{10,15}$/.test(normalised);
}

/** "+919876543210" -> "+91 98765 43210"; other numbers are shown normalised. */
export function formatPhone(raw: string): string {
  const p = normalisePhone(raw);
  const m = /^\+91(\d{5})(\d{5})$/.exec(p);
  return m ? `+91 ${m[1]} ${m[2]}` : p;
}
