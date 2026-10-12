import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { AppColors } from '@/constants/theme';

const DIET = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Jain'];
const YES_NO = ['Yes', 'No'];

export default function DietOlderScreen() {
  const [diet, setDiet] = useState<string[]>([]);
  const [caffeine, setCaffeine] = useState<string[]>([]);
  const [bodyImage, setBodyImage] = useState<string[]>([]);

  return (
    <OnboardingShell
      sprout="happy"
      progress={0.65}
      title="Diet"
      subtitle="Diet at this age matters for growth"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/c-puberty')}
    >
      <View>
        <Text style={styles.fieldLabel}>Diet type</Text>
        <ChipGroup options={DIET} selected={diet} onChange={setDiet} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Regular caffeine — tea or coffee?</Text>
        <ChipGroup options={YES_NO} selected={caffeine} onChange={setCaffeine} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Any dieting, food restriction, or body image concerns noticed?</Text>
        <ChipGroup options={YES_NO} selected={bodyImage} onChange={setBodyImage} />
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
