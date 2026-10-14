import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { typography } from '@/styles/global';

export interface GrowthData {
  weight: number | null;
  height: number | null;
}

interface GrowthCardsProps {
  data: GrowthData;
  /** Makes the whole card pressable (e.g. to the Growth tab). */
  onPress?: () => void;
  /** Legacy per-column handlers (kept for call-site compatibility). */
  onWeightPress?: () => void;
  onHeightPress?: () => void;
  /** "Length" for children under 2 (measured lying down), as on the Growth tab. */
  heightLabel?: 'Height' | 'Length';
}

/**
 * One white hairline card with two columns: Weight | Height. Numbers use the
 * shared `number` preset (22) with a 13 muted unit. No sparklines, no icon
 * wells (the Growth tab owns the chart).
 */
export function GrowthCards({ data, onPress, onWeightPress, onHeightPress, heightLabel = 'Height' }: GrowthCardsProps) {
  const content = (
    <>
      <Column label="Weight" value={data.weight} unit="kg" onPress={onPress ? undefined : onWeightPress} />
      <View style={styles.divider} />
      <Column label={heightLabel} value={data.height} unit="cm" onPress={onPress ? undefined : onHeightPress} />
    </>
  );

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        scaleTo={0.98}
        bg={AppColors.card}
        bgPressed={AppColors.surfaceContainerLow}
        accessibilityLabel={`Weight ${data.weight ?? 'not logged'} kg, height ${data.height ?? 'not logged'} cm`}
        style={styles.card}
      >
        {content}
      </PressableScale>
    );
  }
  return <View style={[styles.card, styles.cardStatic]}>{content}</View>;
}

function Column({
  label,
  value,
  unit,
  onPress,
}: {
  label: string;
  value: number | null;
  unit: string;
  onPress?: () => void;
}) {
  const inner = (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={typography.number}>{value ?? '—'}</Text>
        <Text style={typography.unit}>{unit}</Text>
      </View>
    </>
  );
  if (onPress) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.98} style={styles.column} accessibilityLabel={`${label} ${value ?? 'not logged'} ${unit}`}>
        {inner}
      </PressableScale>
    );
  }
  return <View style={styles.column}>{inner}</View>;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingVertical: 16,
  },
  cardStatic: {
    backgroundColor: AppColors.card,
  },
  column: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 4,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.border,
  },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.muted,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
});
