import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily } from '@/constants/theme';
import type { GrowthRow } from '@/hooks/useGrowth';
import { formatDate } from '@/lib/date';

import { formatHeight, formatWeight } from './format';
import { typography } from '@/styles/global';

/**
 * One history row: date (13 muted) | weight | height (15 SemiBold), 44 high,
 * hairline on top, with the entry's note (if any) underneath. Tapping it opens the entry to edit or delete. `prev` is
 * accepted for call-site compatibility; the old trend arrows were decorative
 * and are no longer drawn.
 */
export function MeasurementRow({
  entry,
  onPress,
  heightLabel = 'Height',
}: {
  entry: GrowthRow;
  prev?: GrowthRow;
  onPress?: () => void;
  heightLabel?: string;
}) {
  // A record: always "13 Oct 2026" (en-IN, local date).
  const dateStr = formatDate(entry.measured_at, { year: 'always' });
  const weightStr = entry.weight == null ? '—' : `${formatWeight(entry.weight)} kg`;
  const heightStr = entry.height == null ? '—' : `${formatHeight(entry.height)} cm`;
  // The note saved with the entry (R2-15): shown under the numbers.
  const note = entry.note?.trim() || null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${dateStr}: weight ${weightStr}, ${heightLabel.toLowerCase()} ${heightStr}${note ? `. Note: ${note}` : ''}${onPress ? '. Edit' : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.cells}>
        <Text style={[typography.meta, styles.cell]}>{dateStr}</Text>
        <Text style={[styles.value, styles.cell]}>{weightStr}</Text>
        <Text style={[styles.value, styles.cell]}>{heightStr}</Text>
        <View style={styles.chevron}>
          {onPress ? <Ionicons name="create-outline" size={16} color={AppColors.outline} /> : null}
        </View>
      </View>
      {note ? <Text style={[typography.caption, styles.note]}>{note}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    paddingVertical: 6,
    justifyContent: 'center',
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  pressed: { backgroundColor: AppColors.surfaceContainerLow },
  cells: { flexDirection: 'row', alignItems: 'center' },
  note: { paddingRight: 20 },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  chevron: { width: 20, alignItems: 'flex-end' },
  value: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.onSurface,
    fontVariant: ['tabular-nums'],
  },
});
