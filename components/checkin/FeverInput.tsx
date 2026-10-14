import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppColors, FontFamily } from '@/constants/theme';

import { spaceSelects } from './spaceKey';

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

/** A body temperature in °C is never above this; a bigger number is °F (C6). */
const MAX_CELSIUS = 45;
/** Readings outside these (°C) are almost certainly typos. */
const PLAUSIBLE_C = { min: 34, max: 43.5 };

/**
 * The unit a reading is really in: over 45 can only be °F, and 45 or under
 * can only be °C (no child has a body temperature of 40°F).
 */
export function effectiveUnit(num: number, unit: TempUnit): TempUnit {
  if (Number.isNaN(num)) return unit;
  return num > MAX_CELSIUS ? 'F' : 'C';
}

function toCelsius(num: number, unit: TempUnit): number {
  return unit === 'F' ? ((num - 32) * 5) / 9 : num;
}

/** Normalised reading, or null when nothing (or nothing sensible) was typed. */
function readTemp(value: string, unit: TempUnit): { num: number; unit: TempUnit; plausible: boolean } | null {
  const num = parseFloat(value.replace(',', '.'));
  if (Number.isNaN(num)) return null;
  const u = effectiveUnit(num, unit);
  const c = toCelsius(num, u);
  return { num, unit: u, plausible: c >= PLAUSIBLE_C.min && c <= PLAUSIBLE_C.max };
}

export interface FeverInputProps {
  value: string;
  unit: TempUnit;
  onValueChange: (v: string) => void;
  onUnitChange: (u: TempUnit) => void;
}

export function FeverInput({ value, unit, onValueChange, onUnitChange }: FeverInputProps) {
  const reading = readTemp(value, unit);
  const tempInC = reading?.plausible ? toCelsius(reading.num, reading.unit) : null;
  const level = tempInC !== null ? getFeverLevel(tempInC) : null;
  const barWidth = tempInC !== null ? Math.min(Math.max((tempInC - 36) / 4, 0), 1) : 0;
  const unitSwapped = !!reading && reading.plausible && reading.unit !== unit;

  const unitButton = (u: TempUnit, label: string, name: string) => (
    <Pressable
      style={[styles.unit, unit === u && styles.unitActive]}
      onPress={() => onUnitChange(u)}
      {...spaceSelects(() => onUnitChange(u))}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: unit === u, selected: unit === u }}
      aria-checked={unit === u}
    >
      <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Temperature</Text>
          {/* °C / °F is a radio group so the chosen unit is announced on web too. */}
          <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel="Temperature unit">
            {unitButton('F', '°F', 'Fahrenheit')}
            {unitButton('C', '°C', 'Celsius')}
          </View>
        </View>

        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onValueChange}
            keyboardType="decimal-pad"
            accessibilityLabel="Temperature"
            accessibilityHint={unit === 'C' ? 'In degrees Celsius' : 'In degrees Fahrenheit'}
            // "e.g." so the hint never reads as an already-entered value (C6).
            placeholder={unit === 'C' ? 'e.g. 38.5' : 'e.g. 101.5'}
            placeholderTextColor={AppColors.placeholder}
            maxLength={5}
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

        {reading && unitSwapped ? (
          <Text style={styles.hint} accessibilityLiveRegion="polite">
            {reading.num}°{reading.unit === 'F' ? 'C' : 'F'} isn&apos;t possible, so we&apos;ll read it as{' '}
            {reading.num}°{reading.unit}.
          </Text>
        ) : null}
        {reading && !reading.plausible ? (
          <Text style={[styles.hint, styles.hintWarn]} accessibilityLiveRegion="polite">
            Please check the number. A child&apos;s temperature is usually between 95 and 106°F (35 to 41°C).
          </Text>
        ) : null}
    </View>
  );
}

/**
 * "Fever (temperature: 101.5°F)". The unit is corrected when the number only
 * fits the other one (C6); an implausible number is passed on as typed and
 * marked, so the doctor never sees "101.5°C".
 */
export function buildFeverComplaint(value: string, unit: TempUnit): string | null {
  if (!value.trim()) return null;
  const reading = readTemp(value, unit);
  if (!reading) return null;
  if (!reading.plausible) return `Fever (temperature entered: ${value.trim()}, please check)`;
  return `Fever (temperature: ${reading.num}°${reading.unit})`;
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
  // Both rows wrap at 200% zoom / narrow widths instead of spilling off the card.
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
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
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 8 },
  input: {
    flexGrow: 1,
    flexBasis: 96,
    // Lets the field shrink inside the card instead of pushing it wider.
    minWidth: 0,
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
  severity: { gap: 6, flexShrink: 0 },
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
  hint: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.onSurfaceVariant },
  hintWarn: { color: AppColors.warning },
});
