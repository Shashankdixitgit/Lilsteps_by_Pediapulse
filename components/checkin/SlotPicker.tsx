import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatSlotTime } from '@/components/consult/appointmentFormat';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import type { TimeSlotRow } from '@/hooks/useDoctors';

import { spaceSelects } from './spaceKey';

export interface SlotPickerProps {
  slots: TimeSlotRow[];
  /** Selected time_slots.id */
  selectedId: string | null;
  onSelect: (slot: TimeSlotRow) => void;
  emptyText?: string;
  /** Shown above the chips when every slot on the day is taken. */
  allBookedText?: string;
}

/** Time chips in IST 12h ("2:00 PM"); taken slots read "Booked". */
export function SlotPicker({
  slots,
  selectedId,
  onSelect,
  emptyText = 'No slots on this date. Try another day.',
  allBookedText = 'All times on this day are booked. Try another day.',
}: SlotPickerProps) {
  if (slots.length === 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }
  const allBooked = slots.every((s) => !s.is_available);

  return (
    <View style={styles.wrap}>
      {allBooked ? <Text style={styles.empty}>{allBookedText}</Text> : null}
      {/* A radio group so the chosen time is announced on web too. */}
      <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Time">
        {slots.map((slot) => {
          const active = selectedId === slot.id;
          const label = formatSlotTime(slot.time);
          return (
            <Pressable
              key={slot.id}
              disabled={!slot.is_available}
              style={[
                styles.chip,
                !slot.is_available && styles.disabled,
                active && styles.selected,
              ]}
              onPress={() => onSelect(slot)}
              {...spaceSelects(() => onSelect(slot), !slot.is_available)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, selected: active, disabled: !slot.is_available }}
              aria-checked={active}
              aria-disabled={!slot.is_available}
              accessibilityLabel={slot.is_available ? label : `${label}, booked`}
            >
              <Text
                style={[
                  styles.text,
                  !slot.is_available && styles.textDisabled,
                  active && styles.textSelected,
                ]}
              >
                {label}
              </Text>
              {!slot.is_available ? <Text style={styles.booked}>Booked</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  wrap: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  disabled: { backgroundColor: AppColors.surfaceContainer, borderColor: AppColors.surfaceContainer },
  selected: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  text: { fontFamily: FontFamily.semibold, fontSize: 13, color: AppColors.onSurface },
  textDisabled: { color: AppColors.muted, textDecorationLine: 'line-through' },
  textSelected: { color: AppColors.onPrimary },
  booked: { fontFamily: FontFamily.medium, fontSize: 12, color: AppColors.muted },
});
