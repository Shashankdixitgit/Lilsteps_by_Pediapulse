import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Platform } from 'react-native';

import {
  babyVaccinesQuestionFor,
  onboardingVaccinePlan,
  VACCINE_QUESTIONS_BY_PATH,
  type BabyVaccineAnswer,
  type OnboardingVaccinePlan,
  type VaccineAnswer,
  type VaccineDoseRow,
} from '@/constants/vaccineQuestions';
import { useAuth } from '@/context/auth';
import { getAgeParts, type OnboardingPath } from '@/lib/age';
import { parseDateOnly, toDateOnlyString } from '@/lib/date';
import { dbg } from '@/lib/debug';

/**
 * Every onboarding answer lives here, in memory, for the whole flow.
 * Each screen INITIALISES from this context and WRITES BACK on change, so
 * going Back and forward never shows empty screens or overwrites earlier
 * answers with blanks.
 *
 * Conventions:
 * - Single-select chips are stored as a string ('' = not answered). Screens
 *   pass `value ? [value] : []` to ChipGroup and `vals[0] ?? ''` back.
 * - Multi-select chips are stored as string[] exactly as selected (including
 *   'None' / 'Not known' / 'Other'), so the screen can be restored as it was.
 * - Text inputs are stored as the raw string the parent typed.
 * The path-specific answers are saved on confirm as children.onboarding_answers
 * (C1, 0031) in plain labels, for the child's doctor: see buildOnboardingAnswers.
 *
 * The answers are also kept as a draft on the device (per signed-in user),
 * so closing or reloading the app mid-flow does not lose them. The draft is
 * restored when onboarding opens and cleared once confirm has saved.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Onboarding path: A (<3y), B (3–8y), C (9–15y). Same as lib/age OnboardingPath. */
export type AgeBracket = OnboardingPath | null;
export type ChildSex = 'male' | 'female' | null;

export interface ParentAnswers {
  name: string;
  /** City chip ('' = not answered). */
  city: string;
  /** City typed when the chip is 'Other'. */
  cityOther: string;
  /** Preferred language chip ('' = not answered). */
  language: string;
}

/** City to save on parents.city: the typed city when the chip is 'Other'. */
export function parentCity(parent: ParentAnswers): string {
  const city = parent.city === 'Other' ? parent.cityOther.trim() : parent.city.trim();
  return city;
}

export type AllergyGroup = 'medication' | 'food' | 'environmental';

/** Chip labels with special meaning on the allergies screen. */
export const ALLERGY_NONE = 'None';
export const ALLERGY_NOT_KNOWN = 'Not known';
export const ALLERGY_OTHER = 'Other';

export interface AllergyGroupAnswer {
  /** Raw chip selection, incl. 'None' / 'Not known' / 'Other'. */
  selected: string[];
  /** Text typed for 'Other'. */
  other: string;
}

export type AllergyAnswers = Record<AllergyGroup, AllergyGroupAnswer>;

/** One allergy to save: `type` is the group it came from (allergies.type). */
export interface AllergyEntry {
  name: string;
  type: AllergyGroup;
}

/**
 * Overall allergy answer:
 * - 'has'        at least one allergy named
 * - 'none'       every group answered 'None' (explicit "no known allergies")
 * - 'unknown'    'Not known' somewhere, or only some groups answered
 * - 'unanswered' nothing selected at all
 * Never show "No known allergies" unless status is 'none'.
 */
export type AllergyStatus = 'has' | 'none' | 'unknown' | 'unanswered';

export interface MedicationEntry {
  name: string;
  /** Free text, e.g. "100mg", "5ml". Saved to medications.dosage. */
  dose: string;
  /** Frequency chip ('' = not answered). */
  frequency: string;
}

export interface ConditionsAnswers {
  /** Raw chip selection, incl. 'None' / 'Other'. */
  selected: string[];
  /** Text typed for 'Other'. */
  other: string;
  /** 'Yes' | 'No' | '' (regular medicines?). */
  takingMeds: string;
  /** Medicine cards as entered (may include blank cards). */
  medications: MedicationEntry[];
}

