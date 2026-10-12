import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';

const GRADES = ['Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'];
const STRESS = ['Low', 'Moderate', 'High'];
const ACTIVITY_FREQ = ['Daily', '3–4x per week', 'Occasionally', 'Rarely'];
const SCREEN_TIME = ['Under 2hrs', '2–4hrs', 'Over 4hrs'];

export default function AcademicScreen() {
  const [grade, setGrade] = useState<string[]>([]);
  const [stress, setStress] = useState<string[]>([]);
  const [sports, setSports] = useState('');
  const [frequency, setFrequency] = useState<string[]>([]);
  const [screenTime, setScreenTime] = useState<string[]>([]);

  return (
    <OnboardingShell
      progress={0.57}
      title="School and lifestyle"
      subtitle="Helps us understand the daily routine"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/c-diet')}
    >
      <View>
        <Text style={styles.fieldLabel}>Current school grade</Text>
        <ChipGroup options={GRADES} selected={grade} onChange={setGrade} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Academic stress level (as observed by you)</Text>
        <ChipGroup options={STRESS} selected={stress} onChange={setStress} />
      </View>

      <TextInputField
        label="Sports or physical activity"
        placeholder="e.g. cricket, swimming, none"
        value={sports}
        onChangeText={setSports}
      />

      <View>
        <Text style={styles.fieldLabel}>Activity frequency</Text>
        <ChipGroup options={ACTIVITY_FREQ} selected={frequency} onChange={setFrequency} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Daily screen time</Text>
        <ChipGroup options={SCREEN_TIME} selected={screenTime} onChange={setScreenTime} />
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
