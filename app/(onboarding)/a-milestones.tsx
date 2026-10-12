import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';

const MILESTONES = [
  'Holds head up steadily',
  'Rolls over',
  'Sits without support',
  'Pulls to stand',
  'First words spoken',
  'Walks independently',
];

export default function MilestonesScreen() {
  const [achieved, setAchieved] = useState<string[]>([]);

  return (
    <OnboardingShell
      progress={0.78}
      title="Milestones"
      subtitle="Tick what applies."
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/a-vaccination')}
    >
      <View>
        <Text style={styles.fieldLabel}>What can your child do?</Text>
        <ChipGroup
          options={MILESTONES}
          selected={achieved}
          onChange={setAchieved}
          multiSelect
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
