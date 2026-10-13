/**
 * Onboarding vaccination questions, each mapped to the EXACT dose rows that
 * iap_vaccine_schedule() creates (supabase/migrations/0006, calendar
 * intervals since 0014). A row is identified by vaccine_name + dose_number.
 *
 * "Given" on a question marks only that question's doses, and only those
 * already due on the child's age, never every dose of the vaccine family.
 * Due ages here MUST match the intervals in the migration.
 */
import { addCalendar, parseDateOnly, startOfLocalDay } from '@/lib/date';
import type { OnboardingPath } from '@/lib/age';

/** Calendar offset from the date of birth, same units as the SQL interval. */
export interface DueAt {
  weeks?: number;
  months?: number;
  years?: number;
}

export interface VaccineDose {
  /** vaccinations.vaccine_name, exactly as the schedule writes it. */
  vaccineName: string;
  /** vaccinations.dose_number. */
  doseNumber: number;
  /** vaccinations.dose_label (for display / debugging). */
  doseLabel: string;
  dueAt: DueAt;
}

export interface VaccineQuestion {
  /** Stable key for answers in the onboarding context, e.g. 'a_bcg'. */
  id: string;
  /** Row title on the screen. */
  name: string;
  /** Short timing note under the title, consistent with the schedule. */
  note: string;
  /** Dose rows a "Given" answer marks done (when due). Empty = the vaccine
   *  is not in the app's schedule; the answer is kept but marks nothing. */
  doses: VaccineDose[];
}

export const VACCINE_ANSWERS = ['Given', 'Missed', 'Not sure'] as const;
export type VaccineAnswer = (typeof VACCINE_ANSWERS)[number];

/** A dose row to update in public.vaccinations. */
export interface VaccineDoseRow {
  vaccine_name: string;
  dose_number: number;
}

// ─── The schedule's dose rows (mirror of iap_vaccine_schedule) ───────────────

const d = (vaccineName: string, doseNumber: number, doseLabel: string, dueAt: DueAt): VaccineDose => ({
  vaccineName, doseNumber, doseLabel, dueAt,
});

const DOSE = {
  BCG: d('BCG', 1, 'Birth', {}),
  OPV_0: d('OPV', 0, 'OPV-0', {}),
  OPV_BOOSTER: d('OPV', 6, 'Booster', { years: 5 }),
  HEPB_1: d('Hepatitis B', 1, 'Dose 1', {}),
  HEPB_2: d('Hepatitis B', 2, 'Dose 2', { weeks: 6 }),
  HEPB_3: d('Hepatitis B', 3, 'Dose 3', { months: 6 }),
  DTP_1: d('DTwP/DTaP', 1, 'Dose 1', { weeks: 6 }),
  DTP_2: d('DTwP/DTaP', 2, 'Dose 2', { weeks: 10 }),
  DTP_3: d('DTwP/DTaP', 3, 'Dose 3', { weeks: 14 }),
  DTP_B1: d('DTwP/DTaP', 4, 'Booster 1', { months: 18 }),
  DTP_B2: d('DTwP/DTaP', 5, 'Booster 2', { years: 5 }),
  IPV_1: d('IPV', 1, 'Dose 1', { weeks: 6 }),
  IPV_2: d('IPV', 2, 'Dose 2', { weeks: 10 }),
  IPV_3: d('IPV', 3, 'Dose 3', { weeks: 14 }),
  IPV_B1: d('IPV', 4, 'Booster 1', { months: 18 }),
  HIB_1: d('Hib', 1, 'Dose 1', { weeks: 6 }),
  HIB_2: d('Hib', 2, 'Dose 2', { weeks: 10 }),
  HIB_3: d('Hib', 3, 'Dose 3', { weeks: 14 }),
  HIB_B: d('Hib', 4, 'Booster', { months: 18 }),
  ROTA_1: d('Rotavirus', 1, 'Dose 1', { weeks: 6 }),
  ROTA_2: d('Rotavirus', 2, 'Dose 2', { weeks: 10 }),
  ROTA_3: d('Rotavirus', 3, 'Dose 3', { weeks: 14 }),
  PCV_1: d('PCV', 1, 'Dose 1', { weeks: 6 }),
  PCV_2: d('PCV', 2, 'Dose 2', { weeks: 10 }),
  PCV_3: d('PCV', 3, 'Dose 3', { weeks: 14 }),
  PCV_B: d('PCV', 4, 'Booster', { months: 15 }),
  FLU: d('Influenza', 1, 'Annual', { months: 6 }),
  MMR_1: d('MMR', 1, 'Dose 1', { months: 9 }),
  MMR_2: d('MMR', 2, 'Dose 2', { months: 15 }),
  MMR_3: d('MMR', 3, 'Dose 3', { years: 5 }),
  HEPA_1: d('Hepatitis A', 1, 'Dose 1', { months: 12 }),
  HEPA_2: d('Hepatitis A', 2, 'Dose 2', { months: 18 }),
  TCV_1: d('Typhoid Conjugate', 1, 'Dose 1', { months: 12 }),
  VAR_1: d('Varicella', 1, 'Dose 1', { months: 15 }),
  VAR_2: d('Varicella', 2, 'Dose 2', { years: 5 }),
  TDAP: d('Tdap', 1, 'Adolescent', { years: 10 }),
  HPV_1: d('HPV', 1, 'Dose 1', { years: 10 }),
  HPV_2: d('HPV', 2, 'Dose 2', { years: 10, months: 6 }),
} satisfies Record<string, VaccineDose>;