// Path A
export interface ABirthHistoryAnswers {
  term: string;
  /** Gestation weeks, when premature. */
  weeks: string;
  delivery: string;
  /** kg, raw text. */
  birthWeight: string;
  complications: string[];
}
export interface AFeedingAnswers {
  /** Multi-select (O3): e.g. ['Breastfed', 'Formula']. */
  feeding: string[];
  difficulties: string[];
}
export const FEEDING_SOLIDS = 'Solid foods started';
export const FEEDING_OPTIONS = ['Breastfed', 'Formula', FEEDING_SOLIDS];
/** Solids aren't offered before about 4 months (WHO/IAP advise from 6). */
export const FEEDING_SOLIDS_FROM_MONTHS = 4;

/** Older drafts saved feeding as one chip ('Both' = breast milk + formula). */
function normaliseFeeding(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value !== 'string' || !value) return [];
  return value === 'Both' ? ['Breastfed', 'Formula'] : [value];
}
export interface AMilestonesAnswers {
  /** Includes MILESTONE_NONE when the parent picks "None yet". */
  achieved: string[];
}
export const MILESTONE_NONE = 'None yet';
export interface ASleepAnswers {
  hours: string;
  concerns: string[];
}

// Path B
export interface BDevelopmentAnswers {
  devConditions: string[];
  /** Text for the 'Other' developmental condition. */
  devOther: string;
  school: string;
  schoolConcerns: string[];
}
export interface BDietActivityAnswers {
  diet: string;
  picky: string;
  pickyDetails: string;
  activity: string;
  screenTime: string;
}
export interface BSleepDentalAnswers {
  hours: string;
  sleepConcerns: string[];
  dentalVisit: string;
  dentalConcerns: string[];
}

// Path C
export interface CAcademicAnswers {
  grade: string;
  stress: string;
  sports: string;
  frequency: string;
  screenTime: string;
}
export interface CDietAnswers {
  diet: string;
  caffeine: string;
  bodyImage: string;
}
export interface CPubertyAnswers {
  menstruation: string;
  regular: string;
  pain: string;
  painDetails: string;
  growthConcerns: string;
  acne: string;
}
export interface CMentalHealthAnswers {
  moodChanges: string;
  moodDetails: string;
  anxietyHistory: string;
}
export interface CSleepAnswers {
  hours: string;
  concerns: string[];
}

/** All object-shaped answer sections, updated with `updateSection`. */
export interface OnboardingSections {
  parent: ParentAnswers;
  conditionsAnswers: ConditionsAnswers;
  aBirthHistory: ABirthHistoryAnswers;
  aFeeding: AFeedingAnswers;
  aMilestones: AMilestonesAnswers;
  aSleep: ASleepAnswers;
  bDevelopment: BDevelopmentAnswers;
  bDietActivity: BDietActivityAnswers;
  bSleepDental: BSleepDentalAnswers;
  cAcademic: CAcademicAnswers;
  cDiet: CDietAnswers;
  cPuberty: CPubertyAnswers;
  cMentalHealth: CMentalHealthAnswers;
  cSleep: CSleepAnswers;
}
export type OnboardingSectionKey = keyof OnboardingSections;

export const EMPTY_MEDICATION: MedicationEntry = { name: '', dose: '', frequency: '' };

const EMPTY_SECTIONS: OnboardingSections = {
  parent: { name: '', city: '', cityOther: '', language: '' },
  conditionsAnswers: { selected: [], other: '', takingMeds: '', medications: [EMPTY_MEDICATION] },
  aBirthHistory: { term: '', weeks: '', delivery: '', birthWeight: '', complications: [] },
  aFeeding: { feeding: [], difficulties: [] },
  aMilestones: { achieved: [] },
  aSleep: { hours: '', concerns: [] },
  bDevelopment: { devConditions: [], devOther: '', school: '', schoolConcerns: [] },
  bDietActivity: { diet: '', picky: '', pickyDetails: '', activity: '', screenTime: '' },
  bSleepDental: { hours: '', sleepConcerns: [], dentalVisit: '', dentalConcerns: [] },
  cAcademic: { grade: '', stress: '', sports: '', frequency: '', screenTime: '' },
  cDiet: { diet: '', caffeine: '', bodyImage: '' },
  cPuberty: { menstruation: '', regular: '', pain: '', painDetails: '', growthConcerns: '', acne: '' },
  cMentalHealth: { moodChanges: '', moodDetails: '', anxietyHistory: '' },
  cSleep: { hours: '', concerns: [] },
};

