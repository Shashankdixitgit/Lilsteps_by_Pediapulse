import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

// Path C is 9–15 years: a young 9-year-old can be in Grade 3, a 15-year-old in Grade 11 or 12.
const GRADES = Array.from({ length: 10 }, (_, i) => `Grade ${i + 3}`);
const STRESS = ['Low', 'Moderate', 'High'];
const ACTIVITY_FREQ = ['Daily', '3–4x per week', 'Occasionally', 'Rarely'];
const SCREEN_TIME = ['Under 2 hrs', '2–4 hrs', 'Over 4 hrs'];

export default function AcademicScreen() {
  const { cAcademic: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('cAcademic', patch);

  return (
    <OnboardingShell
      screen="c-academic"
      title="School and lifestyle"
      subtitle="Helps us understand the daily routine"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/c-diet')}
    >
      <View>
        <Text style={styles.fieldLabel}>Current school grade</Text>
        <ChipGroup label="Current school grade" options={GRADES} selected={toChips(answers.grade)} onChange={(v) => set({ grade: fromChips(v) })} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Academic stress level (as observed by you)</Text>
        <ChipGroup label="Academic stress level (as observed by you)" options={STRESS} selected={toChips(answers.stress)} onChange={(v) => set({ stress: fromChips(v) })} />
      </View>

      <TextInputField
        label="Sports or physical activity"
        placeholder="e.g. cricket, swimming, none"
        value={answers.sports}
        onChangeText={(sports) => set({ sports })}
      />

      <View>
        <Text style={styles.fieldLabel}>Activity frequency</Text>
        <ChipGroup
          label="Activity frequency"
          options={ACTIVITY_FREQ}
          selected={toChips(answers.frequency)}
          onChange={(v) => set({ frequency: fromChips(v) })}
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Daily screen time</Text>
        <ChipGroup
          label="Daily screen time"
          options={SCREEN_TIME}
          selected={toChips(answers.screenTime)}
          onChange={(v) => set({ screenTime: fromChips(v) })}
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
