import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { TextButton } from '@/components/gradient-button';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, Radius } from '@/constants/theme';
import { EMPTY_MEDICATION, useOnboarding, type MedicationEntry } from '@/context/onboarding';

const CONDITIONS = [
  'Asthma', 'Type 1 Diabetes', 'Epilepsy',
  'Congenital heart condition', 'Thalassemia', 'None', 'Other',
];
const MED_OPTIONS = ['Yes', 'No'];
const FREQUENCY_OPTIONS = ['Once daily', 'Twice daily', '3× daily', '4× daily', 'As needed'];

export default function ConditionsScreen() {
  // Answers live in the onboarding context, so Back and forward keep them.
  const { bracket, conditionsAnswers, updateSection } = useOnboarding();
  const { selected, other, takingMeds, medications } = conditionsAnswers;

  const setMeds = (next: MedicationEntry[]) => updateSection('conditionsAnswers', { medications: next });

  const updateMed = (index: number, field: keyof MedicationEntry, value: string) => {
    setMeds(medications.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const addMed = () => setMeds([...medications, { ...EMPTY_MEDICATION }]);

  const removeMed = (index: number) => setMeds(medications.filter((_, i) => i !== index));

  const handleContinue = () => {
    // The path comes from the date of birth. Without it (e.g. a reload part-way
    // through), go back to "Your child" instead of guessing a path.
    if (bracket === 'A') router.push('/(onboarding)/a-birth-history');
    else if (bracket === 'B') router.push('/(onboarding)/b-development');
    else if (bracket === 'C') router.push('/(onboarding)/c-academic');
    else router.dismissTo('/(onboarding)/child-basics');
  };

  return (
    <OnboardingShell
      screen="conditions"
      title="Conditions and medicines"
      subtitle="Helps doctors prepare before a consultation"
      ctaLabel="Continue"
      onCta={handleContinue}
    >
      <View>
        <Text style={styles.fieldLabel}>Any diagnosed chronic conditions?</Text>
        <ChipGroup
          options={CONDITIONS}
          selected={selected}
          onChange={(next) => updateSection('conditionsAnswers', { selected: next })}
          multiSelect
          noneValue="None"
        />
        {selected.includes('Other') && (
          <View style={styles.otherField}>
            <TextInputField
              placeholder="Specify condition"
              accessibilityLabel="Specify condition"
              value={other}
              onChangeText={(v) => updateSection('conditionsAnswers', { other: v })}
            />
          </View>
        )}
      </View>

      <View>
        <Text style={styles.fieldLabel}>Currently taking any regular medications?</Text>
        <ChipGroup
          options={MED_OPTIONS}
          selected={takingMeds ? [takingMeds] : []}
          onChange={(vals) => updateSection('conditionsAnswers', { takingMeds: vals[0] ?? '' })}
        />
      </View>

      {takingMeds === 'Yes' && (
        <View style={styles.medsSection}>
          {medications.map((med, index) => (
            <View key={index} style={styles.medCard}>
              <View style={styles.medCardHeader}>
                <Text style={styles.medCardTitle}>Medicine {index + 1}</Text>
                {medications.length > 1 && (
                  <Pressable
                    onPress={() => removeMed(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove medicine ${index + 1}`}
                    style={styles.removeButton}
                  >
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

              {/* Boolean guard: a bare '' here would be a text node outside <Text>. */}
              {!!(med.name && med.dose && med.frequency) && (
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
  removeButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginVertical: -12,
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
