import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, Radius } from '@/constants/theme';
import {
  ALLERGY_NONE,
  ALLERGY_NOT_KNOWN,
  ALLERGY_OTHER,
  useOnboarding,
  type AllergyGroup,
} from '@/context/onboarding';

/** Answer chips at the end of every group: "None" and "Not known" are kept
 *  apart, so "we don't know" is never saved as "no allergies". */
const ANSWER_CHIPS = [ALLERGY_NONE, ALLERGY_NOT_KNOWN, ALLERGY_OTHER];

const GROUPS: { key: AllergyGroup; title: string; options: string[]; otherPlaceholder: string }[] = [
  {
    key: 'medication',
    title: 'Medication allergies',
    options: ['Penicillin', 'Sulfa drugs', 'Aspirin', 'Ibuprofen', 'Codeine', ...ANSWER_CHIPS],
    otherPlaceholder: 'Specify medication allergy',
  },
  {
    key: 'food',
    title: 'Food allergies',
    options: ['Nuts', 'Dairy', 'Eggs', 'Shellfish', 'Gluten', 'Soy', ...ANSWER_CHIPS],
    otherPlaceholder: 'Specify food allergy',
  },
  {
    key: 'environmental',
    title: 'Other allergies',
    options: ['Latex', 'Dust', 'Pollen', 'Animal dander', 'Insect stings', ...ANSWER_CHIPS],
    otherPlaceholder: 'Specify other allergy',
  },
];

/**
 * ChipGroup makes "None" exclusive (noneValue). "Not known" must be exclusive
 * too: picking it clears the rest, and picking anything else clears it.
 */
function withExclusiveNotKnown(prev: string[], next: string[]): string[] {
  const added = !prev.includes(ALLERGY_NOT_KNOWN) && next.includes(ALLERGY_NOT_KNOWN);
  if (added) return [ALLERGY_NOT_KNOWN];
  if (next.length > 1) return next.filter((s) => s !== ALLERGY_NOT_KNOWN);
  return next;
}

export default function AllergiesScreen() {
  // Answers live in the onboarding context, so Back and forward keep them.
  const { childName, allergyAnswers, setAllergyGroup, allergies } = useOnboarding();
  const displayName = childName || 'your child';

  return (
    <OnboardingShell
      screen="allergies"
      title={`Does ${displayName} have any known allergies?`}
      subtitle="This will be flagged to every doctor, every time."
      ctaLabel="Continue"
      onCta={() => router.push('/(onboarding)/conditions')}
    >
      {GROUPS.map((group) => {
        const answer = allergyAnswers[group.key];
        return (
          <View key={group.key}>
            <Text style={styles.sectionTitle}>{group.title}</Text>
            <ChipGroup
              options={group.options}
              selected={answer.selected}
              onChange={(next) =>
                setAllergyGroup(group.key, { selected: withExclusiveNotKnown(answer.selected, next) })
              }
              multiSelect
              noneValue={ALLERGY_NONE}
            />
            {answer.selected.includes(ALLERGY_OTHER) && (
              <View style={styles.otherField}>
                <TextInputField
                  placeholder={group.otherPlaceholder}
                  accessibilityLabel={group.otherPlaceholder}
                  value={answer.other}
                  onChangeText={(other) => setAllergyGroup(group.key, { other })}
                />
              </View>
            )}
          </View>
        );
      })}

      {/* Allergy preview badge */}
      {allergies.length > 0 && (
        <View style={styles.badge}>
          <Ionicons name="alert-circle" size={14} color={AppColors.danger} style={styles.badgeIcon} />
          <Text style={styles.badgeText}>
            Allergy alert: {allergies.map((a) => a.name).join(', ')}
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
  // Same gap as the "Other" field on the conditions screen.
  otherField: {
    marginTop: 8,
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
