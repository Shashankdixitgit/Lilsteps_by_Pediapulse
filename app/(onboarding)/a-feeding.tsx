import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';

const FEEDING = ['Breastfed', 'Formula', 'Both', 'Solid foods started'];
const DIFFICULTIES = ['Reflux', 'Poor latch', 'Slow weight gain', 'None'];

export default function FeedingScreen() {
  const [feeding, setFeeding] = useState<string[]>([]);
  const [difficulties, setDifficulties] = useState<string[]>([]);

  return (
    <OnboardingShell
      sprout="happy"
      progress={0.68}
      title="Feeding"
      subtitle="Helps us understand nutrition"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/a-milestones')}
    >
      <View>
        <Text style={styles.fieldLabel}>Current feeding</Text>
        <ChipGroup options={FEEDING} selected={feeding} onChange={setFeeding} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any feeding difficulties?</Text>
        <ChipGroup
          options={DIFFICULTIES}
          selected={difficulties}
          onChange={setDifficulties}
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
