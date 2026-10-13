import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { OnboardingShell } from '@/components/onboarding-shell';
import { VaccineStatusList, type VaccineStatusItem } from '@/components/onboarding/VaccineStatusList';
import type { OnboardingScreen } from '@/constants/onboardingSteps';
import { dueDoses, VACCINE_QUESTIONS_BY_PATH } from '@/constants/vaccineQuestions';
import { useOnboarding } from '@/context/onboarding';
import type { OnboardingPath } from '@/lib/age';
import { typography } from '@/styles/global';

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
  const { dob, vaccineAnswers, setVaccineAnswer } = useOnboarding();

  const items = useMemo<VaccineStatusItem[]>(() => {
    const now = new Date();
    const out: VaccineStatusItem[] = [];
    for (const q of VACCINE_QUESTIONS_BY_PATH[path]) {
      // Without a DOB (e.g. a web reload mid-flow) show every question as answerable.
      const due = dob ? dueDoses(dob, q, now).length : q.doses.length;
      const notDueYet = q.doses.length > 0 && due === 0;
      if (notDueYet && hideNotDue) continue;
      out.push({
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
      <VaccineStatusList items={items} answers={vaccineAnswers} onChange={setVaccineAnswer} />

      {givenCount > 0 && (
        <Text style={[typography.meta, styles.summary]}>
          {givenCount} of {answerable.length} marked as given
        </Text>
      )}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  summary: {
    textAlign: 'center',
    marginTop: -8,
  },
});