const EMPTY_ALLERGIES: AllergyAnswers = {
  medication: { selected: [], other: '' },
  food: { selected: [], other: '' },
  environmental: { selected: [], other: '' },
};

// ─── Pure derivations (exported for confirm and tests) ───────────────────────

const ALLERGY_GROUPS: AllergyGroup[] = ['medication', 'food', 'environmental'];

/** Named allergies with their group; 'None' / 'Not known' / 'Other' chips are
 *  dropped and the 'Other' text is used instead. Case-insensitive de-dup per group. */
export function deriveAllergyList(answers: AllergyAnswers): AllergyEntry[] {
  const out: AllergyEntry[] = [];
  for (const type of ALLERGY_GROUPS) {
    const { selected, other } = answers[type];
    const names = selected.filter((s) => s !== ALLERGY_NONE && s !== ALLERGY_NOT_KNOWN && s !== ALLERGY_OTHER);
    if (selected.includes(ALLERGY_OTHER) && other.trim()) names.push(other.trim());
    const seen = new Set<string>();
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, type });
    }
  }
  return out;
}

export function deriveAllergyStatus(answers: AllergyAnswers): AllergyStatus {
  if (deriveAllergyList(answers).length > 0) return 'has';
  const groups = ALLERGY_GROUPS.map((g) => answers[g].selected);
  if (groups.every((s) => s.includes(ALLERGY_NONE))) return 'none';
  if (groups.some((s) => s.length > 0)) return 'unknown';
  return 'unanswered';
}

/** Plausible birth weight range (kg): extremely preterm to very large babies. */
export const BIRTH_WEIGHT_MIN_KG = 0.4;
export const BIRTH_WEIGHT_MAX_KG = 6.5;

/**
 * Birth weight in kg when it is a plausible number, else null. Saved as the
 * first growth row, dated the DOB (G1), so the chart starts at birth.
 */
export function parseBirthWeight(raw: string): number | null {
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= BIRTH_WEIGHT_MIN_KG && n <= BIRTH_WEIGHT_MAX_KG ? n : null;
}

/** Condition names to save ('None' dropped, 'Other' replaced by its text). */
export function deriveConditionList(answers: ConditionsAnswers): string[] {
  const names = answers.selected.filter((c) => c !== 'None' && c !== 'Other');
  if (answers.selected.includes('Other') && answers.other.trim()) names.push(answers.other.trim());
  return names;
}

/**
 * Medicine cards with a dose or frequency but no name (O3): they can't be
 * saved as a medicine, so the conditions screen asks for the name instead of
 * dropping them silently.
 */
export function medicationsMissingName(answers: ConditionsAnswers): number[] {
  if (answers.takingMeds !== 'Yes') return [];
  return answers.medications
    .map((m, i) => (!m.name.trim() && (m.dose.trim() || m.frequency) ? i : -1))
    .filter((i) => i >= 0);
}

/** Medicines to save: only when takingMeds is 'Yes', only cards with a name. */
export function deriveMedicationList(answers: ConditionsAnswers): MedicationEntry[] {
  if (answers.takingMeds !== 'Yes') return [];
  return answers.medications
    .filter((m) => m.name.trim())
    .map((m) => ({ name: m.name.trim(), dose: m.dose.trim(), frequency: m.frequency }));
}

// ─── Answers saved for the doctor (C1) ───────────────────────────────────────

/** One answered question, in the words the parent saw. */
export interface OnboardingAnswerItem {
  label: string;
  value: string;
}
export interface OnboardingAnswerSection {
  title: string;
  items: OnboardingAnswerItem[];
}
/** children.onboarding_answers (0031), shape v1. */
export interface OnboardingAnswersRecord {
  v: 1;
  path: OnboardingPath;
  saved_at: string;
  sections: OnboardingAnswerSection[];
  /** The path's sections as entered, for later use. */
  raw: Record<string, unknown>;
}

/** Section keys that belong to each path (the common ones are saved elsewhere). */
const PATH_SECTION_KEYS: Record<OnboardingPath, OnboardingSectionKey[]> = {
  A: ['aBirthHistory', 'aFeeding', 'aMilestones', 'aSleep'],
  B: ['bDevelopment', 'bDietActivity', 'bSleepDental'],
  C: ['cAcademic', 'cDiet', 'cPuberty', 'cMentalHealth', 'cSleep'],
};

