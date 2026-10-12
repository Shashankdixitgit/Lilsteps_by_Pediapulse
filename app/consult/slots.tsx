/**
 * Select Date & Time — Step 2 of booking
 *
 * Real time_slots via useTimeSlots(). Past slots for today are filtered in
 * the hook. "Booked" = is_available=false.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { typography } from '@/styles/global';
import { supabase } from '@/lib/supabase';
import { useTimeSlots } from '@/hooks/useDoctors';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getNextDays(n: number) {
  const out: { label: string; date: string; iso: string; fullLabel: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateLabel = `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_LABELS[d.getDay()];
    out.push({
      label: dayLabel,
      date: dateLabel,
      iso: d.toISOString().split('T')[0],
      fullLabel: `${dayLabel}, ${dateLabel}`,
    });
  }
  return out;
}

const DAYS = getNextDays(7);

function formatTime(t: string): string {
  // "09:00:00" -> "09:00 AM"
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function SlotsScreen() {
  const insets = useSafeAreaInsets();
  const { doctorId, issue } = useLocalSearchParams<{ doctorId: string; issue: string }>();

  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState<string>('Doctor');

  useEffect(() => {
    if (!doctorId) return;
    (async () => {
      const { data } = await supabase
        .from('doctors')
        .select('name')
        .eq('id', doctorId)
        .maybeSingle<{ name: string }>();
      if (data) setDoctorName(data.name);
    })();
  }, [doctorId]);

  const { slots, loading } = useTimeSlots(doctorId ?? null, DAYS[selectedDay].iso);

  useEffect(() => {
    setSelectedTime(null);
  }, [selectedDay]);

  function goToConfirm() {
    if (!selectedTime || !doctorId) return;
    router.push({
      pathname: '/consult/confirm',
      params: {
        doctorId,
        dateIso: DAYS[selectedDay].iso,
        dateLabel: DAYS[selectedDay].fullLabel,
        time: selectedTime,
        issue: issue ?? '',
      },
    });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Pick a time" subtitle={doctorName} />

      <View style={styles.steps}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.stepDot, s <= 2 && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={typography.meta}>Video consultation · 30 min · times in IST</Text>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Choose a date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dateScroll}
            contentContainerStyle={styles.dateStrip}
          >
            {DAYS.map((d, i) => {
              const active = selectedDay === i;
              return (
                <Pressable
                  key={i}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  onPress={() => setSelectedDay(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={d.fullLabel}
                >
                  <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>{d.label}</Text>
                  <Text style={[styles.dayDate, active && styles.dayDateActive]}>{d.date}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Available times</Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={AppColors.primary} />
            </View>
          ) : slots.length === 0 ? (
            <Text style={typography.meta}>
              No slots on {DAYS[selectedDay].fullLabel}. Try another date.
            </Text>
          ) : (
            <View style={styles.slotsGrid}>
              {slots.map((slot) => {
                const unavailable = !slot.is_available;
                const active = selectedTime === slot.time;
                return (
                  <Pressable
                    key={slot.id}
                    disabled={unavailable}
                    style={[styles.slotChip, unavailable && styles.slotDisabled, active && styles.slotActive]}
                    onPress={() => setSelectedTime(slot.time)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: unavailable }}
                  >
                    <Text
                      style={[
                        styles.slotText,
                        unavailable && styles.slotTextDisabled,
                        active && styles.slotTextActive,
                      ]}
                    >
                      {formatTime(slot.time)}
                    </Text>
                    {unavailable && <Text style={styles.bookedLabel}>Booked</Text>}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {selectedTime && (
          <Text style={[typography.sectionLabel, styles.center0]}>
            {DAYS[selectedDay].fullLabel} · {formatTime(selectedTime)}
          </Text>
        )}
        <GradientButton label="Continue" disabled={!selectedTime} onPress={goToConfirm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  steps: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  stepDot: { flex: 1, height: 3, borderRadius: 999, backgroundColor: AppColors.border },
  stepDotActive: { backgroundColor: AppColors.primary },

  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },

  section: { gap: 8 },

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

  center: { paddingVertical: 24, alignItems: 'center' },
  center0: { textAlign: 'center' },

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

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    backgroundColor: AppColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
});
