import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';

const SLEEP_HOURS = ['5–6 hrs', '7–8 hrs', '9–10 hrs', '11+ hrs'];
const CONCERNS = ['Difficulty falling asleep', 'Screen use before bed', 'Excessive sleeping', 'None'];

export default function SleepOlderScreen() {
  const [hours, setHours] = useState<string[]>([]);
  const [concerns, setConcerns] = useState<string[]>([]);

  return (
    <OnboardingShell
      sprout="sleepy"
      progress={1}
      title="Sleep"
      subtitle="Sleep shapes school and mood at this age"
      ctaLabel="Finish"
      onCta={() => router.push('/(onboarding)/confirm')}
    >
      <View>
        <Text style={styles.fieldLabel}>Sleep hours on school nights</Text>
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