/** Multi-select as text: 'Other' replaced by the typed text, blanks dropped. */
function listText(selected: string[], other = ''): string {
  const names = selected.filter((v) => v !== 'Other');
  if (selected.includes('Other')) names.push(other.trim() ? other.trim() : 'Other');
  return names.join(', ');
}

/** Build a section from [label, value] pairs, keeping only answered ones. */
function section(title: string, pairs: [string, string][]): OnboardingAnswerSection | null {
  const items = pairs
    .map(([label, value]) => ({ label, value: value.trim() }))
    .filter((i) => i.value);
  return items.length > 0 ? { title, items } : null;
}

export interface BuildOnboardingAnswersInput {
  path: OnboardingPath;
  childSex: ChildSex;
  sections: OnboardingSections;
  vaccineAnswers: Record<string, VaccineAnswer | undefined>;
  babyVaccines: BabyVaccineAnswer | '';
  /** Vaccine question ids shown to this child (due by the DOB). */
  shownVaccineIds: string[];
  /** Child's date of birth: decides whether the baby-vaccines question was asked. */
  dob?: Date | null;
  /** Allergy answers: a group answered "Not known" is kept for the doctor even
   *  when another group names an allergy (O3); allergy rows alone can't say it. */
  allergyAnswers?: AllergyAnswers;
  now?: Date;
}

/** Section title for the allergy note in onboarding_answers (not a path screen). */
export const ALLERGY_NOTE_SECTION = 'Allergies not known yet';
/** Section title for the vaccines in onboarding_answers. */
export const VACCINES_SECTION = 'Vaccines (as reported by the parent)';
const ALLERGY_NOTE_LABEL: Record<AllergyGroup, string> = {
  medication: 'Medication allergies',
  food: 'Food allergies',
  environmental: 'Other allergies',
};

/**
 * The path-specific answers as the child's doctor sees them (C1): plain
 * question labels from the screens, only questions that were shown and
 * answered. Labels here must match the screens' wording.
 */
