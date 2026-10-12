import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';

const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Other'];
const LANGUAGES = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu'];

export default function ParentDetailsScreen() {
  const [name, setName] = useState('');
  const [city, setCity] = useState<string[]>([]);
  const [language, setLanguage] = useState<string[]>([]);

  return (
    <OnboardingShell
      progress={0.05}
      title="About you"
      subtitle="So we can personalise LilSteps for you"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/add-child')}
    >
      <TextInputField
        label="Full name"
        hint="(Parent or Guardian)"
        hintInline
        placeholder="e.g. Sarah Johnson"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="name"
      />

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>City</Text>
        <ChipGroup options={CITIES} selected={city} onChange={setCity} />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Preferred language</Text>
        <ChipGroup options={LANGUAGES} selected={language} onChange={setLanguage} />
      </View>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
  },
});
