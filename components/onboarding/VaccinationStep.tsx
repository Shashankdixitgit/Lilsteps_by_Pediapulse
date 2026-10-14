import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { TextButton } from '@/components/gradient-button';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { VaccineStatusList, type VaccineStatusItem } from '@/components/onboarding/VaccineStatusList';
import type { OnboardingScreen } from '@/constants/onboardingSteps';
import { AppColors, Radius } from '@/constants/theme';
import {
  BABY_VACCINE_ANSWERS,
  babyVaccineDoses,
  babyVaccinesQuestionFor,
  coveredByBabyAnswer,
  dueDoses,
  VACCINE_QUESTIONS_BY_PATH,
  type BabyVaccineAnswer,
  type OnboardingVaccinePlan,
  type VaccineDoseRow,
} from '@/constants/vaccineQuestions';
import { useOnboarding } from '@/context/onboarding';
import type { OnboardingPath } from '@/lib/age';
import { typography } from '@/styles/global';

export interface VaccineDoseCounts {
  /** Baby and early-childhood doses (the ones the baby-vaccines question covers). */
  earlyGiven: number;
  earlyUnknown: number;
  /** Later doses (e.g. Tdap, HPV), counted on their own: never "earlier doses". */
  laterGiven: number;
  laterUnknown: number;
  laterGivenNames: string[];
  laterUnknownNames: string[];
}

/**
 * Splits the onboarding vaccine plan into baby/early-childhood doses and later
 * (school-age / teen) doses. The vaccine step and the review screen both use
 * this and doseCountLines, so their counts and wording always match.
 */
export function vaccineDoseCounts(
  path: OnboardingPath | null,
  dob: Date | string | null,
  plan: OnboardingVaccinePlan,
): VaccineDoseCounts {
  const early = new Set(babyVaccineDoses(path, dob).map((d) => `${d.vaccineName}#${d.doseNumber}`));
  const isEarly = (r: VaccineDoseRow) => early.has(`${r.vaccine_name}#${r.dose_number}`);
  const names = (rows: VaccineDoseRow[]) => Array.from(new Set(rows.map((r) => r.vaccine_name)));
  const laterGiven = plan.given.filter((r) => !isEarly(r));
  const laterUnknown = plan.unknown.filter((r) => !isEarly(r));
  return {
    earlyGiven: plan.given.length - laterGiven.length,
    earlyUnknown: plan.unknown.length - laterUnknown.length,
    laterGiven: laterGiven.length,
    laterUnknown: laterUnknown.length,
    laterGivenNames: names(laterGiven),
    laterUnknownNames: names(laterUnknown),
  };
}

const doses = (n: number) => `${n} dose${n !== 1 ? 's' : ''}`;

/** Plain-English lines for the counts (shared by the vaccine step and confirm). */
export function doseCountLines(c: VaccineDoseCounts, opts: { early?: boolean } = {}): string[] {
  const lines: string[] = [];
  const earlyLabel = opts.early === false ? null : 'baby and early-childhood';
  if (earlyLabel && c.earlyGiven > 0) {
    lines.push(`${doses(c.earlyGiven)} of ${earlyLabel} vaccines will be marked as given (date not recorded).`);
  }
  if (c.laterGiven > 0) {
    lines.push(`${doses(c.laterGiven)} of later vaccines (${c.laterGivenNames.join(', ')}) will be marked as given (date not recorded).`);
  }
  if (earlyLabel && c.earlyUnknown > 0) {
    lines.push(
      `${doses(c.earlyUnknown)} of ${earlyLabel} vaccines will be listed to check with your doctor, who can advise on any catch-up.`,
    );
  }
  if (c.laterUnknown > 0) {
    lines.push(
      `${doses(c.laterUnknown)} of later vaccines (${c.laterUnknownNames.join(', ')}) will be listed to check with your doctor.`,
    );
  }
  return lines;
}

interface VaccinationStepProps {
  path: OnboardingPath;
  screen: OnboardingScreen;
  next: Href;
  /**
   * Hide questions with no dose due yet (path A: a 10-day-old sees only BCG,
   * Hep B and OPV). Otherwise they are shown with a "Not due yet" label.
   */
  hideNotDue?: boolean;
}

/**
 * The vaccination step shared by paths A, B and C. Answers live in the
 * onboarding context (keyed by question id), so they survive Back. Which dose
 * rows a "Given" answer marks is worked out at confirm (vaccineDosesGiven).
 */
