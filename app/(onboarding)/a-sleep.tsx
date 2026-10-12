import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';

const SLEEP_HOURS = ['8–10 hrs', '10–12 hrs', '12–14 hrs', '14–16 hrs', '16–18 hrs', '18–20 hrs'];
const CONCERNS = ['Frequent night waking', 'Breathing issues during sleep', 'None'];

export default function SleepInfantScreen() {
  const [hours, setHours] = useState<string[]>([]);
  const [concerns, setConcerns] = useState<string[]>([]);

  return (
    <OnboardingShell
      sprout="sleepy"
      progress={1}
      title="Sleep"
      subtitle="Helps us keep an eye on wellbeing"
      ctaLabel="Finish"
      onCta={() => router.push('/(onboarding)/confirm')}
    >
      <View>
        <Text style={styles.fieldLabel}>Average sleep hours per day</Text>
        <ChipGroup options={SLEEP_HOURS} selected={hours} onChange={setHours} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any sleep concerns?</Text>
        <ChipGroup
          options={CONCERNS}
          selected={concerns}
          onChange={setConcerns}
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
