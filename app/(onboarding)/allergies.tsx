import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, Radius } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const MED_ALLERGIES = ['Penicillin', 'Sulfa drugs', 'Aspirin', 'Ibuprofen', 'Codeine', 'Not known', 'Other'];
const FOOD_ALLERGIES = ['Nuts', 'Dairy', 'Eggs', 'Shellfish', 'Gluten', 'Soy', 'Not known', 'Other'];
const OTHER_ALLERGIES = ['Latex', 'Dust', 'Pollen', 'Animal dander', 'Insect stings', 'Not known', 'Other'];

export default function AllergiesScreen() {
  const { childName, setAllergies: saveAllergies } = useOnboarding();
  const displayName = childName || 'your child';

  const [medAllergies, setMedAllergies] = useState<string[]>([]);
  const [foodAllergies, setFoodAllergies] = useState<string[]>([]);
  const [otherAllergies, setOtherAllergies] = useState<string[]>([]);
  const [medOther, setMedOther] = useState('');
  const [foodOther, setFoodOther] = useState('');
  const [otherOther, setOtherOther] = useState('');

  // Collect all selected allergies (excluding "None" and "Other") for preview
  const allSelected = [
    ...medAllergies.filter((a) => a !== 'Not known' && a !== 'Other'),
    ...(medAllergies.includes('Other') && medOther ? [medOther] : []),
    ...foodAllergies.filter((a) => a !== 'Not known' && a !== 'Other'),
    ...(foodAllergies.includes('Other') && foodOther ? [foodOther] : []),
    ...otherAllergies.filter((a) => a !== 'Not known' && a !== 'Other'),
    ...(otherAllergies.includes('Other') && otherOther ? [otherOther] : []),
  ];

  return (
    <OnboardingShell
      progress={0.38}
      title={`Does ${displayName} have any known allergies?`}
      subtitle="This will be flagged to every doctor, every time."
      ctaLabel="Continue"
      onCta={() => { saveAllergies(allSelected); router.push('/(onboarding)/conditions'); }}
    >
      {/* Medication allergies */}
      <View>
        <Text style={styles.sectionTitle}>Medication allergies</Text>
        <ChipGroup
          options={MED_ALLERGIES}
          selected={medAllergies}
          onChange={setMedAllergies}
          multiSelect
          noneValue="Not known"
        />
        {medAllergies.includes('Other') && (
          <TextInputField
            placeholder="Specify medication allergy"
            value={medOther}
            onChangeText={setMedOther}
          />
        )}
      </View>

      {/* Food allergies */}
      <View>
        <Text style={styles.sectionTitle}>Food allergies</Text>
        <ChipGroup
          options={FOOD_ALLERGIES}
          selected={foodAllergies}
          onChange={setFoodAllergies}
          multiSelect
          noneValue="Not known"
        />
        {foodAllergies.includes('Other') && (
          <TextInputField
            placeholder="Specify food allergy"
            value={foodOther}
            onChangeText={setFoodOther}
          />
        )}
      </View>

      {/* Other allergies */}
      <View>
        <Text style={styles.sectionTitle}>Other allergies</Text>
        <ChipGroup
          options={OTHER_ALLERGIES}
          selected={otherAllergies}
          onChange={setOtherAllergies}
          multiSelect
          noneValue="Not known"
        />
        {otherAllergies.includes('Other') && (
          <TextInputField
            placeholder="Specify other allergy"
            value={otherOther}
            onChangeText={setOtherOther}
          />
        )}
      </View>

      {/* Allergy preview badge */}
      {allSelected.length > 0 && (
        <View style={styles.badge}>
          <Ionicons name="alert-circle" size={14} color={AppColors.danger} style={styles.badgeIcon} />
          <Text style={styles.badgeText}>
            Allergy alert: {allSelected.join(', ')}
          </Text>
        </View>
      )}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
    marginBottom: 8,
  },
  badge: {
    backgroundColor: AppColors.dangerSurface,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 6,
  },
  badgeIcon: {
    marginTop: 2,
  },
  badgeText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
    flex: 1,
  },
});
