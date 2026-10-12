import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius } from '@/constants/theme';
import type { TimeSlotRow } from '@/hooks/useDoctors';

export interface SlotPickerProps {
  slots: TimeSlotRow[];
  selectedTime: string | null;
  onSelect: (time: string) => void;
  emptyText?: string;
}

export function SlotPicker({ slots, selectedTime, onSelect, emptyText = 'No available slots for this date' }: SlotPickerProps) {
  if (slots.length === 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }

  return (
    <View style={styles.grid}>
      {slots.map((slot) => {
        const active = selectedTime === slot.time;
        return (
          <Pressable
            key={slot.id}
            disabled={!slot.is_available}
            style={[
              styles.chip,
              !slot.is_available && styles.disabled,
              active && styles.selected,
            ]}
            onPress={() => onSelect(slot.time)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !slot.is_available }}
          >
            <Text
              style={[
                styles.text,
                !slot.is_available && styles.textDisabled,
                active && styles.textSelected,
              ]}
            >
              {slot.time}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 40,
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
});
