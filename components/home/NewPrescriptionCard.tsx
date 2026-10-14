import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { StatusPill } from '@/components/ui/StatusPill';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { formatDate } from '@/lib/date';

interface NewPrescriptionCardProps {
  doctorName: string;
  issuedAt: string;
  /** More new prescriptions besides this one (for the same child). */
  moreCount?: number;
  onPress: () => void;
}

/**
 * Home card for a prescription the parent hasn't opened yet:
 * "New prescription from Dr. Emily Chen". Tapping opens it.
 */
export function NewPrescriptionCard({ doctorName, issuedAt, moreCount = 0, onPress }: NewPrescriptionCardProps) {
  // Narrow screen (small phone, 200% zoom) or large text: drop the icon well
  // and let the title and meta wrap instead of cutting off ("New pre…", R3-16).
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.3;
  const date = formatDate(issuedAt);
  const meta = [`Issued ${date}`, moreCount > 0 ? `+${moreCount} more new` : null].filter(Boolean).join(' · ');
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`New prescription from ${doctorName}. ${meta}. Open`}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      style={[styles.card, compact && styles.cardCompact]}
    >
      {compact ? null : (
        <View style={styles.iconWell}>
          <Ionicons name="medkit-outline" size={18} color={AppColors.primary} />
        </View>
      )}
      <View style={styles.text}>
        <StatusPill dot tone="success" label="New" />
        <Text style={styles.title}>New prescription from {doctorName}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={AppColors.outline} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  cardCompact: { gap: 8, paddingHorizontal: 12 },
  iconWell: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 4 },
  title: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
    color: AppColors.onSurface,
  },
  meta: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
});
