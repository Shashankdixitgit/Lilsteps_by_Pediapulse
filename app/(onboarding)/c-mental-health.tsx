import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';
import { typography } from '@/styles/global';

const YES_NO = ['Yes', 'No'];

export default function MentalHealthScreen() {
  const { cMentalHealth: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('cMentalHealth', patch);

  return (
    <OnboardingShell
      screen="c-mental-health"
      title="Mental wellbeing"
      subtitle="Optional, and helps the doctor give better care"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/c-vaccination')}
    >
      <Text style={typography.meta}>
        You can skip any question. Only the consulting doctor sees your answers.
      </Text>

      <View>
        <Text style={styles.fieldLabel}>
          Any recent changes in mood, social withdrawal, or behaviour?
        </Text>
        <ChipGroup
          options={YES_NO}
          selected={toChips(answers.moodChanges)}
          onChange={(v) => set({ moodChanges: fromChips(v) })}
        />
      </View>

      {answers.moodChanges === 'Yes' && (
        <TextInputField
          placeholder="Briefly describe what you've noticed"
          accessibilityLabel="Briefly describe what you've noticed"
          value={answers.moodDetails}
          onChangeText={(moodDetails) => set({ moodDetails })}
          multiline
        />
      )}

      <View>
        <Text style={styles.fieldLabel}>Any history of anxiety or depression?</Text>
        <ChipGroup
          options={YES_NO}
          selected={toChips(answers.anxietyHistory)}
          onChange={(v) => set({ anxietyHistory: fromChips(v) })}
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
