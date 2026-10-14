import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { milestoneBandForDob, MILESTONE_BANDS } from '@/constants/milestones';
import { AppColors } from '@/constants/theme';
import { MILESTONE_NONE, useOnboarding } from '@/context/onboarding';

// Age-specific checklist from constants/milestones (C4; clinical content
// pending doctor review there). "None yet" lets the parent of a young baby
// answer honestly.
export default function MilestonesScreen() {
  const { aMilestones: answers, updateSection, dob, childName } = useOnboarding();
  const band = milestoneBandForDob(dob) ?? MILESTONE_BANDS[0];
  const options = useMemo(() => [...band.items.map((i) => i.text), MILESTONE_NONE], [band]);
  const name = childName?.trim() || 'your child';

  // A changed date of birth moves the child to another age band: drop ticks
  // from the old list so only answers to the questions shown are saved.
  const { achieved } = answers;
  useEffect(() => {
    if (!dob) return;
    const kept = achieved.filter((a) => options.includes(a));
    if (kept.length !== achieved.length) updateSection('aMilestones', { achieved: kept });
  }, [dob, achieved, options, updateSection]);

  const question = `What can ${name} do?`;
  return (
    <OnboardingShell
      screen="a-milestones"
      title="Milestones"
      subtitle={`${band.label}. Tick what applies.`}
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/a-vaccination')}
    >
      <View>
        <Text style={styles.fieldLabel}>{question}</Text>
        <ChipGroup
          label={question}
          options={options}
          selected={achieved}
          onChange={(next) => updateSection('aMilestones', { achieved: next })}
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
