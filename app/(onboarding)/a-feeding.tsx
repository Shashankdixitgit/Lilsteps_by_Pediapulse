import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';
import { FEEDING_OPTIONS, FEEDING_SOLIDS, FEEDING_SOLIDS_FROM_MONTHS, useOnboarding } from '@/context/onboarding';
import { getAgeParts } from '@/lib/age';

const DIFFICULTIES = ['Reflux', 'Poor latch', 'Slow weight gain', 'None'];

export default function FeedingScreen() {
  const { aFeeding: answers, updateSection, dob } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('aFeeding', patch);
  // Many babies get breast milk and formula, often with solids: multi-select (O3).
  const ageMonths = dob ? (getAgeParts(dob)?.totalMonths ?? 0) : null;
  const showSolids = ageMonths === null || ageMonths >= FEEDING_SOLIDS_FROM_MONTHS;
  const options = showSolids ? FEEDING_OPTIONS : FEEDING_OPTIONS.filter((o) => o !== FEEDING_SOLIDS);
  const selected = answers.feeding.filter((f) => options.includes(f));

  return (
    <OnboardingShell
      screen="a-feeding"
      sprout="happy"
      title="Feeding"
      subtitle="Helps us understand nutrition"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/a-milestones')}
    >
      <View>
        <Text style={styles.fieldLabel}>Current feeding (choose all that apply)</Text>
        <ChipGroup
          label="Current feeding, choose all that apply"
          options={options}
          selected={selected}
          onChange={(feeding) => set({ feeding })}
          multiSelect
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any feeding difficulties?</Text>
        <ChipGroup
          label="Any feeding difficulties?"
          options={DIFFICULTIES}
          selected={answers.difficulties}
          onChange={(difficulties) => set({ difficulties })}
          multiSelect
          noneValue="None"
        />
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
    marginBottom: 8,
  },
});
