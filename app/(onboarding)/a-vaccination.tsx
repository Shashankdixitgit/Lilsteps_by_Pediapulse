import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { OnboardingShell } from '@/components/onboarding-shell';
import { VaccineStatusList } from '@/components/onboarding/VaccineStatusList';
import { useOnboarding } from '@/context/onboarding';
import { typography } from '@/styles/global';

// `canonical` matches IAP names from iap_vaccine_schedule(). Pentavalent is
// a combo shot covering DPT + Hib + HepB; marking it Given marks all three.
const VACCINES: { name: string; note: string; canonical: string[] }[] = [
  { name: 'BCG',          note: 'Given at birth',                          canonical: ['BCG'] },
  { name: 'Hepatitis B',  note: 'Birth + 6 & 14 weeks',                    canonical: ['Hepatitis B'] },
  { name: 'OPV',          note: 'Oral Polio — 6, 10, 14 weeks',            canonical: ['OPV'] },
  { name: 'IPV',          note: 'Injectable Polio — 6 & 14 weeks',         canonical: ['IPV'] },
  { name: 'Pentavalent',  note: 'DPT + Hib + HepB — 6, 10, 14 weeks',      canonical: ['DTwP/DTaP', 'Hib', 'Hepatitis B'] },
  { name: 'Rotavirus',    note: '6, 10, 14 weeks',                         canonical: ['Rotavirus'] },
  { name: 'Measles / MR', note: '9 months',                                canonical: ['MMR'] },
];

export default function VaccinationInfantScreen() {
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
    setVaccinationsGiven(Array.from(new Set(given)));
    router.push('/(onboarding)/a-sleep');
  }

  return (
    <OnboardingShell
      sprout="care"
      progress={0.88}
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
