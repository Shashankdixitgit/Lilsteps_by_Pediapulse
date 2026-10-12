import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { typography } from '@/styles/global';

const YES_NO = ['Yes', 'No'];

export default function MentalHealthScreen() {
  const [moodChanges, setMoodChanges] = useState<string[]>([]);
  const [moodDetails, setMoodDetails] = useState('');
  const [anxietyHistory, setAnxietyHistory] = useState<string[]>([]);

  return (
    <OnboardingShell
      progress={0.83}
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
        <ChipGroup options={YES_NO} selected={moodChanges} onChange={setMoodChanges} />
      </View>

      {moodChanges.includes('Yes') && (
        <TextInputField
          placeholder="Briefly describe what you've noticed"
          value={moodDetails}
          onChangeText={setMoodDetails}
          multiline
        />
      )}

      <View>
        <Text style={styles.fieldLabel}>Any history of anxiety or depression?</Text>
        <ChipGroup options={YES_NO} selected={anxietyHistory} onChange={setAnxietyHistory} />
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
