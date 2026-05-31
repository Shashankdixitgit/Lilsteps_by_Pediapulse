/**
 * Select Date & Time — Step 2 of booking
 *
 * Real time_slots via useTimeSlots(). Past slots for today are filtered in
 * the hook. "Booked" = is_available=false.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

import { AppColors } from '@/constants/theme';
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
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={AppColors.onSurface} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Pick a Slot</Text>
          <Text style={styles.headerSub}>{doctorName}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.steps}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.stepDot, s <= 2 && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose a date</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateStrip}
          >
            {DAYS.map((d, i) => {
              const active = selectedDay === i;
              return (
                <Pressable
                  key={i}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  onPress={() => setSelectedDay(i)}
                >
                  <Text style={[styles.dayLabel, active && styles.dayLabelActive]}>{d.label}</Text>
                  <Text style={[styles.dayDate, active && styles.dayDateActive]}>{d.date}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available times</Text>
          <Text style={styles.sectionSub}>All times are in IST</Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={AppColors.primary} />
            </View>
          ) : slots.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-clear-outline" size={28} color={AppColors.onSurfaceVariant} />
              <Text style={styles.emptyText}>
                {doctorName} has no slots on {DAYS[selectedDay].fullLabel}.
                Try another date.
              </Text>
            </View>
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
                  >
                    {active && (
                      <LinearGradient
                        colors={[AppColors.primary, AppColors.gradientEnd]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    <Ionicons
                      name={unavailable ? 'close-outline' : 'time-outline'}
                      size={14}
                      color={
                        unavailable
                          ? `${AppColors.onSurfaceVariant}50`
                          : active
                            ? AppColors.onPrimary
                            : AppColors.primary
                      }
                    />
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

        <View style={styles.infoRow}>
          <InfoChip icon="videocam-outline" label="Video consultation" />
          <InfoChip icon="time-outline" label="30 min session" />
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {selectedTime && (
          <View style={styles.selectedSummary}>
            <Ionicons name="calendar-outline" size={14} color={AppColors.primary} />
            <Text style={styles.selectedSummaryText}>
              {DAYS[selectedDay].fullLabel} · {formatTime(selectedTime)}
            </Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.continueBtn,
            !selectedTime && styles.continueBtnDisabled,
            { opacity: pressed ? 0.87 : 1 },
          ]}
          disabled={!selectedTime}
          onPress={goToConfirm}
        >
          <LinearGradient
            colors={[AppColors.primary, AppColors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.continueBtnGrad}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={AppColors.onPrimary} />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

function InfoChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.infoChip}>
      <Ionicons name={icon as never} size={14} color={AppColors.primary} />
      <Text style={styles.infoChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderBottomWidth: 1, borderBottomColor: `${AppColors.outlineVariant}15`,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${AppColors.surfaceContainerHigh}80`,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { alignItems: 'center', gap: 2 },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: AppColors.onSurface },
  headerSub: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: AppColors.primary },

  steps: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
  stepDot: { flex: 1, height: 3, borderRadius: 999, backgroundColor: `${AppColors.outlineVariant}30` },
  stepDotActive: { backgroundColor: AppColors.primary },

  scroll: { paddingHorizontal: 20, paddingTop: 20, gap: 24 },

  section: { gap: 12 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 20, color: AppColors.onSurface, letterSpacing: -0.4 },
  sectionSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: AppColors.onSurfaceVariant, marginTop: -8 },

  dateStrip: { gap: 10 },
  dayChip: {
    alignItems: 'center', gap: 4, paddingHorizontal: 18, paddingVertical: 14,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1.5, borderColor: 'transparent', minWidth: 88,
  },
  dayChipActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  dayLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: AppColors.onSurface },
  dayLabelActive: { color: AppColors.onPrimary },
  dayDate: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: AppColors.onSurfaceVariant },
  dayDateActive: { color: 'rgba(255,255,255,0.8)' },

  center: { paddingVertical: 28, alignItems: 'center' },
  emptyCard: {
    alignItems: 'center', gap: 10,
    backgroundColor: `${AppColors.surfaceContainerHigh}80`, borderRadius: 14, padding: 20,
  },
  emptyText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: AppColors.onSurfaceVariant, textAlign: 'center', lineHeight: 18 },

  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slotChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 13,
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1.5, borderColor: `${AppColors.outlineVariant}30`,
    overflow: 'hidden', minWidth: '45%',
  },
  slotDisabled: { backgroundColor: `${AppColors.surfaceContainerHigh}80`, borderColor: 'transparent', opacity: 0.55 },
  slotActive: { borderColor: 'transparent', backgroundColor: 'transparent' },
  slotText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: AppColors.onSurface, flex: 1 },
  slotTextDisabled: { color: `${AppColors.onSurfaceVariant}50` },
  slotTextActive: { color: AppColors.onPrimary },
  bookedLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10, color: `${AppColors.onSurfaceVariant}60` },

  infoRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  infoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: `${AppColors.primary}10`, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  infoChipText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: AppColors.primary },

  bottomBar: {
    paddingHorizontal: 20, paddingTop: 12, gap: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1, borderTopColor: `${AppColors.outlineVariant}15`,
  },
  selectedSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${AppColors.primary}08`, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  selectedSummaryText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: AppColors.primary },
  continueBtn: { borderRadius: 999, overflow: 'hidden' },
  continueBtnDisabled: { opacity: 0.45 },
  continueBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  continueBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: AppColors.onPrimary },
});
