type ParentContact = { name: string | null; phone: string | null } | null | undefined;

/**
 * Parent label for detail pages: "Name · +91…" so the doctor can call back.
 * Falls back to whichever part exists, or an em dash when RLS hides the row.
 */
export function parentContact(parent: ParentContact): string {
  const name = parent?.name?.trim();
  const phone = parent?.phone?.trim();
  if (name && phone) return `${name} · ${phone}`;
  return name || phone || '—';
}
