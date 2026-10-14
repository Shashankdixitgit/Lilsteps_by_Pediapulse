type ParentContact = { name: string | null; phone: string | null } | null | undefined;

/**
 * Hide all but the last four digits of a phone number: "+91 ••••••0007".
 * The chat is the doctor's channel to the parent, so the chat screens never
 * need the full number. The consultation page (lib/parent.ts) still shows it
 * for call-backs.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const last4 = digits.slice(-4);
  const prefix = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : '';
  return `${prefix}••••••${last4}`;
}

/** Parent label for the chat screens: the name, else the masked number. */
export function chatParentLabel(parent: ParentContact): string {
  return parent?.name?.trim() || maskPhone(parent?.phone) || '—';
}
