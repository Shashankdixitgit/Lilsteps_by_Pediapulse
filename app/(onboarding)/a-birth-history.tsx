import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { BIRTH_WEIGHT_MAX_KG, BIRTH_WEIGHT_MIN_KG, parseBirthWeight, useOnboarding } from '@/context/onboarding';

const TERM = ['Full term', 'Premature'];
const DELIVERY = ['Normal vaginal', 'C-section', 'Assisted'];
const COMPLICATIONS = ['NICU stay', 'Neonatal jaundice', 'Breathing support', 'None'];

export default function BirthHistoryScreen() {
  const { aBirthHistory: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('aBirthHistory', patch);
  // Saved as the first growth reading (G1), so an impossible number is flagged.
  const birthWeightError =
    answers.birthWeight.trim() && parseBirthWeight(answers.birthWeight) === null
      ? `Enter the weight in kg, between ${BIRTH_WEIGHT_MIN_KG} and ${BIRTH_WEIGHT_MAX_KG}`
      : undefined;

  return (
    <OnboardingShell
      screen="a-birth-history"
      title="Birth history"
      subtitle="Helps doctors understand early development"
      ctaLabel="Continue"
      onCta={() => {
        if (!birthWeightError) router.push('/(onboarding)/a-feeding');
      }}
      ctaDisabled={!!birthWeightError}
    >
      <View>
        <Text style={styles.fieldLabel}>Full term or premature?</Text>
        <ChipGroup label="Full term or premature?" options={TERM} selected={toChips(answers.term)} onChange={(v) => set({ term: fromChips(v) })} />
      </View>

      {answers.term === 'Premature' && (
        <TextInputField
          label="How many weeks?"
          placeholder="e.g. 34"
          value={answers.weeks}
          onChangeText={(weeks) => set({ weeks })}
          keyboardType="number-pad"
        />
      )}

      <View>
        <Text style={styles.fieldLabel}>Mode of delivery</Text>
        <ChipGroup
          label="Mode of delivery"
          options={DELIVERY}
          selected={toChips(answers.delivery)}
          onChange={(v) => set({ delivery: fromChips(v) })}
        />
      </View>

      <TextInputField
        label="Birth weight"
        hint="(kg)"
        hintInline
        placeholder="e.g. 2.8"
        value={answers.birthWeight}
        onChangeText={(birthWeight) => set({ birthWeight: birthWeight.replace(',', '.') })}
        keyboardType="decimal-pad"
        error={birthWeightError}
      />

      <View>
        <Text style={styles.fieldLabel}>Any birth complications?</Text>
        <ChipGroup
          label="Any birth complications?"
          options={COMPLICATIONS}
          selected={answers.complications}
          onChange={(complications) => set({ complications })}
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
