/**
 * Prescription field limits and checks: the form's maxLength, the client
 * check and the server action's check all come from here. The database
 * enforces the same limits (CHECKs and create_prescription, migrations 0050
 * and 0055).
 */
export const RX_LIMITS = {
  medicine: 120,
  brand: 120,
  strength: 80,
  dose: 80,
  frequency: 80,
  duration: 80,
  route: 40,
  timing: 40,
  itemNotes: 300,
  notes: 1000,
  chiefComplaints: 1000,
  examination: 1000,
  diagnosis: 500,
  advice: 2000,
  followUpText: 200,
  /** Medicines per prescription (create_prescription refuses more). */
  items: 30,
} as const;

/** One medicine row as the form holds it (all strings; empty = not given). */
export interface RxItemDraft {
  medicine: string;
  brand: string;
  strength: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  timing: string;
  notes: string;
}

/** The clinical note, advice and follow-up as the form holds them. */
export interface RxHeaderDraft {
  chiefComplaints: string;
  examination: string;
  diagnosis: string;
  advice: string;
  /** YYYY-MM-DD or ''. */
  followUpDate: string;
  followUpText: string;
}

/** Every medicine needs these (generic name, dose, frequency, duration). */
export const RX_REQUIRED_ITEM_FIELDS = ['medicine', 'dose', 'frequency', 'duration'] as const;
export type RxRequiredItemField = (typeof RX_REQUIRED_ITEM_FIELDS)[number];

export const ROUTE_OPTIONS = ['Oral', 'Nebulised', 'Inhaled (MDI)', 'Nasal', 'Eye', 'Ear', 'Topical (skin)', 'Rectal'] as const;
export const TIMING_OPTIONS = ['Before food', 'After food', 'With food', 'Empty stomach', 'At bedtime'] as const;
export const FREQUENCY_SUGGESTIONS = [
  'Once a day',
  'Twice a day',
  '3 times a day',
  '4 times a day',
  'Every 6 hours if fever',
  'Every 8 hours',
  'Only if needed (SOS)',
] as const;
export const DURATION_SUGGESTIONS = ['3 days', '5 days', '7 days', '10 days', '2 weeks', 'Until review'] as const;

/**
 * A generic name in capitals (IMC Regulations 2002 §1.5: "generic names,
 * legibly and preferably in capital letters"). The micro sign is written
 * out first, because "µg".toUpperCase() is the Greek capital "ΜG", which
 * reads as MG (a thousandfold error): µg / μg → MCG.
 */
export function rxUpper(s: string): string {
  return s
    .trim()
    .replace(/[\u00B5\u03BC]\s*g/gi, 'mcg')
    .replace(/[\u00B5\u03BC]/g, 'mc')
    .toUpperCase();
}

const tooLong = (v: string | undefined, max: number) => (v?.trim().length ?? 0) > max;

/**
 * The first problem with a prescription draft, or null when it can be
 * issued. `today` is the IST calendar day (YYYY-MM-DD).
 */
export function validatePrescription(header: RxHeaderDraft, items: RxItemDraft[], today: string): string | null {
  if (!header.diagnosis.trim()) return 'Add a diagnosis or provisional diagnosis';
  if (items.length === 0) return 'Add at least one medicine';
  if (items.length > RX_LIMITS.items) return `A prescription can have up to ${RX_LIMITS.items} medicines`;
  for (const it of items) {
    if (RX_REQUIRED_ITEM_FIELDS.some((f) => !it[f].trim())) {
      return 'Each medicine needs a generic name, dose, frequency and duration';
    }
    if (
      tooLong(it.medicine, RX_LIMITS.medicine) ||
      tooLong(it.brand, RX_LIMITS.brand) ||
      tooLong(it.strength, RX_LIMITS.strength) ||
      tooLong(it.dose, RX_LIMITS.dose) ||
      tooLong(it.frequency, RX_LIMITS.frequency) ||
      tooLong(it.duration, RX_LIMITS.duration) ||
      tooLong(it.route, RX_LIMITS.route) ||
      tooLong(it.timing, RX_LIMITS.timing) ||
      tooLong(it.notes, RX_LIMITS.itemNotes)
    ) {
      return `Keep each medicine short: name and brand up to ${RX_LIMITS.medicine} characters, strength, dose, frequency and duration up to ${RX_LIMITS.dose}, instructions up to ${RX_LIMITS.itemNotes}`;
    }
  }
  if (tooLong(header.chiefComplaints, RX_LIMITS.chiefComplaints)) return `Chief complaints can be up to ${RX_LIMITS.chiefComplaints} characters`;
  if (tooLong(header.examination, RX_LIMITS.examination)) return `Examination findings can be up to ${RX_LIMITS.examination} characters`;
  if (tooLong(header.diagnosis, RX_LIMITS.diagnosis)) return `The diagnosis can be up to ${RX_LIMITS.diagnosis} characters`;
  if (tooLong(header.advice, RX_LIMITS.advice)) return `Special instructions can be up to ${RX_LIMITS.advice} characters`;
  if (tooLong(header.followUpText, RX_LIMITS.followUpText)) return `The follow-up note can be up to ${RX_LIMITS.followUpText} characters`;
  const d = header.followUpDate.trim();
  if (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) return 'The follow-up date is not a valid date';
    const max = new Date(`${today}T00:00:00Z`);
    max.setUTCDate(max.getUTCDate() + 366);
    if (d < today || d > max.toISOString().slice(0, 10)) return 'The follow-up date must be between today and one year from now';
  }
  return null;
}