export function buildOnboardingAnswers(input: BuildOnboardingAnswersInput): OnboardingAnswersRecord {
  const { path, childSex, sections: s, vaccineAnswers, babyVaccines, shownVaccineIds } = input;
  const now = input.now ?? new Date();
  const out: (OnboardingAnswerSection | null)[] = [];

  if (path === 'A') {
    const ageMonths = input.dob ? getAgeParts(input.dob, now)?.totalMonths : undefined;
    const youngBaby = ageMonths !== undefined && ageMonths < FEEDING_SOLIDS_FROM_MONTHS;
    const b = s.aBirthHistory;
    const weeks = b.weeks.trim();
    out.push(section('Birth history', [
      ['Full term or premature?', b.term === 'Premature' && weeks ? `Premature, ${weeks} weeks` : b.term],
      ['Mode of delivery', b.delivery],
      ['Birth weight', b.birthWeight.trim() ? `${b.birthWeight.trim()} kg` : ''],
      ['Any birth complications?', listText(b.complications)],
    ]));
    out.push(section('Feeding', [
      // Solids aren't offered under 4 months (a-feeding), even if picked before a DOB change.
      ['Current feeding', listText(s.aFeeding.feeding.filter((f) => f !== FEEDING_SOLIDS || !youngBaby))],
      ['Any feeding difficulties?', listText(s.aFeeding.difficulties)],
    ]));
    // The checklist is age-specific (constants/milestones); the ticks are the answer.
    out.push(section('Milestones', [['What the child can do (ticked by the parent)', listText(s.aMilestones.achieved)]]));
    out.push(section('Sleep', [
      ['Average sleep hours per day', s.aSleep.hours],
      ['Any sleep concerns?', listText(s.aSleep.concerns)],
    ]));
  } else if (path === 'B') {
    const d = s.bDevelopment;
    const da = s.bDietActivity;
    out.push(section('Development', [
      ['Any diagnosed developmental conditions?', listText(d.devConditions, d.devOther)],
      ['Attending school or daycare?', d.school],
      ['Any school concerns flagged?', listText(d.schoolConcerns)],
    ]));
    out.push(section('Diet and activity', [
      ['Diet type', da.diet],
      ['Extremely picky eater or major food aversions?', da.picky],
      ['Foods the child avoids', da.picky === 'Yes' ? da.pickyDetails : ''],
      ['Physical activity level', da.activity],
      ['Average daily screen time', da.screenTime],
    ]));
    out.push(section('Sleep and dental', [
      ['Sleep hours per night', s.bSleepDental.hours],
      ['Any sleep concerns?', listText(s.bSleepDental.sleepConcerns)],
      ['Last dental visit', s.bSleepDental.dentalVisit],
      ['Dental concerns', listText(s.bSleepDental.dentalConcerns)],
    ]));
  } else {
    const a = s.cAcademic;
    const p = s.cPuberty;
    const m = s.cMentalHealth;
    const female = childSex === 'female';
    const periods = female && p.menstruation === 'Yes';
    out.push(section('School and lifestyle', [
      ['Current school grade', a.grade],
      ['Academic stress level (as observed by the parent)', a.stress],
      ['Sports or physical activity', a.sports],
      ['Activity frequency', a.frequency],
      ['Daily screen time', a.screenTime],
    ]));
    out.push(section('Diet', [
      ['Diet type', s.cDiet.diet],
      ['Regular caffeine (tea or coffee)?', s.cDiet.caffeine],
      ['Any dieting, food restriction, or body image concerns noticed?', s.cDiet.bodyImage],
    ]));
    out.push(section('Puberty and development', [
      ['Has menstruation started?', female ? p.menstruation : ''],
      ['Are periods regular?', periods ? p.regular : ''],
      ['Any pain or irregularity?', periods ? p.pain : ''],
      ['Pain or irregularity described', periods && p.pain === 'Yes' ? p.painDetails : ''],
      ['Any concerns about growth or physical development?', childSex === 'male' ? p.growthConcerns : ''],
      ['Acne or significant skin concerns?', p.acne],
    ]));
    out.push(section('Mental wellbeing', [
      ['Any recent changes in mood, social withdrawal, or behaviour?', m.moodChanges],
      ['What the parent noticed', m.moodChanges === 'Yes' ? m.moodDetails : ''],
      ['Any history of anxiety or depression?', m.anxietyHistory],
    ]));
    out.push(section('Sleep', [
      ['Sleep hours on school nights', s.cSleep.hours],
      ['Any sleep concerns?', listText(s.cSleep.concerns)],
    ]));
  }

  // "Not known" allergy groups (the named allergies are saved as rows).
  if (input.allergyAnswers) {
    const answers = input.allergyAnswers;
    out.push(section(ALLERGY_NOTE_SECTION, ALLERGY_GROUPS.map((g): [string, string] => [
      ALLERGY_NOTE_LABEL[g],
      answers[g].selected.includes(ALLERGY_NOT_KNOWN) ? 'Not known yet (parent not sure)' : '',
    ])));
  }

  // Vaccines, as the parent reported them (the schedule itself is on the dashboard too).
  const baby = babyVaccinesQuestionFor(path, input.dob ?? null, now);
  const shown = new Set(shownVaccineIds);
  const vaccinePairs: [string, string][] = [];
  if (baby) vaccinePairs.push([baby.title, babyVaccines || 'Not answered']);
  for (const q of VACCINE_QUESTIONS_BY_PATH[path]) {
    if (!shown.has(q.id)) continue;
    const a = vaccineAnswers[q.id];
    if (a) vaccinePairs.push([q.name, a]);
  }
  out.push(section(VACCINES_SECTION, vaccinePairs));

  const raw: Record<string, unknown> = {};
  for (const k of PATH_SECTION_KEYS[path]) raw[k] = s[k];
  if (baby) raw.babyVaccines = babyVaccines;
  raw.vaccineAnswers = Object.fromEntries(
    Object.entries(vaccineAnswers).filter(([id, a]) => a && shown.has(id)),
  );

  return {
    v: 1,
    path,
    saved_at: now.toISOString(),
    sections: out.filter((x): x is OnboardingAnswerSection => x !== null),
    raw,
  };
}

// ─── Draft on the device ─────────────────────────────────────────────────────

/** Bump when the draft shape changes; older drafts are then ignored. */
const DRAFT_VERSION = 1;
/** SecureStore allows 2048 bytes per item on iOS, so long drafts are chunked. */
const DRAFT_CHUNK = 1800;

