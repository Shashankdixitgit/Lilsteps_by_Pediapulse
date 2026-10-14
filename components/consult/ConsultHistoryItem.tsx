import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Size } from '@/constants/theme';

export interface ConsultHistoryItemProps {
  id: string;
  createdAt: string; // ISO datetime
  doctorName: string;
  chiefComplaint: string | null;
  outcome: string | null;
  onPress: (id: string) => void;
  /** Hairline top divider when stacked inside one parent list card. */
  divider?: boolean;
}

/**
 * Past consultation as a list row (sits inside one parent card): complaint
 * 15 SemiBold, plain meta "12 Oct · Dr Name" 13 muted, optional 1-line
 * outcome, trailing chevron. No date badge or meta icons.
 */
export function ConsultHistoryItem({
  id,
  createdAt,
  doctorName,
  chiefComplaint,
  outcome,
  onPress,
  divider,
}: ConsultHistoryItemProps) {
  const d = new Date(createdAt);
  const date = `${d.getDate()} ${d.toLocaleDateString('en-IN', { month: 'short' })}`;
  const meta = doctorName ? `${date} · ${doctorName}` : date;

  return (
    <PressableScale
      onPress={() => onPress(id)}
      scaleTo={0.99}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      accessibilityLabel={`${chiefComplaint ?? 'Consultation'}, ${meta}`}
      style={[styles.row, divider && styles.divider]}
    >
      <View style={styles.info}>
        <Text style={styles.complaint} numberOfLines={1}>
          {chiefComplaint ?? 'Consultation'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        {outcome ? (
          <Text style={styles.outcome} numberOfLines={1}>
            {outcome}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={Size.iconRow} color={AppColors.outlineVariant} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.border },
  info: { flex: 1, gap: 2 },
  complaint: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  meta: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  outcome: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.onSurfaceVariant },
});
