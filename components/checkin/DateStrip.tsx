import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { AppColors, FontFamily, Radius } from '@/constants/theme';

export interface DayOption {
  label: string;
  sub: string;
  isoDate: string;
}

export function getNextDays(n: number): DayOption[] {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : labels[d.getDay()],
      sub: `${d.getDate()} ${months[d.getMonth()]}`,
      isoDate: d.toISOString().split('T')[0],
    };
  });
}

export interface DateStripProps {
  days: DayOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function DateStrip({ days, selectedIndex, onSelect }: DateStripProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map((d, i) => {
        const active = selectedIndex === i;
        return (
          <Pressable
            key={i}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${d.label}, ${d.sub}`}
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
