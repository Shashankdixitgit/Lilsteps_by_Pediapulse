import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';

const DEV_CONDITIONS = ['Autism spectrum', 'ADHD', 'Speech delay', 'Learning difficulty', 'None', 'Other'];
const SCHOOL = ['Yes', 'No', 'Starting soon'];
const SCHOOL_CONCERNS = ['Attention', 'Social behaviour', 'Learning', 'None'];

export default function DevelopmentYoungScreen() {
  const [devConditions, setDevConditions] = useState<string[]>([]);
  const [school, setSchool] = useState<string[]>([]);
  const [schoolConcerns, setSchoolConcerns] = useState<string[]>([]);

  return (
    <OnboardingShell
      progress={0.61}
      title="Development"
      subtitle="Helps the care team understand needs"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/b-diet-activity')}
    >
      <View>
        <Text style={styles.fieldLabel}>Any diagnosed developmental conditions?</Text>
        <ChipGroup
          options={DEV_CONDITIONS}
          selected={devConditions}
          onChange={setDevConditions}
          multiSelect
          noneValue="None"
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Attending school or daycare?</Text>
        <ChipGroup options={SCHOOL} selected={school} onChange={setSchool} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any school concerns flagged?</Text>
        <ChipGroup
          options={SCHOOL_CONCERNS}
          selected={schoolConcerns}
          onChange={setSchoolConcerns}
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
