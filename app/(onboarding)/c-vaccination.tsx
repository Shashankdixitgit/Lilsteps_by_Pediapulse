import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const VAX_STATUS = ['Given', 'Missed', 'Not sure'];

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
      progress={0.91}
      title="Vaccination Status"
      subtitle="Select the status for each vaccine — you can update records anytime in the Vaccination Tracker"
      ctaLabel="Continue"
      onCta={handleContinue}
    >
      <View style={styles.vaccineList}>
        {VACCINES.map((vaccine) => (
          <View key={vaccine.name} style={styles.vaccineRow}>
            <View style={styles.vaccineInfo}>
              <Text style={styles.vaccineName}>{vaccine.name}</Text>
              <Text style={styles.vaccineNote}>{vaccine.note}</Text>
            </View>
            <ChipGroup
              options={VAX_STATUS}
              selected={vaccineStatus[vaccine.name] ? [vaccineStatus[vaccine.name]] : []}
              onChange={(val) => updateStatus(vaccine.name, val)}
            />
          </View>
        ))}
      </View>

      {givenCount > 0 && (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {givenCount} of {VACCINES.length} vaccines marked as given
          </Text>
        </View>
      )}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  vaccineList: {
    gap: 16,
  },
  vaccineRow: {
    backgroundColor: AppColors.surfaceContainerLow,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  vaccineInfo: {
    gap: 2,
  },
  vaccineName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: AppColors.onSurface,
  },
  vaccineNote: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: AppColors.onSurfaceVariant,
  },
  summary: {
    backgroundColor: AppColors.primaryContainer,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  summaryText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: AppColors.onPrimaryContainer,
    textAlign: 'center',
  },
});
