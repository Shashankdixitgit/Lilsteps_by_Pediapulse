import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { fromChips, toChips } from '@/components/onboarding/chips';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const DEV_CONDITIONS = ['Autism spectrum', 'ADHD', 'Speech delay', 'Learning difficulty', 'None', 'Other'];
const SCHOOL = ['Yes', 'No', 'Starting soon'];
const SCHOOL_CONCERNS = ['Attention', 'Social behaviour', 'Learning', 'None'];

export default function DevelopmentYoungScreen() {
  const { bDevelopment: answers, updateSection } = useOnboarding();
  const set = (patch: Partial<typeof answers>) => updateSection('bDevelopment', patch);

  return (
    <OnboardingShell
      screen="b-development"
      title="Development"
      subtitle="Helps the care team understand needs"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/b-diet-activity')}
    >
      <View>
        <Text style={styles.fieldLabel}>Any diagnosed developmental conditions?</Text>
        <ChipGroup
          label="Any diagnosed developmental conditions?"
          options={DEV_CONDITIONS}
          selected={answers.devConditions}
          onChange={(devConditions) => set({ devConditions })}
          multiSelect
          noneValue="None"
        />
      </View>

      {answers.devConditions.includes('Other') && (
        <TextInputField
          label="Other condition"
          placeholder="e.g. motor delay"
          value={answers.devOther}
          onChangeText={(devOther) => set({ devOther })}
        />
      )}

      <View>
        <Text style={styles.fieldLabel}>Attending school or daycare?</Text>
        <ChipGroup label="Attending school or daycare?" options={SCHOOL} selected={toChips(answers.school)} onChange={(v) => set({ school: fromChips(v) })} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any school concerns flagged?</Text>
        <ChipGroup
          label="Any school concerns flagged?"
          options={SCHOOL_CONCERNS}
          selected={answers.schoolConcerns}
          onChange={(schoolConcerns) => set({ schoolConcerns })}
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
