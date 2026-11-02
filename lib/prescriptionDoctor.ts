/**
 * The doctor lines printed on a prescription (app/prescriptions/[id]).
 *
 * Test profiles and old rows carried placeholder text ("Test profile",
 * "qualifications to be added") and the screen printed "Registration no. to
 * be added" (mobile review must-fix 10). Placeholders are never shown. A
 * prescription without a registration number gets a plain warning instead:
 * it should not be used at a pharmacy. (Issuing one without the number is
 * already refused by the dashboard and create_prescription, 0050.)
 *
 * No React Native imports: tested with Deno.
 */

const PLACEHOLDER_RE = /\bto be added\b|^test profile$|^tbd$|^n\/?a$|^-+$/i;

/** One credential part, or null when blank or a placeholder. */
export function realPart(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v || PLACEHOLDER_RE.test(v)) return null;
  return v;
}

export const NO_REGISTRATION_TEXT =
  'This prescription has no doctor registration number. Please ask LilSteps for a complete copy before buying medicines.';

export function prescriptionDoctorLines(doctor: {
  specialisation?: string | null;
  qualifications?: string | null;
  registration_number?: string | null;
} | null): { credentials: string; registration: string | null } {
  const qualifications = (doctor?.qualifications ?? '')
    .split(/\s*·\s*/)
    .map(realPart)
    .filter(Boolean);
  const credentials = [realPart(doctor?.specialisation), ...qualifications].filter(Boolean).join(' · ');
  const reg = realPart(doctor?.registration_number);
  return { credentials, registration: reg ? `Reg. no. ${reg}` : null };
}
