import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const DIET = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Jain'];
const YES_NO = ['Yes', 'No'];

export default function DietOlderScreen() {
  const { cDiet: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('cDiet', patch);

  return (
    <OnboardingShell
      screen="c-diet"
      sprout="happy"
      title="Diet"
      subtitle="Diet at this age matters for growth"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/c-puberty')}
    >
      <View>
        <Text style={styles.fieldLabel}>Diet type</Text>
        <ChipGroup options={DIET} selected={toChips(answers.diet)} onChange={(v) => set({ diet: fromChips(v) })} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Regular caffeine — tea or coffee?</Text>
        <ChipGroup options={YES_NO} selected={toChips(answers.caffeine)} onChange={(v) => set({ caffeine: fromChips(v) })} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any dieting, food restriction, or body image concerns noticed?</Text>
        <ChipGroup
          options={YES_NO}
          selected={toChips(answers.bodyImage)}
          onChange={(v) => set({ bodyImage: fromChips(v) })}
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
