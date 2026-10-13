import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';
import { formatAgeLabel, getAgeParts } from '@/lib/age';
import { typography } from '@/styles/global';

/** "Don't know" stays in context so the chip is restored on Back; confirm
 *  saves it as NULL (it is not a blood group). */
const BLOOD_GROUP_UNKNOWN = "Don't know";
const BLOOD_GROUPS = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-', BLOOD_GROUP_UNKNOWN];

/** Values outside these can't be a real child's measurement: Continue is blocked. */
const WEIGHT_LIMITS = { min: 0.3, max: 200 }; // kg
const HEIGHT_LIMITS = { min: 20, max: 220 }; // cm

/**
 * Wide, plausible ranges by age (in completed months), roughly beyond the
 * 1st–99th percentile of the WHO / IAP charts. A value outside the range for
 * the child's age is NOT blocked; the parent sees a gentle "Please check".
 */
const PLAUSIBLE_BY_AGE: { underMonths: number; weight: [number, number]; height: [number, number] }[] = [
  { underMonths: 1, weight: [1.5, 6], height: [40, 62] },
  { underMonths: 6, weight: [2.5, 11], height: [45, 75] },
  { underMonths: 12, weight: [5, 14], height: [58, 85] },
  { underMonths: 24, weight: [6.5, 18], height: [68, 100] },
  { underMonths: 36, weight: [8, 21], height: [78, 108] },
  { underMonths: 60, weight: [9.5, 28], height: [85, 125] },
  { underMonths: 108, weight: [12, 50], height: [100, 150] },
  { underMonths: 144, weight: [17, 80], height: [115, 175] },
  { underMonths: 192, weight: [22, 110], height: [125, 195] },
];

/** Parses "12.5" or "12,5"; null for empty, NaN for text that isn't a number. */
function parseMeasure(value: string): number | null {
  const v = value.trim().replace(',', '.');
  if (!v) return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(v) ? parseFloat(v) : NaN;
}

type Check = { error?: string; warning?: string };

function checkMeasure(
  raw: string,
  unit: 'kg' | 'cm',
  limits: { min: number; max: number },
  plausible: [number, number] | null,
  ageText: string,
): Check {
  const value = parseMeasure(raw);
  if (value === null) return {};
  if (Number.isNaN(value)) return { error: 'Enter a number, e.g. 12.5' };
  if (value < limits.min || value > limits.max) {
    return { error: `${value} ${unit} doesn't look right. Please check the number.` };
  }
  if (plausible && (value < plausible[0] || value > plausible[1])) {
    return {
      warning: `Please check: ${value} ${unit} is unusual for ${ageText}. If it's right, you can continue.`,
    };
  }
  return {};
}

export default function PhysicalScreen() {
  // Answers live in the onboarding context, so Back and forward keep them.
  const { dob, weight, setWeight, height, setHeight, bloodGroup, setBloodGroup } = useOnboarding();

  const age = dob ? getAgeParts(dob) : null;
  const range = age ? PLAUSIBLE_BY_AGE.find((r) => age.totalMonths < r.underMonths) ?? null : null;
  const ageLabel = dob ? formatAgeLabel(dob) : '';
  const ageText = ageLabel === 'Newborn' ? 'a newborn' : ageLabel ? `a child aged ${ageLabel}` : 'this age';

  const weightCheck = checkMeasure(weight, 'kg', WEIGHT_LIMITS, range?.weight ?? null, ageText);
  const heightCheck = checkMeasure(height, 'cm', HEIGHT_LIMITS, range?.height ?? null, ageText);
  const hasError = !!(weightCheck.error || heightCheck.error);

  const handleContinue = () => {
    if (hasError) return;
    router.push('/(onboarding)/allergies');
  };

  return (
    <OnboardingShell
      screen="physical"
      title="Physical measurements"
      subtitle="Helps ensure medication dosing is always accurate"
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
          placeholder="e.g. 12.5"
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
          placeholder="e.g. 85"
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