interface OnboardingDraft {
  v: number;
  childName: string;
  bracket: AgeBracket;
  childSex: ChildSex;
  /** 'YYYY-MM-DD' (local date) or null. */
  dob: string | null;
  relationship: string;
  weight: string;
  height: string;
  bloodGroup: string;
  allergyAnswers: AllergyAnswers;
  vaccineAnswers: Record<string, VaccineAnswer | undefined>;
  /** Paths B/C "Were baby vaccines completed?" ('' = not answered). Optional:
   *  drafts saved before it existed simply lack it. */
  babyVaccines?: BabyVaccineAnswer | '';
  sections: OnboardingSections;
}

/**
 * Delete a user's saved onboarding draft. Call on sign-out (Profile), so a
 * half-finished onboarding never carries over to the next sign-in on this
 * device (R2-25). The provider only lives inside the onboarding stack, so
 * this is a plain function, not part of the context.
 */
export async function clearOnboardingDraft(userId: string): Promise<void> {
  await draftStore.remove(draftKey(userId));
}

function draftKey(userId: string): string {
  // SecureStore keys: letters, digits, '.', '-' and '_' only.
  return `lilsteps_onboarding_draft_${userId.replace(/[^A-Za-z0-9._-]/g, '')}`;
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls && typeof ls.getItem === 'function' ? ls : null;
  } catch {
    return null;
  }
}

