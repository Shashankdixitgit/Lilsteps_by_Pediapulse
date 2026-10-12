import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { OnboardingShell } from '@/components/onboarding-shell';
import { VaccineStatusList } from '@/components/onboarding/VaccineStatusList';
import { useOnboarding } from '@/context/onboarding';
import { typography } from '@/styles/global';

// `canonical` matches IAP names from iap_vaccine_schedule(). Marking a row
// 'Given' will flag every past-due dose of that vaccine as status='done'.
const VACCINES: { name: string; note: string; canonical: string[] }[] = [
  { name: 'Tdap Booster',        note: 'Tetanus-Diphtheria-Pertussis — 10 years',     canonical: ['Tdap'] },
  { name: 'HPV',                 note: 'Human Papillomavirus — 9–14 years, 2 doses',  canonical: ['HPV'] },
  { name: 'Typhoid Booster',     note: 'Every 3 years from age 2',                    canonical: ['Typhoid Conjugate'] },
  { name: 'Influenza',           note: 'Annual flu shot — recommended yearly',        canonical: ['Influenza'] },
  { name: 'Varicella Booster',   note: 'Second dose if not given earlier',            canonical: ['Varicella'] },
  { name: 'Hepatitis A Booster', note: 'Second dose if first was given',              canonical: ['Hepatitis A'] },
];

export default function VaccinationOlderScreen() {
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
    router.push('/(onboarding)/c-sleep');
  }

  return (
    <OnboardingShell
      sprout="care"
      progress={0.91}
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
