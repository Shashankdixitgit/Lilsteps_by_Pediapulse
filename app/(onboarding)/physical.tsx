import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { checkMeasure, measurePlaceholders } from '@/components/growth/measurementLimits';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';
import { typography } from '@/styles/global';

/** "Don't know" stays in context so the chip is restored on Back; confirm
 *  saves it as NULL (it is not a blood group). */
const BLOOD_GROUP_UNKNOWN = "Don't know";
const BLOOD_GROUPS = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-', BLOOD_GROUP_UNKNOWN];

export default function PhysicalScreen() {
  // Answers live in the onboarding context, so Back and forward keep them.
  const { dob, weight, setWeight, height, setHeight, bloodGroup, setBloodGroup } = useOnboarding();

  // Same limits, ranges and "Did you mean 3.4 kg?" hints as the growth log.
  // Age-typical examples: "e.g. 3.4" for a newborn, not a toddler's 12.5 (R3-21).
  const placeholders = measurePlaceholders(dob);
  const weightCheck = checkMeasure(weight, 'kg', dob, new Date(), { action: 'continue' });
  const heightCheck = checkMeasure(height, 'cm', dob, new Date(), { action: 'continue' });
  const hasError = !!(weightCheck.error || heightCheck.error);

  const handleContinue = () => {
    if (hasError) return;
    router.push('/(onboarding)/allergies');
  };

  return (
    <OnboardingShell
      screen="physical"
      title="Physical measurements"
      subtitle="Helps your doctor track growth and plan care at a visit"
      ctaLabel="Continue"
      onCta={handleContinue}
      ctaDisabled={hasError}
      footerExtra={
        hasError ? (
          <Text style={[typography.caption, styles.missingHint]}>Fix the highlighted number to continue</Text>
        ) : null
      }
    >
      <View style={styles.measureGroup}>
        <TextInputField
          label="Weight"
          hint="(kg)"
          hintInline
          placeholder={placeholders.weight}
          value={weight}
          onChangeText={(v) => setWeight(v.replace(',', '.'))}
          keyboardType="decimal-pad"
          error={weightCheck.error}
        />
        {weightCheck.warning ? <MeasureWarning text={weightCheck.warning} /> : null}
      </View>

      <View style={styles.measureGroup}>
        <TextInputField
          label="Height"
          hint="(cm)"
          hintInline
          placeholder={placeholders.height}
          value={height}
          onChangeText={(v) => setHeight(v.replace(',', '.'))}
          keyboardType="decimal-pad"
          error={heightCheck.error}
        />
        {heightCheck.warning ? <MeasureWarning text={heightCheck.warning} /> : null}
      </View>

      <View>
        <Text style={styles.fieldLabel}>Blood group</Text>
        <ChipGroup
          label="Blood group"
          options={BLOOD_GROUPS}
          selected={bloodGroup ? [bloodGroup] : []}
          onChange={(vals) => setBloodGroup(vals[0] ?? '')}
        />
      </View>
    </OnboardingShell>
  );
}

/** Gentle, non-blocking "Please check" under a field (warning colour + icon). */
function MeasureWarning({ text }: { text: string }) {
  return (
    <View style={styles.warningRow} accessibilityRole="text" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle-outline" size={14} color={AppColors.warning} style={styles.warningIcon} />
      <Text style={styles.warningText}>{text}</Text>
    </View>
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
  measureGroup: {
    gap: 6,
  },
  warningRow: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 2,
  },
  warningIcon: {
    marginTop: 1,
  },
  warningText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.warning,
  },
  missingHint: {
    textAlign: 'center',
  },
});
