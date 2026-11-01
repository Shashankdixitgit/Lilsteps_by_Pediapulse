/**
 * The day strip and the time grid of the slot picker. Shared by "Pick a
 * time" (consult/slots) and "Reschedule" (consult/reschedule/[id]).
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius } from '@/constants/theme';

import { formatSlotTime } from './appointmentFormat';

export interface PickerDay {
  label: string;
  date: string;
  fullLabel: string;
}

/** Horizontal strip of day chips; the selected one is filled. */
export function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: PickerDay[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.dateScroll}
      contentContainerStyle={styles.dateStrip}
    >
      {days.map((d, i) => {
        const active = selected === i;
        return (
          <Pressable
            key={i}
            style={[styles.dayChip, active && styles.dayChipActive]}
            onPress={() => onSelect(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            accessibilityLabel={d.fullLabel}
          >
            <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>{d.label}</Text>
            <Text style={[styles.dayDate, active && styles.dayDateActive]}>{d.date}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export interface TimeChip {
  id: string;
  time: string;
  is_available: boolean;
}

/** Grid of time chips; taken ones are struck through and marked "Booked". */
export function TimeSlotGrid<T extends TimeChip>({
  chips,
  selectedId,
  onSelect,
}: {
  chips: T[];
  selectedId: string | null;
  onSelect: (chip: T) => void;
}) {
  return (
    <View style={styles.slotsGrid}>
      {chips.map((slot) => {
        const unavailable = !slot.is_available;
        const active = selectedId === slot.id;
        return (
          <Pressable
            key={slot.id}
            disabled={unavailable}
            style={[styles.slotChip, unavailable && styles.slotDisabled, active && styles.slotActive]}
            onPress={() => onSelect(slot)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: unavailable }}
            aria-selected={active}
          >
            <Text style={[styles.slotText, unavailable && styles.slotTextDisabled, active && styles.slotTextActive]}>
              {formatSlotTime(slot.time)}
            </Text>
            {unavailable && <Text style={styles.bookedLabel}>Booked</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dateScroll: { marginHorizontal: -20 },
  dateStrip: { gap: 8, paddingHorizontal: 20 },
  dayChip: {
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
  dayChipActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  dayLabel: { fontFamily: FontFamily.semibold, fontSize: 13, lineHeight: 18, color: AppColors.onSurface },
  dayLabelActive: { color: AppColors.onPrimary },
  dayDate: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
  dayDateActive: { color: AppColors.onDarkMuted },

  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    flexBasis: '30%',
    flexGrow: 1,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  slotDisabled: { backgroundColor: AppColors.surfaceContainer, borderColor: AppColors.surfaceContainer },
  slotActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  slotText: { fontFamily: FontFamily.semibold, fontSize: 13, color: AppColors.onSurface },
  slotTextDisabled: { color: AppColors.muted, textDecorationLine: 'line-through' },
  slotTextActive: { color: AppColors.onPrimary },
  bookedLabel: { fontFamily: FontFamily.medium, fontSize: 12, color: AppColors.muted },
});