/** Every dose row in the schedule (38), for checks and tests. */
export const SCHEDULE_DOSES: VaccineDose[] = Object.values(DOSE);

// ─── Questions per onboarding path ───────────────────────────────────────────

/** Path A (under 3). Shown filtered to doses due by the child's age. */
export const A_VACCINE_QUESTIONS: VaccineQuestion[] = [
  { id: 'a_bcg', name: 'BCG', note: 'Given at birth', doses: [DOSE.BCG] },
  { id: 'a_hepb', name: 'Hepatitis B', note: 'Birth, 6 weeks and 6 months', doses: [DOSE.HEPB_1, DOSE.HEPB_2, DOSE.HEPB_3] },
  { id: 'a_opv', name: 'OPV', note: 'Oral polio, birth dose', doses: [DOSE.OPV_0] },
  { id: 'a_ipv', name: 'IPV', note: 'Injectable polio, 6, 10 and 14 weeks', doses: [DOSE.IPV_1, DOSE.IPV_2, DOSE.IPV_3] },
  {
    id: 'a_penta',
    name: 'Pentavalent',
    note: 'DPT + Hib combination, 6, 10 and 14 weeks',
    doses: [DOSE.DTP_1, DOSE.DTP_2, DOSE.DTP_3, DOSE.HIB_1, DOSE.HIB_2, DOSE.HIB_3],
  },
  { id: 'a_rota', name: 'Rotavirus', note: '6, 10 and 14 weeks', doses: [DOSE.ROTA_1, DOSE.ROTA_2, DOSE.ROTA_3] },
  { id: 'a_mmr1', name: 'Measles / MMR', note: 'First dose, 9 months', doses: [DOSE.MMR_1] },
];

/** Path B (3–8). */
export const B_VACCINE_QUESTIONS: VaccineQuestion[] = [
  { id: 'b_mmr2', name: 'MMR', note: 'Measles-Mumps-Rubella, 2nd dose at 15 months', doses: [DOSE.MMR_2] },
  { id: 'b_dtp_b1', name: 'DPT Booster', note: 'First booster, 18 months', doses: [DOSE.DTP_B1] },
  { id: 'b_opv_b', name: 'OPV Booster', note: 'Oral polio booster, 4–6 years', doses: [DOSE.OPV_BOOSTER] },
  { id: 'b_typhoid', name: 'Typhoid', note: 'Typhoid conjugate, 12 months', doses: [DOSE.TCV_1] },
  { id: 'b_hepa', name: 'Hepatitis A', note: '2 doses, 12 and 18 months', doses: [DOSE.HEPA_1, DOSE.HEPA_2] },
  { id: 'b_varicella1', name: 'Varicella', note: 'Chickenpox, 1st dose at 15 months', doses: [DOSE.VAR_1] },
];

