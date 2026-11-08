import { StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius, Spacing } from '@/constants/theme';
import { typography } from '@/styles/global';

/**
 * Wording asked for by Dr Madhav's early testers (8 Nov 2026), kept exact.
 * Stops parents reusing an old dose for a new illness. Also added to the
 * shared prescription text and the doctor dashboard's prescription card.
 */
export const PRESCRIPTION_DISCLAIMER =
  'Past records are for reference only—pediatric doses are strictly calculated on current weight, so never reuse past prescriptions without an active pediatric review.';

/** The disclaimer in bold inside a light grey box. */
export function PrescriptionDisclaimer() {
  return (
    <View style={styles.box}>
      <Text style={[typography.bodySM, styles.text]}>{PRESCRIPTION_DISCLAIMER}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: AppColors.borderStrong,
    backgroundColor: AppColors.surfaceContainer,
  },
  text: { fontFamily: FontFamily.bold, color: AppColors.onSurface },
});
