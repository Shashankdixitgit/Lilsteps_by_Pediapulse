import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { BOOKING_DAYS, getBookingDays, type BookingDay } from '@/components/consult/appointmentFormat';
import { AppColors, FontFamily, Radius } from '@/constants/theme';

import { spaceSelects } from './spaceKey';

export type DayOption = BookingDay;

/** Next n clinic (IST) days; 'YYYY-MM-DD' never shifts to UTC. */
export function getNextDays(n: number = BOOKING_DAYS): DayOption[] {
  return getBookingDays(n);
}

export interface DateStripProps {
  days: DayOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function DateStrip({ days, selectedIndex, onSelect }: DateStripProps) {
  return (
    // One-of-n choice: a radio group, so the chosen day is announced on web
    // too (react-native-web ignores accessibilityState.selected).
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel="Date"
    >
      {days.map((d, i) => {
        const active = selectedIndex === i;
        return (
          <Pressable
            key={i}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(i)}
            {...spaceSelects(() => onSelect(i))}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, selected: active }}
            aria-checked={active}
            accessibilityLabel={d.fullLabel}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{d.label}</Text>
            <Text style={[styles.date, active && styles.dateActive]}>{d.sub}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    minWidth: 76,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  chipActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  label: { fontFamily: FontFamily.semibold, fontSize: 13, lineHeight: 18, color: AppColors.onSurface },
  labelActive: { color: AppColors.onPrimary },
  date: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
  dateActive: { color: AppColors.onDarkMuted },
});
