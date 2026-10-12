import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';

const TERM = ['Full term', 'Premature'];
const DELIVERY = ['Normal vaginal', 'C-section', 'Assisted'];
const COMPLICATIONS = ['NICU stay', 'Neonatal jaundice', 'Breathing support', 'None'];

export default function BirthHistoryScreen() {
  const [term, setTerm] = useState<string[]>([]);
  const [weeks, setWeeks] = useState('');
  const [delivery, setDelivery] = useState<string[]>([]);
  const [birthWeight, setBirthWeight] = useState('');
  const [complications, setComplications] = useState<string[]>([]);

  return (
    <OnboardingShell
      progress={0.58}
      title="Birth history"
      subtitle="Helps doctors understand early development"
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/a-feeding')}
    >
      <View>
        <Text style={styles.fieldLabel}>Full term or premature?</Text>
        <ChipGroup options={TERM} selected={term} onChange={setTerm} />
      </View>

      {term.includes('Premature') && (
        <TextInputField
          label="How many weeks?"
          placeholder="e.g. 34"
          value={weeks}
          onChangeText={setWeeks}
          keyboardType="number-pad"
        />
      )}

      <View>
        <Text style={styles.fieldLabel}>Mode of delivery</Text>
        <ChipGroup options={DELIVERY} selected={delivery} onChange={setDelivery} />
      </View>

      <TextInputField
        label="Birth weight"
        hint="(kg)"
        hintInline
        placeholder="e.g. 2.8"
        value={birthWeight}
        onChangeText={setBirthWeight}
        keyboardType="decimal-pad"
      />

      <View>
        <Text style={styles.fieldLabel}>Any birth complications?</Text>
        <ChipGroup
          options={COMPLICATIONS}
          selected={complications}
          onChange={setComplications}
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
