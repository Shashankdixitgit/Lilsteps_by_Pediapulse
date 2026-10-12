import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { OnboardingShell } from '@/components/onboarding-shell';
import { VaccineStatusList } from '@/components/onboarding/VaccineStatusList';
import { useOnboarding } from '@/context/onboarding';
import { typography } from '@/styles/global';

const VACCINES: { name: string; note: string; canonical: string[] }[] = [
  { name: 'MMR',         note: 'Measles-Mumps-Rubella — 12–15 months', canonical: ['MMR'] },
  { name: 'DPT Booster', note: '16–24 months',                         canonical: ['DTwP/DTaP'] },
  { name: 'OPV Booster', note: '16–24 months',                         canonical: ['OPV'] },
  { name: 'Typhoid',     note: '2 years onwards',                      canonical: ['Typhoid Conjugate'] },
  { name: 'Hepatitis A', note: '12–18 months, 2 doses',                canonical: ['Hepatitis A'] },
  { name: 'Varicella',   note: 'Chickenpox — 12–18 months',            canonical: ['Varicella'] },
];

export default function VaccinationYoungScreen() {
  const { setVaccinationsGiven } = useOnboarding();
  const [vaccineStatus, setVaccineStatus] = useState<Record<string, string>>({});

  const updateStatus = (vaccine: string, val: string[]) => {
    setVaccineStatus((prev) => ({ ...prev, [vaccine]: val[0] ?? '' }));
  };

  const givenCount = Object.values(vaccineStatus).filter((s) => s === 'Given').length;

  function handleContinue() {
    const given = VACCINES
      .filter((v) => vaccineStatus[v.name] === 'Given')
      .flatMap((v) => v.canonical);
    setVaccinationsGiven(given);
    router.push('/(onboarding)/b-sleep-dental');
  }

  return (
    <OnboardingShell
      sprout="care"
      progress={0.87}
      title="Vaccination status"
      subtitle="You can update these later in Vaccines."
      ctaLabel="Continue"
      onCta={handleContinue}
    >
      <VaccineStatusList vaccines={VACCINES} statuses={vaccineStatus} onChange={updateStatus} />

      {givenCount > 0 && (
        <Text style={[typography.meta, styles.summary]}>
          {givenCount} of {VACCINES.length} marked as given
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
