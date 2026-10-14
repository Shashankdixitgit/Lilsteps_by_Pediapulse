import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { formatDate, parseDateOnly, toDateOnlyString } from '@/lib/date';

interface DateFieldProps {
  label: string;
  /** 'YYYY-MM-DD' (a local calendar date), or '' for "not chosen yet". */
  value: string;
  /** Shown while `value` is '' (native). */
  placeholder?: string;
  onChange: (value: string) => void;
  /** Inclusive bounds, 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
}

/**
 * Date-only field styled like TextInputField. Web: the browser's date input.
 * iOS: the compact inline picker. Android: a field that opens the system
 * dialog. Values are always local 'YYYY-MM-DD' strings, never UTC.
 */
export function DateField({ label, value, onChange, min, max, placeholder = 'Choose a date' }: DateFieldProps) {
  const [androidOpen, setAndroidOpen] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const minDate = min ? parseDateOnly(min) : undefined;
  const maxDate = max ? parseDateOnly(max) : undefined;
  const empty = !value;
  // The pickers need a real Date: with no value yet they open on `max`
  // (or today), but nothing is chosen until the parent picks a day.
  const date = empty ? (maxDate ?? new Date()) : parseDateOnly(value);
  const valueText = empty ? placeholder : formatDate(value, { year: 'always' });

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'web' ? (
        <View style={styles.field}>
          <input
            type="date"
            aria-label={label}
            value={value}
            min={min}
            max={max}
            onChange={(e: { target: { value: string } }) => {
              if (e.target.value) onChange(e.target.value);
            }}
            style={{
              flex: 1,
              minHeight: 45,
              padding: '0 14px',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontFamily: FontFamily.regular,
              fontSize: 16,
              color: empty ? AppColors.muted : AppColors.onSurface,
              cursor: 'pointer',
              minWidth: 0,
            }}
          />
        </View>
      ) : Platform.OS === 'ios' && empty ? (
        <>
          <Pressable
            onPress={() => setIosOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${label}, not chosen. Choose a date`}
            style={({ pressed }) => [styles.field, styles.pressField, pressed && styles.pressed]}
          >
            <Ionicons name="calendar-outline" size={Size.iconRow} color={AppColors.outline} />
            <Text style={[styles.valueText, styles.placeholderText]}>{valueText}</Text>
            <Ionicons name="chevron-down" size={16} color={AppColors.onSurfaceVariant} />
          </Pressable>
          {iosOpen ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="inline"
              minimumDate={minDate}
              maximumDate={maxDate}
              onChange={(_, d) => {
                if (d) {
                  setIosOpen(false);
                  onChange(toDateOnlyString(d));
                }
              }}
              accessibilityLabel={label}
              themeVariant="light"
            />
          ) : null}
        </>
      ) : Platform.OS === 'ios' ? (
        <View style={[styles.field, styles.iosField]}>
          <Ionicons name="calendar-outline" size={Size.iconRow} color={AppColors.outline} />
          <DateTimePicker
            value={date}
            mode="date"
            display="compact"
            minimumDate={minDate}
            maximumDate={maxDate}
            onChange={(_, d) => {
              if (d) onChange(toDateOnlyString(d));
            }}
            accessibilityLabel={label}
            themeVariant="light"
          />
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => setAndroidOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={empty ? `${label}, not chosen. Choose a date` : `${label}, ${valueText}. Change`}
            style={({ pressed }) => [styles.field, styles.pressField, pressed && styles.pressed]}
          >
            <Ionicons name="calendar-outline" size={Size.iconRow} color={AppColors.outline} />
            <Text style={[styles.valueText, empty && styles.placeholderText]}>{valueText}</Text>
            <Ionicons name="chevron-down" size={16} color={AppColors.onSurfaceVariant} />
          </Pressable>
          {androidOpen ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              minimumDate={minDate}
              maximumDate={maxDate}
              onChange={(_, d) => {
                setAndroidOpen(false);
                if (d) onChange(toDateOnlyString(d));
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.card,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: AppColors.fieldBorder,
    minHeight: 48,
  },
  iosField: { paddingHorizontal: 14, gap: 8 },
  pressField: { paddingHorizontal: 14, gap: 8 },
  pressed: { backgroundColor: AppColors.surfaceContainerLow },
  valueText: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: 16,
    color: AppColors.onSurface,
  },
  placeholderText: { color: AppColors.placeholder },
});
