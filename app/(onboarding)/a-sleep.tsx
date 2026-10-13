import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const SLEEP_HOURS = ['8–10 hrs', '10–12 hrs', '12–14 hrs', '14–16 hrs', '16–18 hrs', '18–20 hrs'];
const CONCERNS = ['Frequent night waking', 'Breathing issues during sleep', 'None'];

export default function SleepInfantScreen() {
  const { aSleep: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('aSleep', patch);

  return (
    <OnboardingShell
      screen="a-sleep"
      sprout="sleepy"
      title="Sleep"
      subtitle="Helps us keep an eye on wellbeing"
      ctaLabel="Finish"
      onCta={() => router.push('/(onboarding)/confirm')}
    >
      <View>
        <Text style={styles.fieldLabel}>Average sleep hours per day</Text>
        <ChipGroup options={SLEEP_HOURS} selected={toChips(answers.hours)} onChange={(v) => set({ hours: fromChips(v) })} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any sleep concerns?</Text>
        <ChipGroup
          options={CONCERNS}
          selected={answers.concerns}
          onChange={(concerns) => set({ concerns })}
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
