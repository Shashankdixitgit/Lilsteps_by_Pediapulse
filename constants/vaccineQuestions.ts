/**
 * Onboarding vaccination questions, each mapped to the EXACT dose rows that
 * iap_vaccine_schedule() creates (supabase/migrations/0006, calendar
 * intervals since 0014). A row is identified by vaccine_name + dose_number.
 *
 * "Given" on a question marks that question's doses already due on the
 * child's age, plus the EARLIER doses of the same series (a 2nd dose is only
 * given after the 1st), never later doses or other vaccines (R3-07).
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
  /** Dose rows this question speaks for (when due): "Given" marks them done,
   *  "Not sure" marks them 'unknown'. Empty = the vaccine has no row of its
   *  own in the app's schedule (e.g. a booster); the answer is kept for the
   *  doctor and marks only `givenImplies`. */
  doses: VaccineDose[];
  /** Extra rows a "Given" answer marks done (an earlier dose the booster
   *  implies). Other answers leave them to the baby-vaccines answer. */
  givenImplies?: VaccineDose[];
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

// Names match the Vaccines tab (vaccine_name as the schedule writes it), with
// the common Indian name in brackets where parents know it by that.

/** Path A (under 3). Shown filtered to doses due by the child's age. */
export const A_VACCINE_QUESTIONS: VaccineQuestion[] = [
  { id: 'a_bcg', name: 'BCG', note: 'Given at birth', doses: [DOSE.BCG] },
  { id: 'a_hepb', name: 'Hepatitis B', note: 'Birth, 6 weeks and 6 months', doses: [DOSE.HEPB_1, DOSE.HEPB_2, DOSE.HEPB_3] },
  { id: 'a_opv', name: 'OPV (polio drops)', note: 'Oral polio, birth dose', doses: [DOSE.OPV_0] },
  { id: 'a_ipv', name: 'IPV', note: 'Injectable polio, 6, 10 and 14 weeks', doses: [DOSE.IPV_1, DOSE.IPV_2, DOSE.IPV_3] },
  {
    id: 'a_penta',
    name: 'DTwP/DTaP and Hib (Pentavalent)',
    note: 'Often given as one combined shot, 6, 10 and 14 weeks',
    doses: [DOSE.DTP_1, DOSE.DTP_2, DOSE.DTP_3, DOSE.HIB_1, DOSE.HIB_2, DOSE.HIB_3],
  },
  { id: 'a_rota', name: 'Rotavirus', note: 'Oral drops, 6, 10 and 14 weeks', doses: [DOSE.ROTA_1, DOSE.ROTA_2, DOSE.ROTA_3] },
  { id: 'a_pcv', name: 'PCV', note: 'Pneumococcal, 6, 10 and 14 weeks, booster at 15 months', doses: [DOSE.PCV_1, DOSE.PCV_2, DOSE.PCV_3, DOSE.PCV_B] },
  { id: 'a_mmr1', name: 'MMR', note: 'Measles-Mumps-Rubella, first dose at 9 months', doses: [DOSE.MMR_1] },
  { id: 'a_tcv', name: 'Typhoid Conjugate', note: 'Typhoid, 12 months', doses: [DOSE.TCV_1] },
  { id: 'a_hepa', name: 'Hepatitis A', note: '12 and 18 months', doses: [DOSE.HEPA_1, DOSE.HEPA_2] },
];

/** Path B (3–8). */
export const B_VACCINE_QUESTIONS: VaccineQuestion[] = [
  { id: 'b_mmr2', name: 'MMR (2nd dose)', note: 'Measles-Mumps-Rubella, 15 months', doses: [DOSE.MMR_2] },
  { id: 'b_dtp_b1', name: 'DTwP/DTaP booster', note: 'DPT first booster, 18 months', doses: [DOSE.DTP_B1] },
  { id: 'b_opv_b', name: 'OPV booster', note: 'Oral polio booster, 4–6 years', doses: [DOSE.OPV_BOOSTER] },
  { id: 'b_typhoid', name: 'Typhoid Conjugate', note: 'Typhoid, 12 months', doses: [DOSE.TCV_1] },
  { id: 'b_hepa', name: 'Hepatitis A', note: '2 doses, 12 and 18 months', doses: [DOSE.HEPA_1, DOSE.HEPA_2] },
  { id: 'b_varicella1', name: 'Varicella', note: 'Chickenpox, 1st dose at 15 months', doses: [DOSE.VAR_1] },
];

