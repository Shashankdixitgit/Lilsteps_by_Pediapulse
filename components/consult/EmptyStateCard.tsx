import { StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius } from '@/constants/theme';

export interface EmptyStateCardProps {
  /** Kept for call-site compatibility; no illustration is drawn any more. */
  icon: string;
  title: string;
  /** Kept for call-site compatibility; not rendered (one line only). */
  body?: string;
}

/**
 * In-section empty state (consult tab): one 13 muted line in a hairline card.
 * No Sprout or illustration, so a populated screen never shows several mascots.
 */
export function EmptyStateCard({ title }: EmptyStateCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.text}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.muted,
    textAlign: 'center',
  },
});
