import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const SLEEP_HOURS = ['5–6 hrs', '7–8 hrs', '9–10 hrs', '11+ hrs'];
const CONCERNS = ['Difficulty falling asleep', 'Screen use before bed', 'Excessive sleeping', 'None'];

export default function SleepOlderScreen() {
  const { cSleep: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('cSleep', patch);

  return (
    <OnboardingShell
      screen="c-sleep"
      sprout="sleepy"
      title="Sleep"
      subtitle="Sleep shapes school and mood at this age"
      ctaLabel="Finish"
      onCta={() => router.push('/(onboarding)/confirm')}
    >
      <View>
        <Text style={styles.fieldLabel}>Sleep hours on school nights</Text>
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