export function VaccinationStep({ path, screen, next, hideNotDue }: VaccinationStepProps) {
  const { dob, vaccineAnswers, setVaccineAnswer, babyVaccines, setBabyVaccines, vaccinePlan } = useOnboarding();
  // One question for all the early doses (C3): paths B/C, and path A from 12 months.
  const babyQuestion = babyVaccinesQuestionFor(path, dob);
  const counts = vaccineDoseCounts(path, dob, vaccinePlan);
  // Later doses (Tdap, HPV): counted separately, with the same lines as the review screen.
  const laterLines = doseCountLines(counts, { early: false });

  // After "Yes" to the baby-vaccines question, the specific vaccines it
  // already covers fold away (R2-20); the parent can still open them.
  const [showCovered, setShowCovered] = useState(false);

  const items = useMemo<(VaccineStatusItem & { covered: boolean })[]>(() => {
    const now = new Date();
    const out: (VaccineStatusItem & { covered: boolean })[] = [];
    for (const q of VACCINE_QUESTIONS_BY_PATH[path]) {
      // Without a DOB (e.g. a web reload mid-flow) show every question as answerable.
      const due = dob ? dueDoses(dob, q, now).length : q.doses.length;
      const notDueYet = q.doses.length > 0 && due === 0;
      if (notDueYet && hideNotDue) continue;
      out.push({
        covered: coveredByBabyAnswer(path, dob, q),
        id: q.id,
        name: q.name,
        note: q.note,
        notDueYet,
        laterDosesNotDue: due > 0 && due < q.doses.length,
      });
    }
    // Rows that need an answer first; "Not due yet" rows (no control) last.
    return [...out.filter((i) => !i.notDueYet), ...out.filter((i) => i.notDueYet)];
  }, [dob, path, hideNotDue]);

  const folded = !!babyQuestion && babyVaccines === 'Yes' && !showCovered;
  const shown = folded ? items.filter((i) => !i.covered) : items;
  const hiddenCount = items.length - shown.length;
  const answerable = items.filter((i) => !i.notDueYet);
  const givenCount = answerable.filter((i) => vaccineAnswers[i.id] === 'Given').length;

  return (
    <OnboardingShell
      screen={screen}
      sprout="care"
      title="Vaccination status"
      subtitle="You can update these later in Vaccines."
      ctaLabel="Continue"
      onCta={() => router.push(next)}
    >
      {babyQuestion ? (
        <View style={styles.babyCard}>
          <View style={styles.babyText}>
            <Text style={typography.title}>{babyQuestion.title}</Text>
            <Text style={typography.caption}>{babyQuestion.note}</Text>
          </View>
          <ChipGroup
            label={babyQuestion.title}
            options={[...BABY_VACCINE_ANSWERS]}
            selected={toChips(babyVaccines)}
            onChange={(v) => setBabyVaccines(fromChips(v) as BabyVaccineAnswer | '')}
          />
          {babyVaccines === 'Yes' && counts.earlyGiven > 0 ? (
            <Text style={typography.caption} accessibilityLiveRegion="polite">
              {doseCountLines({ ...counts, laterGiven: 0, earlyUnknown: 0, laterUnknown: 0 })[0]}
            </Text>
          ) : babyVaccines === 'No' || babyVaccines === 'Not sure' ? (
            <Text style={typography.caption} accessibilityLiveRegion="polite">
              No problem. These doses will be listed in Vaccines to check with your doctor, who can advise on any
              catch-up. They won&apos;t be shown as overdue.
            </Text>
          ) : null}
        </View>
      ) : null}

      {babyQuestion && shown.length > 0 ? (
        <Text style={[typography.sectionLabel, styles.laterLabel]}>
          {folded ? 'Later vaccines' : 'Specific vaccines'}
        </Text>
      ) : null}
      {shown.length > 0 ? (
        <VaccineStatusList items={shown} answers={vaccineAnswers} onChange={setVaccineAnswer} />
      ) : null}
      {folded && hiddenCount > 0 ? (
        <TextButton
          label={`Answer for ${hiddenCount} specific vaccine${hiddenCount !== 1 ? 's' : ''} (optional)`}
          onPress={() => setShowCovered(true)}
          chevron
        />
      ) : null}

      {givenCount > 0 && (
        <Text style={[typography.meta, styles.summary]}>
          {givenCount} of {answerable.length} vaccine{answerable.length !== 1 ? 's' : ''} marked as given
        </Text>
      )}
      {laterLines.map((line) => (
        <Text key={line} style={[typography.meta, styles.summary]} accessibilityLiveRegion="polite">
          {line}
        </Text>
      ))}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  babyCard: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 12,
  },
  babyText: {
    gap: 2,
  },
  laterLabel: {
    marginBottom: -8,
  },
  summary: {
    textAlign: 'center',
    marginTop: -8,
  },
});
