import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

import type { VaccineAnswer, VaccineDoseRow } from '@/constants/vaccineQuestions';
import { givenDoseRows } from '@/constants/vaccineQuestions';
import type { OnboardingPath } from '@/lib/age';

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
 * Which of these answers get saved to the DB is a separate (clinical)
 * decision; nothing here is lost on Back either way.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Onboarding path: A (<3y), B (3–8y), C (9–15y). Same as lib/age OnboardingPath. */
export type AgeBracket = OnboardingPath | null;
export type ChildSex = 'male' | 'female' | null;

export interface ParentAnswers {
  name: string;
  /** City chip ('' = not answered). */
  city: string;
  /** Preferred language chip ('' = not answered). */
  language: string;
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
  feeding: string;
  difficulties: string[];
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
  parent: { name: '', city: '', language: '' },
  conditionsAnswers: { selected: [], other: '', takingMeds: '', medications: [EMPTY_MEDICATION] },
  aBirthHistory: { term: '', weeks: '', delivery: '', birthWeight: '', complications: [] },
  aFeeding: { feeding: '', difficulties: [] },
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

/** Condition names to save ('None' dropped, 'Other' replaced by its text). */
export function deriveConditionList(answers: ConditionsAnswers): string[] {
  const names = answers.selected.filter((c) => c !== 'None' && c !== 'Other');
  if (answers.selected.includes('Other') && answers.other.trim()) names.push(answers.other.trim());
  return names;
}

/** Medicines to save: only when takingMeds is 'Yes', only cards with a name. */
export function deriveMedicationList(answers: ConditionsAnswers): MedicationEntry[] {
  if (answers.takingMeds !== 'Yes') return [];
  return answers.medications
    .filter((m) => m.name.trim())
    .map((m) => ({ name: m.name.trim(), dose: m.dose.trim(), frequency: m.frequency }));
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

  // Derived (read-only)
  /** Named allergies with group. */
  allergies: AllergyEntry[];
  allergyStatus: AllergyStatus;
  /** Condition names to save. */
  conditionList: string[];
  /** Medicines to save (filled cards, only if takingMeds === 'Yes'). */
  medicationList: MedicationEntry[];
  /** Exact dose rows to mark done: "Given" answers on the current path,
   *  only doses already due for the DOB. */
  vaccineDosesGiven: VaccineDoseRow[];

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
  /** Merge a patch into a section, e.g. updateSection('aSleep', { hours: '10–12 hrs' }). */
  updateSection: <K extends OnboardingSectionKey>(key: K, patch: Partial<OnboardingSections[K]>) => void;
  /** Clear everything (start a new child). */
  reset: () => void;
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
  const [sections, setSections] = useState<OnboardingSections>(EMPTY_SECTIONS);

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
    setSections((prev) => ({ ...EMPTY_SECTIONS, parent: prev.parent }));
  }, []);

  const allergies = useMemo(() => deriveAllergyList(allergyAnswers), [allergyAnswers]);
  const allergyStatus = useMemo(() => deriveAllergyStatus(allergyAnswers), [allergyAnswers]);
  const conditionList = useMemo(() => deriveConditionList(sections.conditionsAnswers), [sections.conditionsAnswers]);
  const medicationList = useMemo(() => deriveMedicationList(sections.conditionsAnswers), [sections.conditionsAnswers]);
  const vaccineDosesGiven = useMemo(
    () => givenDoseRows(bracket, vaccineAnswers, dob),
    [bracket, vaccineAnswers, dob],
  );

  return (
    <OnboardingContext.Provider
      value={{
        ...sections,
        childName, bracket, childSex, dob, relationship,
        weight, height, bloodGroup,
        allergyAnswers, vaccineAnswers,
        allergies, allergyStatus, conditionList, medicationList, vaccineDosesGiven,
        setChildName, setBracket, setChildSex, setDob, setRelationship,
        setWeight, setHeight, setBloodGroup,
        setAllergyGroup, setAllergyAnswers, setVaccineAnswer, updateSection, reset,
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
