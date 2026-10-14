import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const DIET = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Jain'];
const PICKY = ['Yes', 'No'];
const ACTIVITY = ['Very active', 'Moderately active', 'Mostly sedentary'];
const SCREEN_TIME = ['Under 1 hr', '1–2 hrs', '2–4 hrs', 'Over 4 hrs'];

export default function DietActivityScreen() {
  const { bDietActivity: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('bDietActivity', patch);

  return (
    <OnboardingShell
      screen="b-diet-activity"
      sprout="happy"
      title="Diet and activity"
      subtitle="Daily habits help with whole-child care"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/b-vaccination')}
    >
      <View>
        <Text style={styles.fieldLabel}>Diet type</Text>
        <ChipGroup label="Diet type" options={DIET} selected={toChips(answers.diet)} onChange={(v) => set({ diet: fromChips(v) })} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Extremely picky eater or major food aversions?</Text>
        <ChipGroup label="Extremely picky eater or major food aversions?" options={PICKY} selected={toChips(answers.picky)} onChange={(v) => set({ picky: fromChips(v) })} />
      </View>

      {answers.picky === 'Yes' && (
        <TextInputField
          label="Which foods does your child avoid?"
          placeholder="e.g. all vegetables, milk"
          value={answers.pickyDetails}
          onChangeText={(pickyDetails) => set({ pickyDetails })}
        />
      )}

      <View>
        <Text style={styles.fieldLabel}>Physical activity level</Text>
        <ChipGroup
          label="Physical activity level"
          options={ACTIVITY}
          selected={toChips(answers.activity)}
          onChange={(v) => set({ activity: fromChips(v) })}
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Average daily screen time</Text>
        <ChipGroup
          label="Average daily screen time"
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