/** Path C (9–15). */
export const C_VACCINE_QUESTIONS: VaccineQuestion[] = [
  { id: 'c_tdap', name: 'Tdap', note: 'Tetanus-Diphtheria-Pertussis booster, 10 years', doses: [DOSE.TDAP] },
  { id: 'c_hpv', name: 'HPV', note: 'Human Papillomavirus, 2 doses from 10 years, 6 months apart', doses: [DOSE.HPV_1, DOSE.HPV_2] },
  // The schedule has one typhoid row (the conjugate dose) and no booster row.
  // A booster "Given" means that first dose was given too; "Not sure" about
  // a booster says nothing about the first dose, so it touches no row.
  {
    id: 'c_typhoid_b',
    name: 'Typhoid Conjugate booster',
    note: 'If advised by your doctor',
    doses: [],
    givenImplies: [DOSE.TCV_1],
  },
  { id: 'c_flu', name: 'Influenza', note: 'Flu shot, recommended every year', doses: [DOSE.FLU] },
  { id: 'c_varicella2', name: 'Varicella (2nd dose)', note: 'Chickenpox, due at 4–6 years', doses: [DOSE.VAR_2] },
  { id: 'c_hepa2', name: 'Hepatitis A (2nd dose)', note: 'Due at 18 months', doses: [DOSE.HEPA_2] },
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
 * Series where a later dose implies the earlier ones were given. OPV is left
 * out (a 5-year booster says nothing about the birth dose), as is the yearly
 * flu shot.
 */
const SERIES_IMPLIES_EARLIER = new Set([
  'Hepatitis B', 'DTwP/DTaP', 'IPV', 'Hib', 'Rotavirus', 'PCV',
  'MMR', 'Hepatitis A', 'Varicella', 'HPV',
]);

/** The dose itself plus, for a series, its earlier doses in the schedule. */
export function doseWithEarlier(dose: VaccineDose): VaccineDose[] {
  if (!SERIES_IMPLIES_EARLIER.has(dose.vaccineName)) return [dose];
  return SCHEDULE_DOSES.filter((s) => s.vaccineName === dose.vaccineName && s.doseNumber <= dose.doseNumber);
}

/**
 * Dose rows to mark done at confirm: for each question on this path answered
 * "Given", its doses already due, plus the earlier doses of the same series
 * (MMR 2 marks MMR 1; DPT booster marks DPT 1-3). Answers for other paths'
 * questions (left over after a DOB change) are ignored. De-duplicated. The
 * confirm screen counts this same list, so its text matches what is marked.
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
    const implied = (q.givenImplies ?? []).filter((dose) => isDoseDue(dob, dose, now));
    for (const due of [...dueDoses(dob, q, now), ...implied]) {
      for (const dose of doseWithEarlier(due)) {
        rows.set(`${dose.vaccineName}#${dose.doseNumber}`, {
          vaccine_name: dose.vaccineName,
          dose_number: dose.doseNumber,
        });
      }
    }
  }
  return Array.from(rows.values());
}

// ─── Older children: "Were baby vaccines completed?" (C3) ────────────────────

/**
 * Paths B and C ask once whether the early vaccines were completed, instead
 * of listing every infant dose (an 8-year-old otherwise showed ~30 "overdue"
 * baby doses). Path A asks it too from 12 months, next to the per-vaccine
 * questions. Approved default (C3):
 * - Yes            → those doses are marked given (date not known).
 * - No / Not sure  → saved as 'unknown' (0024): listed to discuss with the
 *                    doctor as catch-up, never as red "overdue".
 * - Not answered   → treated as Not sure.
 * A per-vaccine answer on the same screen always wins for its own doses.
 */
export const BABY_VACCINE_ANSWERS = ['Yes', 'No', 'Not sure'] as const;
export type BabyVaccineAnswer = (typeof BABY_VACCINE_ANSWERS)[number];

export interface BabyVaccinesQuestion {
  /** The question shown to the parent. */
  title: string;
  /** Short note under it. */
  note: string;
  /** Doses due before this age (from birth) are covered by the answer. */
  before: DueAt;
  /** Only asked from this age (path A: a young baby answers each dose). The
   *  covered doses are still saved as 'unknown' when it isn't asked. */
  askFrom?: DueAt;
}

/**
 * The yearly flu shot is not a "baby vaccine": the schedule has one row for
 * it at 6 months, which would otherwise read "Overdue, due 2013" for a teen.
 * It is never covered by the baby-vaccines answer, never saved as 'unknown',
 * and the Vaccines tab shows it as a yearly dose, never overdue.
 */
export const ANNUAL_VACCINE_NAMES: ReadonlySet<string> = new Set(['Influenza']);

export const BABY_VACCINES_QUESTION: Partial<Record<OnboardingPath, BabyVaccinesQuestion>> = {
  // Path A (under 3): every dose due so far. A dose the parent doesn't
  // answer one by one is covered by this answer; under 12 months (or when
  // not answered) that means 'unknown' (catch-up to discuss), never overdue.
  A: {
    title: 'Were all the vaccines due so far given?',
    note: 'Every dose due from birth until now. Check the vaccination card if you have it. Your answers for specific vaccines below take priority.',
    before: { years: 3 },
    askFrom: { months: 12 },
  },
  // Both paths cover every dose due so far up to the school-entry boosters
  // (5 years): a 6–15-year-old would otherwise still see those as overdue.
  B: {
    title: 'Were all baby vaccines completed?',
    note: 'All the vaccines due so far, from birth up to the school-entry boosters at 5 years. Check the vaccination card if you have it.',
    before: { years: 6 },
  },
  C: {
    title: 'Were all baby and early-childhood vaccines completed?',
    note: 'The vaccines from birth to 6 years, including the school-entry boosters. Check the vaccination card if you have it.',
    before: { years: 6 },
  },
};

/**
 * The baby-vaccines question to SHOW for this child, or undefined (path A
 * under 12 months, or no DOB yet). Screens, confirm and the doctor's summary
 * all use this, so an answer given before a DOB change is ignored.
 */
export function babyVaccinesQuestionFor(
  path: OnboardingPath | null,
  dob: Date | string | null,
  now: Date = new Date(),
): BabyVaccinesQuestion | undefined {
  const q = path ? BABY_VACCINES_QUESTION[path] : undefined;
  if (!q) return undefined;
  if (!q.askFrom) return q;
  if (!dob) return undefined;
  const from = addCalendar(startOfLocalDay(parseDateOnly(dob)), q.askFrom);
  return from <= startOfLocalDay(now) ? q : undefined;
}

/**
 * True when a "Yes" to the baby-vaccines question already speaks for every
 * dose of this question (all due before the question's age limit), so the
 * screen can fold it away after "Yes" (R2-20). Boosters with no row of their
 * own, the yearly flu shot and later doses (Tdap, HPV) are never covered.
 */
export function coveredByBabyAnswer(
  path: OnboardingPath | null,
  dob: Date | string | null,
  question: VaccineQuestion,
): boolean {
  const q = path ? BABY_VACCINES_QUESTION[path] : undefined;
  if (!q || !dob || question.doses.length === 0) return false;
  const birth = startOfLocalDay(parseDateOnly(dob));
  const limit = addCalendar(birth, q.before);
  return question.doses.every(
    (dose) => !ANNUAL_VACCINE_NAMES.has(dose.vaccineName) && doseDueDate(birth, dose) < limit,
  );
}

/** Schedule doses the baby-vaccines answer covers for this child (already due). */
export function babyVaccineDoses(
  path: OnboardingPath | null,
  dob: Date | string | null,
  now: Date = new Date(),
): VaccineDose[] {
  const q = path ? BABY_VACCINES_QUESTION[path] : undefined;
  if (!q || !dob) return [];
  const birth = startOfLocalDay(parseDateOnly(dob));
  const limit = addCalendar(birth, q.before);
  return SCHEDULE_DOSES.filter(
    (dose) => !ANNUAL_VACCINE_NAMES.has(dose.vaccineName) && doseDueDate(birth, dose) < limit && isDoseDue(birth, dose, now),
  );
}

export interface OnboardingVaccinePlan {
  /** Rows to mark 'done' (date not known). */
  given: VaccineDoseRow[];
  /** Rows to mark 'unknown': not sure / not completed, to discuss with the doctor. */
  unknown: VaccineDoseRow[];
  /** Of `given`, how many came from the baby-vaccines "Yes". */
  babyGiven: number;
  /** Of `unknown`, how many came from the baby-vaccines answer. */
  babyUnknown: number;
}

const rowKey = (r: { vaccine_name?: string; vaccineName?: string; dose_number?: number; doseNumber?: number }) =>
  `${r.vaccine_name ?? r.vaccineName}#${r.dose_number ?? r.doseNumber}`;

/**
 * Every dose row onboarding changes, worked out once (confirm saves exactly
 * this and its summary counts it):
 * 1. Per-vaccine "Given" (givenDoseRows) → done.
 * 2. Per-vaccine "Not sure" → unknown (unless also given above).
 * 3. Baby-vaccines answer for the remaining covered doses that no per-vaccine
 *    answer touched: Yes → done; No / Not sure / unanswered / not asked
 *    (path A under 12 months) → unknown. On path A that is every due dose
 *    the parent skipped, so nothing unanswered shows as red "overdue" (O2).
 * 4. A shown question left unanswered → its due doses unknown (when the
 *    baby-vaccines answer doesn't cover them).
 * A per-vaccine "Missed" leaves its doses to the schedule (overdue), except
 * the yearly flu shot, which is never overdue (ANNUAL_VACCINE_NAMES).
 */
export function onboardingVaccinePlan(
  path: OnboardingPath | null,
  answers: Record<string, VaccineAnswer | undefined>,
  babyAnswer: BabyVaccineAnswer | '' | undefined,
  dob: Date | string | null,
  now: Date = new Date(),
): OnboardingVaccinePlan {
  const empty: OnboardingVaccinePlan = { given: [], unknown: [], babyGiven: 0, babyUnknown: 0 };
  if (!path || !dob) return empty;
  const given = new Map<string, VaccineDoseRow>();
  for (const r of givenDoseRows(path, answers, dob, now)) given.set(rowKey(r), r);

  // Doses any per-vaccine answer on this path speaks for.
  const answered = new Set<string>();
  const unknown = new Map<string, VaccineDoseRow>();
  // Due doses of questions shown but left unanswered: 'unknown' (O2), like
  // the baby-vaccines "Not sure", never red "overdue".
  const skipped: VaccineDose[] = [];
  for (const q of VACCINE_QUESTIONS_BY_PATH[path]) {
    const a = answers[q.id];
    if (!a) {
      skipped.push(...dueDoses(dob, q, now));
      continue;
    }
    for (const dose of dueDoses(dob, q, now)) {
      const key = rowKey(dose);
      answered.add(key);
      if (a === 'Not sure' && !given.has(key) && !ANNUAL_VACCINE_NAMES.has(dose.vaccineName)) {
        unknown.set(key, { vaccine_name: dose.vaccineName, dose_number: dose.doseNumber });
      }
    }
  }

  for (const dose of skipped) {
    const key = rowKey(dose);
    if (given.has(key) || answered.has(key) || ANNUAL_VACCINE_NAMES.has(dose.vaccineName)) continue;
    // Path A's skipped infant doses are left to the baby-vaccines answer below.
    if (babyVaccineDoses(path, dob, now).some((d) => rowKey(d) === key)) continue;
    unknown.set(key, { vaccine_name: dose.vaccineName, dose_number: dose.doseNumber });
  }

  let babyGiven = 0;
  let babyUnknown = 0;
  // An answer only counts while the question is shown for this DOB.
  const baby = babyVaccinesQuestionFor(path, dob, now) ? babyAnswer : '';
  for (const dose of babyVaccineDoses(path, dob, now)) {
    const key = rowKey(dose);
    if (given.has(key) || answered.has(key)) continue;
    const row = { vaccine_name: dose.vaccineName, dose_number: dose.doseNumber };
    if (baby === 'Yes') {
      given.set(key, row);
      babyGiven += 1;
    } else {
      unknown.set(key, row);
      babyUnknown += 1;
    }
  }
  return { given: Array.from(given.values()), unknown: Array.from(unknown.values()), babyGiven, babyUnknown };
}

// ─── After-vaccine fever tip (pending clinical sign-off) ─────────────────────

/**
 * PENDING C5 SIGN-OFF (Dr Atish): fever thresholds shown on the Vaccines tab.
 * Under 3 months any fever of 38°C / 100.4°F needs a call to the doctor (AAP /
 * IMNCI); 101°F stays for older children until reviewed. Listed with the other
 * C5 items; do not change the wording without clinical review.
 */
export const FEVER_TIP_PENDING_SIGN_OFF = true;
export const FEVER_TIP_UNDER_3_MONTHS =
  'Under 3 months: call your pediatrician for any fever of 100.4°F (38°C) or more.';
export const FEVER_TIP_AFTER_VACCINE =
  'Minor fever after DTP/Pentavalent is common. Apply a cold compress on the injection site if swelling occurs.';
export const FEVER_TIP_OLDER = 'Contact your pediatrician if fever goes above 101°F (38.3°C).';