/** Path C (9–15). */
export const C_VACCINE_QUESTIONS: VaccineQuestion[] = [
  { id: 'c_tdap', name: 'Tdap Booster', note: 'Tetanus-Diphtheria-Pertussis, 10 years', doses: [DOSE.TDAP] },
  { id: 'c_hpv', name: 'HPV', note: 'Human Papillomavirus, 2 doses from 10 years, 6 months apart', doses: [DOSE.HPV_1, DOSE.HPV_2] },
  // The schedule has no typhoid booster row: the answer is kept, nothing is marked.
  { id: 'c_typhoid_b', name: 'Typhoid Booster', note: 'Typhoid conjugate booster, if advised by your doctor', doses: [] },
  { id: 'c_flu', name: 'Influenza', note: 'Flu shot, recommended every year', doses: [DOSE.FLU] },
  { id: 'c_varicella2', name: 'Varicella Booster', note: 'Chickenpox 2nd dose, due at 4–6 years', doses: [DOSE.VAR_2] },
  { id: 'c_hepa2', name: 'Hepatitis A Booster', note: '2nd dose, due at 18 months', doses: [DOSE.HEPA_2] },
];

export const VACCINE_QUESTIONS_BY_PATH: Record<OnboardingPath, VaccineQuestion[]> = {
  A: A_VACCINE_QUESTIONS,
  B: B_VACCINE_QUESTIONS,
  C: C_VACCINE_QUESTIONS,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Calendar date the dose is due for this DOB (matches the DB scheduled_date). */
export function doseDueDate(dob: Date | string, dose: VaccineDose): Date {
  return addCalendar(startOfLocalDay(parseDateOnly(dob)), dose.dueAt);
}

/** True when the dose's due date is today or earlier. */
export function isDoseDue(dob: Date | string, dose: VaccineDose, now: Date = new Date()): boolean {
  return doseDueDate(dob, dose) <= startOfLocalDay(now);
}

/** The question's doses that are due by `now`. */
export function dueDoses(dob: Date | string, question: VaccineQuestion, now: Date = new Date()): VaccineDose[] {
  return question.doses.filter((dose) => isDoseDue(dob, dose, now));
}

/**
 * Questions to show for a child: those with at least one dose already due.
 * Questions with no schedule rows (doses: []) are always shown.
 */
export function questionsDueBy(
  questions: VaccineQuestion[],
  dob: Date | string,
  now: Date = new Date(),
): VaccineQuestion[] {
  return questions.filter((q) => q.doses.length === 0 || dueDoses(dob, q, now).length > 0);
}

/**
 * Dose rows to mark done at confirm: for each question on this path answered
 * "Given", only its doses already due. Answers for other paths' questions
 * (left over after a DOB change) are ignored. De-duplicated.
 */
export function givenDoseRows(
  path: OnboardingPath | null,
  answers: Record<string, VaccineAnswer | undefined>,
  dob: Date | string | null,
  now: Date = new Date(),
): VaccineDoseRow[] {
  if (!path || !dob) return [];
  const rows = new Map<string, VaccineDoseRow>();
  for (const q of VACCINE_QUESTIONS_BY_PATH[path]) {
    if (answers[q.id] !== 'Given') continue;
    for (const dose of dueDoses(dob, q, now)) {
      rows.set(`${dose.vaccineName}#${dose.doseNumber}`, {
        vaccine_name: dose.vaccineName,
        dose_number: dose.doseNumber,
      });
    }
  }
  return Array.from(rows.values());
}
