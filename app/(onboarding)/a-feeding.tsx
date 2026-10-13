import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const FEEDING = ['Breastfed', 'Formula', 'Both', 'Solid foods started'];
const DIFFICULTIES = ['Reflux', 'Poor latch', 'Slow weight gain', 'None'];

export default function FeedingScreen() {
  const { aFeeding: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('aFeeding', patch);

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
        <Text style={styles.fieldLabel}>Current feeding</Text>
        <ChipGroup
          options={FEEDING}
          selected={toChips(answers.feeding)}
          onChange={(v) => set({ feeding: fromChips(v) })}
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any feeding difficulties?</Text>
        <ChipGroup
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
