import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';

const LEVELS = [1, 2, 3, 4] as const;
const LABELS = ['', 'Mild', 'Moderate', 'Concerning', 'Urgent'];
const COLORS = [
  'transparent',
  AppColors.successGreenBright,
  AppColors.starGold,
  AppColors.orange,
  AppColors.errorRed,
];

export interface SeverityDotsProps {
  value: number;
  onChange: (level: number) => void;
}

export function SeverityDots({ value, onChange }: SeverityDotsProps) {
  return (
    <View style={styles.row}>
      {LEVELS.map((level) => {
        const isFilled = value >= level;
        return (
          <Pressable
            key={level}
            style={[
              styles.dot,
              isFilled && { backgroundColor: COLORS[level], borderColor: 'transparent' },
            ]}
            onPress={() => onChange(level)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Severity ${LABELS[level]}`}
          />
        );
      })}
      <Text style={styles.label}>{LABELS[value]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.border,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: AppColors.onSurface,
    marginLeft: 4,
  },
});