/** Every draft read / write is best effort: a failure only means no draft. */
const draftStore = {
  async get(key: string): Promise<string | null> {
    try {
      const web = webStorage();
      if (Platform.OS === 'web') return web ? web.getItem(key) : null;
      const raw = await SecureStore.getItemAsync(key);
      if (raw === null || !raw.startsWith('__chunked__:')) return raw;
      const count = parseInt(raw.split(':')[1], 10);
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        webStorage()?.setItem(key, value);
        return;
      }
      if (value.length <= DRAFT_CHUNK) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
      const parts = value.match(new RegExp(`[\\s\\S]{1,${DRAFT_CHUNK}}`, 'g')) ?? [];
      await Promise.all(parts.map((part, i) => SecureStore.setItemAsync(`${key}_chunk_${i}`, part)));
      await SecureStore.setItemAsync(key, `__chunked__:${parts.length}`);
    } catch (e) {
      dbg.dbError('Onboarding draft: save failed', e);
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        webStorage()?.removeItem(key);
        return;
      }
      const raw = await SecureStore.getItemAsync(key);
      if (raw?.startsWith('__chunked__:')) {
        const count = parseInt(raw.split(':')[1], 10);
        await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}_chunk_${i}`)));
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Nothing to clear.
    }
  },
};

/** Parse a stored draft; null when missing, corrupt or from an older shape. */
function parseDraft(raw: string | null): OnboardingDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as OnboardingDraft;
    return d && d.v === DRAFT_VERSION && d.sections ? d : null;
  } catch {
    return null;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface OnboardingState extends OnboardingSections {
  // Child basics
  childName: string;
  /** Onboarding path from the DOB (lib/age getOnboardingPath). */
  bracket: AgeBracket;
  childSex: ChildSex;
  dob: Date | null;
  /** 'Mother' | 'Father' | 'Grandparent' | 'Guardian' | '' */
  relationship: string;

  // Physical (raw text / chip)
  weight: string;
  height: string;
  /** Chip text, incl. "Don't know" ('' = not answered). */
  bloodGroup: string;

  // Allergies
  allergyAnswers: AllergyAnswers;

  /** Vaccination answers keyed by VaccineQuestion.id (all paths). */
  vaccineAnswers: Record<string, VaccineAnswer | undefined>;
  /** Paths B/C: "Were baby vaccines completed?" ('' = not answered). */
  babyVaccines: BabyVaccineAnswer | '';

  /** All object-shaped sections together (same values as the spread fields). */
  sections: OnboardingSections;

  // Derived (read-only)
  /** Named allergies with group. */
  allergies: AllergyEntry[];
  allergyStatus: AllergyStatus;
  /** Condition names to save. */
  conditionList: string[];
  /** Medicines to save (filled cards, only if takingMeds === 'Yes'). */
  medicationList: MedicationEntry[];
  /** Exact dose rows to mark done: "Given" answers on the current path
   *  (only doses already due for the DOB), plus the baby doses on a "Yes". */
  vaccineDosesGiven: VaccineDoseRow[];
  /** Everything confirm writes to vaccinations (done + unknown), with counts. */
  vaccinePlan: OnboardingVaccinePlan;

  // Setters
  setChildName: (name: string) => void;
  setBracket: (bracket: AgeBracket) => void;
  setChildSex: (sex: ChildSex) => void;
  setDob: (dob: Date | null) => void;
  setRelationship: (relationship: string) => void;
  setWeight: (weight: string) => void;
  setHeight: (height: string) => void;
  setBloodGroup: (bg: string) => void;
  /** Merge a patch into one allergy group. */
  setAllergyGroup: (group: AllergyGroup, patch: Partial<AllergyGroupAnswer>) => void;
  /** Replace all allergy answers (e.g. a top-level "No allergies" choice). */
  setAllergyAnswers: (answers: AllergyAnswers) => void;
  /** Set one vaccination answer ('' / undefined clears it). */
  setVaccineAnswer: (questionId: string, answer: VaccineAnswer | '' | undefined) => void;
  setBabyVaccines: (answer: BabyVaccineAnswer | '') => void;
  /** Merge a patch into a section, e.g. updateSection('aSleep', { hours: '10–12 hrs' }). */
  updateSection: <K extends OnboardingSectionKey>(key: K, patch: Partial<OnboardingSections[K]>) => void;
  /** Clear everything (start a new child). */
  reset: () => void;
  /** Delete the saved draft (call once confirm has saved). The answers stay
   *  in memory for the "all set" screen until reset(). */
  clearDraft: () => Promise<void>;
  /** True once a saved draft (if any) has been restored. */
  draftLoaded: boolean;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [childName, setChildName] = useState('');
  const [bracket, setBracket] = useState<AgeBracket>(null);
  const [childSex, setChildSex] = useState<ChildSex>(null);
  const [dob, setDob] = useState<Date | null>(null);
  const [relationship, setRelationship] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [allergyAnswers, setAllergyAnswers] = useState<AllergyAnswers>(EMPTY_ALLERGIES);
  const [vaccineAnswers, setVaccineAnswers] = useState<Record<string, VaccineAnswer | undefined>>({});
  const [babyVaccines, setBabyVaccines] = useState<BabyVaccineAnswer | ''>('');
  const [sections, setSections] = useState<OnboardingSections>(EMPTY_SECTIONS);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  /** User whose saved draft (if any) has been restored. */
  const [draftLoadedFor, setDraftLoadedFor] = useState<string | null>(null);
  const draftLoaded = !!userId && draftLoadedFor === userId;
  /** Set after confirm saved: stop writing the (now saved) answers back. */
  const draftCleared = useRef(false);

  const setAllergyGroup = useCallback((group: AllergyGroup, patch: Partial<AllergyGroupAnswer>) => {
    setAllergyAnswers((prev) => ({ ...prev, [group]: { ...prev[group], ...patch } }));
  }, []);

  const setVaccineAnswer = useCallback((questionId: string, answer: VaccineAnswer | '' | undefined) => {
    setVaccineAnswers((prev) => ({ ...prev, [questionId]: answer || undefined }));
  }, []);

  const updateSection = useCallback(
    <K extends OnboardingSectionKey>(key: K, patch: Partial<OnboardingSections[K]>) => {
      setSections((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    },
    [],
  );

  const reset = useCallback(() => {
    setChildName('');
    setBracket(null);
    setChildSex(null);
    setDob(null);
    setRelationship('');
    setWeight('');
    setHeight('');
    setBloodGroup('');
    setAllergyAnswers(EMPTY_ALLERGIES);
    setVaccineAnswers({});
    setBabyVaccines('');
    setSections((prev) => ({ ...EMPTY_SECTIONS, parent: prev.parent }));
    draftCleared.current = false;
  }, []);

  // Sign-out (or a different account): drop the previous user's answers from
  // memory and their draft from the device, so nothing carries over to the
  // next sign-in on this device (R2-25).
  const prevUserId = useRef<string | null>(userId);
  useEffect(() => {
    const prev = prevUserId.current;
    prevUserId.current = userId;
    if (!prev || prev === userId) return;
    dbg.db('Onboarding draft: cleared on sign-out');
    void draftStore.remove(draftKey(prev));
    reset();
    setSections(EMPTY_SECTIONS);
  }, [userId, reset]);

  // Restore the draft for this user once, when onboarding opens.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    draftStore.get(draftKey(userId)).then((raw) => {
      if (cancelled) return;
      const d = parseDraft(raw);
      if (d) {
        dbg.db('Onboarding draft: restored', { childName: d.childName, bracket: d.bracket });
        setChildName(d.childName ?? '');
        setBracket(d.bracket ?? null);
        setChildSex(d.childSex ?? null);
        setDob(d.dob ? parseDateOnly(d.dob) : null);
        setRelationship(d.relationship ?? '');
        setWeight(d.weight ?? '');
        setHeight(d.height ?? '');
        setBloodGroup(d.bloodGroup ?? '');
        setAllergyAnswers({ ...EMPTY_ALLERGIES, ...d.allergyAnswers });
        setVaccineAnswers(d.vaccineAnswers ?? {});
        setBabyVaccines(d.babyVaccines ?? '');
        // Merge per section so a field added later still has its default.
        setSections((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(EMPTY_SECTIONS) as OnboardingSectionKey[]) {
            (next as Record<string, unknown>)[k] = { ...EMPTY_SECTIONS[k], ...d.sections[k] };
          }
          next.aFeeding = { ...next.aFeeding, feeding: normaliseFeeding(next.aFeeding.feeding) };
          // Keep a name typed before the restore finished.
          if (prev.parent.name && !d.sections.parent?.name) next.parent = { ...next.parent, name: prev.parent.name };
          return next;
        });
      }
      setDraftLoadedFor(userId);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Save the draft shortly after each change (after the restore, so an
  // empty first render never overwrites a saved draft).
  useEffect(() => {
    if (!userId || !draftLoaded || draftCleared.current) return;
    const draft: OnboardingDraft = {
      v: DRAFT_VERSION,
      childName, bracket, childSex,
      dob: dob ? toDateOnlyString(dob) : null,
      relationship, weight, height, bloodGroup,
      allergyAnswers, vaccineAnswers, babyVaccines, sections,
    };
    const t = setTimeout(() => { draftStore.set(draftKey(userId), JSON.stringify(draft)); }, 400);
    return () => clearTimeout(t);
  }, [
    userId, draftLoaded, childName, bracket, childSex, dob, relationship,
    weight, height, bloodGroup, allergyAnswers, vaccineAnswers, babyVaccines, sections,
  ]);

  const clearDraft = useCallback(async () => {
    draftCleared.current = true;
    if (userId) await draftStore.remove(draftKey(userId));
  }, [userId]);

  const allergies = useMemo(() => deriveAllergyList(allergyAnswers), [allergyAnswers]);
  const allergyStatus = useMemo(() => deriveAllergyStatus(allergyAnswers), [allergyAnswers]);
  const conditionList = useMemo(() => deriveConditionList(sections.conditionsAnswers), [sections.conditionsAnswers]);
  const medicationList = useMemo(() => deriveMedicationList(sections.conditionsAnswers), [sections.conditionsAnswers]);
  const vaccinePlan = useMemo(
    () => onboardingVaccinePlan(bracket, vaccineAnswers, babyVaccines, dob),
    [bracket, vaccineAnswers, babyVaccines, dob],
  );
  const vaccineDosesGiven = vaccinePlan.given;

  return (
    <OnboardingContext.Provider
      value={{
        ...sections,
        sections,
        childName, bracket, childSex, dob, relationship,
        weight, height, bloodGroup,
        allergyAnswers, vaccineAnswers, babyVaccines,
        allergies, allergyStatus, conditionList, medicationList, vaccineDosesGiven, vaccinePlan,
        setChildName, setBracket, setChildSex, setDob, setRelationship,
        setWeight, setHeight, setBloodGroup,
        setAllergyGroup, setAllergyAnswers, setVaccineAnswer, setBabyVaccines, updateSection, reset,
        clearDraft, draftLoaded,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

/** Same as useOnboarding, but null outside the provider (for shared components). */
export function useOptionalOnboarding() {
  return useContext(OnboardingContext);
}
