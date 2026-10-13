import { StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily } from '@/constants/theme';
import type { GrowthRow } from '@/hooks/useGrowth';
import { formatDate } from '@/lib/date';
import { typography } from '@/styles/global';

/**
 * One history row: date (13 muted) | weight | height (15 SemiBold), 44 high,
 * hairline on top. `prev` is accepted for call-site compatibility; the old
 * trend arrows were decorative and are no longer drawn.
 */
export function MeasurementRow({ entry }: { entry: GrowthRow; prev?: GrowthRow }) {
  // A record: always "13 Oct 2026" (en-IN, local date).
  const dateStr = formatDate(entry.measured_at, { year: 'always' });

  return (
    <View style={styles.row}>
      <Text style={[typography.meta, styles.cell]}>{dateStr}</Text>
      <Text style={[styles.value, styles.cell]}>{entry.weight == null ? '—' : `${Number(entry.weight).toFixed(1)} kg`}</Text>
      <Text style={[styles.value, styles.cell]}>{entry.height == null ? '—' : `${Number(entry.height).toFixed(1)} cm`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  cell: {
    flex: 1,
  },
  value: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.onSurface,
    fontVariant: ['tabular-nums'],
  },
});
