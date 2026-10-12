import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppColors } from '@/constants/theme';

const FEVER_LEVELS = [
  { max: 37.4, label: 'Normal',     color: AppColors.successGreen },
  { max: 37.9, label: 'Low Grade',  color: AppColors.warningAmber },
  { max: 38.9, label: 'Fever',      color: AppColors.orange },
  { max: 99,   label: 'High Fever', color: AppColors.errorRed },
];

function getFeverLevel(temp: number) {
  return FEVER_LEVELS.find((l) => temp <= l.max) ?? FEVER_LEVELS[3];
}

export type TempUnit = 'C' | 'F';

export interface FeverInputProps {
  value: string;
  unit: TempUnit;
  onValueChange: (v: string) => void;
  onUnitChange: (u: TempUnit) => void;
}

export function FeverInput({ value, unit, onValueChange, onUnitChange }: FeverInputProps) {
  const num = parseFloat(value);
  const tempInC = !isNaN(num) ? (unit === 'F' ? ((num - 32) * 5) / 9 : num) : null;
  const level = tempInC !== null ? getFeverLevel(tempInC) : null;
  const barWidth = tempInC !== null ? Math.min(Math.max((tempInC - 36) / 4, 0), 1) : 0;

  return (
    <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Temperature</Text>
          <View style={styles.toggle}>
            <Pressable
              style={[styles.unit, unit === 'C' && styles.unitActive]}
              onPress={() => onUnitChange('C')}
              accessibilityRole="button"
              accessibilityState={{ selected: unit === 'C' }}
            >
              <Text style={[styles.unitText, unit === 'C' && styles.unitTextActive]}>°C</Text>
            </Pressable>
            <Pressable
              style={[styles.unit, unit === 'F' && styles.unitActive]}
              onPress={() => onUnitChange('F')}
              accessibilityRole="button"
              accessibilityState={{ selected: unit === 'F' }}
            >
              <Text style={[styles.unitText, unit === 'F' && styles.unitTextActive]}>°F</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onValueChange}
            keyboardType="decimal-pad"
            placeholder={unit === 'C' ? '38.5' : '101.3'}
            placeholderTextColor={AppColors.placeholder}
          />
          {level && (
            <View style={styles.severity}>
              <Text style={[styles.severityLabel, { color: level.color }]}>
                {level.label}
              </Text>
              <View style={styles.bar}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.round(barWidth * 100)}%` as any, backgroundColor: level.color },
                  ]}
                />
              </View>
            </View>
          )}
        </View>
    </View>
  );
}

export function buildFeverComplaint(value: string, unit: TempUnit): string | null {
  if (!value) return null;
  return `Fever (temperature: ${value}°${unit})`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: AppColors.onSurface },
  toggle: {
    flexDirection: 'row',
    backgroundColor: AppColors.surfaceContainerHigh,
    borderRadius: 999,
    padding: 3,
  },
  unit: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  unitActive: { backgroundColor: AppColors.surfaceContainerLowest },
  unitText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: AppColors.onSurfaceVariant },
  unitTextActive: { color: AppColors.primary, fontFamily: 'Inter_700Bold' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: AppColors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: AppColors.forestDeep,
    borderWidth: 1.5,
    borderColor: AppColors.fieldBorder,
    ...(Platform.OS === 'web' ? { outlineStyle: 'solid' as const, outlineWidth: 0 } : null),
  },
  severity: { gap: 6 },
  severityLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  bar: {
    width: 88,
    height: 6,
    borderRadius: 999,
    backgroundColor: AppColors.surfaceContainerHighest,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 999 },
});
