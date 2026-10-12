import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { TextButton } from '@/components/gradient-button';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, Radius } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const CONDITIONS = [
  'Asthma', 'Type 1 Diabetes', 'Epilepsy',
  'Congenital heart condition', 'Thalassemia', 'None', 'Other',
];
const MED_OPTIONS = ['Yes', 'No'];
const FREQUENCY_OPTIONS = ['Once daily', 'Twice daily', '3× daily', '4× daily', 'As needed'];

interface MedEntry {
  name: string;
  dose: string;
  frequency: string;
}

export default function ConditionsScreen() {
  const { bracket, setConditions: saveConditions } = useOnboarding();
  const [conditions, setConditions] = useState<string[]>([]);
  const [conditionOther, setConditionOther] = useState('');
  const [takingMeds, setTakingMeds] = useState<string[]>([]);
  const [meds, setMeds] = useState<MedEntry[]>([{ name: '', dose: '', frequency: '' }]);

  const updateMed = (index: number, field: keyof MedEntry, value: string) => {
    setMeds((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const addMed = () => setMeds((prev) => [...prev, { name: '', dose: '', frequency: '' }]);

  const removeMed = (index: number) => setMeds((prev) => prev.filter((_, i) => i !== index));

  const handleContinue = () => {
    saveConditions(conditions.filter((c) => c !== 'None' && c !== 'Other').concat(
      conditions.includes('Other') && conditionOther ? [conditionOther] : []
    ));
    if (bracket === 'A') router.push('/(onboarding)/a-birth-history');
    else if (bracket === 'B') router.push('/(onboarding)/b-development');
    else router.push('/(onboarding)/c-academic');
  };

  return (
    <OnboardingShell
      progress={0.48}
      title="Conditions and medicines"
      subtitle="Helps doctors prepare before a consultation"
      ctaLabel="Continue"
      onCta={handleContinue}
    >
      <View>
        <Text style={styles.fieldLabel}>Any diagnosed chronic conditions?</Text>
        <ChipGroup
          options={CONDITIONS}
          selected={conditions}
          onChange={setConditions}
          multiSelect
          noneValue="None"
        />
        {conditions.includes('Other') && (
          <View style={styles.otherField}>
            <TextInputField
              placeholder="Specify condition"
              value={conditionOther}
              onChangeText={setConditionOther}
            />
          </View>
        )}
      </View>

      <View>
        <Text style={styles.fieldLabel}>Currently taking any regular medications?</Text>
        <ChipGroup options={MED_OPTIONS} selected={takingMeds} onChange={setTakingMeds} />
      </View>

      {takingMeds.includes('Yes') && (
        <View style={styles.medsSection}>
          {meds.map((med, index) => (
            <View key={index} style={styles.medCard}>
              <View style={styles.medCardHeader}>
                <Text style={styles.medCardTitle}>Medicine {index + 1}</Text>
                {meds.length > 1 && (
                  <Pressable onPress={() => removeMed(index)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                )}
              </View>

              <TextInputField
                label="Medicine name"
                placeholder="e.g. Paracetamol"
                value={med.name}
                onChangeText={(v) => updateMed(index, 'name', v)}
                autoCapitalize="words"
              />

              <TextInputField
                label="Dose"
                placeholder="e.g. 100mg, 5ml"
                value={med.dose}
                onChangeText={(v) => updateMed(index, 'dose', v)}
                autoCapitalize="none"
              />

              <View>
                <Text style={styles.freqLabel}>How often?</Text>
                <ChipGroup
                  options={FREQUENCY_OPTIONS}
                  selected={med.frequency ? [med.frequency] : []}
                  onChange={(val) => updateMed(index, 'frequency', val[0] ?? '')}
                />
              </View>

              {med.name && med.dose && med.frequency && (
                <Text style={styles.previewText}>
                  {med.name} {med.dose} · {med.frequency}
                </Text>
              )}
            </View>
          ))}

          <TextButton label="Add another medicine" onPress={addMed} style={styles.addButton} />
        </View>
      )}
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
  medsSection: {
    gap: 12,
  },
  otherField: {
    marginTop: 8,
  },
  medCard: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 16,
  },
  medCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  medCardTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: AppColors.onSurface,
  },
  removeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: AppColors.danger,
  },
  freqLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: AppColors.onSurface,
    marginBottom: 8,
  },
  previewText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: AppColors.secondary,
  },
  addButton: {
    alignSelf: 'center',
  },
});
