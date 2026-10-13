import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';
import { MILESTONE_NONE, useOnboarding } from '@/context/onboarding';

// Which milestones to show for which age is a clinical decision (pending);
// "None yet" lets the parent of a young baby answer honestly meanwhile.
const MILESTONES = [
  'Holds head up steadily',
  'Rolls over',
  'Sits without support',
  'Pulls to stand',
  'First words spoken',
  'Walks independently',
  MILESTONE_NONE,
];

export default function MilestonesScreen() {
  const { aMilestones: answers, updateSection } = useOnboarding();

  return (
    <OnboardingShell
      screen="a-milestones"
      title="Milestones"
      subtitle="Tick what applies."
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/a-vaccination')}
    >
      <View>
        <Text style={styles.fieldLabel}>What can your child do?</Text>
        <ChipGroup
          options={MILESTONES}
          selected={answers.achieved}
          onChange={(achieved) => updateSection('aMilestones', { achieved })}
          multiSelect
          noneValue={MILESTONE_NONE}
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
