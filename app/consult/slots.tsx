/**
 * Select Date & Time — Step 2 of booking
 *
 * One doctor: that doctor's time_slots via useTimeSlots() ("Booked" =
 * is_available=false; past slots for today are filtered in the hook).
 * "Earliest available" (doctorId = ANY_DOCTOR): every bookable doctor's free
 * slots that day via free_slots_on (0030), one chip per time; the doctor is
 * whoever is free then (the less busy one first) and is named before booking.
 * Slots are kept 14 days ahead by the rolling generator (0030).
 * When the doctor (or, for "Earliest available", the doctor of the picked
 * time) has no video link yet, a hint says so before booking (0035).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONSULT_MINUTES, formatSlotTime as formatTime, getBookingDays } from '@/components/consult/appointmentFormat';
import { GradientButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { typography } from '@/styles/global';
import { supabase } from '@/lib/supabase';
import { useDoctorVideoLink, useTimeSlots } from '@/hooks/useDoctors';
import { ANY_DOCTOR, fetchFreeSlotsOn, type FreeSlot } from '@/hooks/useEarliestSlots';

// Slots exist 14 clinic (IST) days ahead (0030 rolling generator).
const SLOT_DAYS = 14;

function bookingDays() {
  return getBookingDays(SLOT_DAYS).map((d) => ({ label: d.label, date: d.sub, iso: d.isoDate, fullLabel: d.fullLabel }));
}

/** A chip on the time grid. */
interface SlotChip {
  id: string;
  time: string;
  is_available: boolean;
  doctorId: string;
  doctorName: string | null;
}

/**
 * Index of the first booking day with a free, still-ahead slot (for one
 * doctor, or any bookable doctor); 0 when none is free or the lookup fails.
 */
async function firstFreeDayIndex(doctorId: string | null, isoDates: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('next_free_slot_per_doctor');
  if (error || !data) return 0;
  const dates = (data as FreeSlot[])
    .filter((s) => !doctorId || s.doctor_id === doctorId)
    .map((s) => s.date)
    .sort();
  const idx = dates.length > 0 ? isoDates.indexOf(dates[0]) : -1;
  return idx === -1 ? 0 : idx;
}

export default function SlotsScreen() {
  const insets = useSafeAreaInsets();
  const { doctorId: doctorParam, issue } = useLocalSearchParams<{ doctorId: string; issue: string }>();
  const anyDoctor = !doctorParam || doctorParam === ANY_DOCTOR;
  const doctorId = anyDoctor ? null : doctorParam;

  // Computed on mount (not at import) so "Today" is right after midnight.
  const DAYS = useMemo(() => bookingDays(), []);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selected, setSelected] = useState<SlotChip | null>(null);
  const [doctorName, setDoctorName] = useState<string>('Doctor');
  // Once the parent taps a day, the first-free-day lookup must not move it.
  const userPickedDay = useRef(false);

  // Open on the first day with a free slot, not on a fully booked Today.
  useEffect(() => {
    let cancelled = false;
    firstFreeDayIndex(doctorId, DAYS.map((d) => d.iso)).then((idx) => {
      if (!cancelled && !userPickedDay.current) setSelectedDay(idx);
    });
    return () => {
      cancelled = true;
    };
  }, [doctorId, DAYS]);

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

  const selectedIso = DAYS[selectedDay].iso;
  const { slots: doctorSlots, loading: loadingDoctor } = useTimeSlots(doctorId, selectedIso);

  // "Earliest available": free slots of every bookable doctor that day.
  const [anySlots, setAnySlots] = useState<FreeSlot[]>([]);
  const [loadingAny, setLoadingAny] = useState(false);
  const [anyError, setAnyError] = useState(false);
  useEffect(() => {
    if (!anyDoctor) return;
    let cancelled = false;
    setLoadingAny(true);
    setAnyError(false);
    fetchFreeSlotsOn(selectedIso)
      .then((rows) => {
        if (!cancelled) setAnySlots(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setAnySlots([]);
          setAnyError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAny(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anyDoctor, selectedIso]);

  const chips: SlotChip[] = useMemo(() => {
    if (!anyDoctor) {
      return doctorSlots.map((s) => ({
        id: s.id,
        time: s.time,
        is_available: s.is_available,
        doctorId: s.doctor_id,
        doctorName: null,
      }));
    }
    // One chip per time; rows arrive with the less busy doctor first.
    const seen = new Set<string>();
    const out: SlotChip[] = [];
    for (const s of anySlots) {
      if (seen.has(s.time)) continue;
      seen.add(s.time);
      out.push({ id: s.slot_id, time: s.time, is_available: true, doctorId: s.doctor_id, doctorName: s.doctor_name });
    }
    return out;
  }, [anyDoctor, doctorSlots, anySlots]);
  const loading = anyDoctor ? loadingAny : loadingDoctor;
  const linkDoctorId = anyDoctor ? (selected?.doctorId ?? null) : doctorId;
  const hasVideoLink = useDoctorVideoLink(linkDoctorId);

  useEffect(() => {
    setSelected(null);
  }, [selectedDay]);

  function goToConfirm() {
    if (!selected) return;
    router.push({
      pathname: '/consult/confirm',
      params: {
        doctorId: selected.doctorId,
        dateIso: DAYS[selectedDay].iso,
        dateLabel: DAYS[selectedDay].fullLabel,
        time: selected.time,
        slotId: selected.id,
        issue: issue ?? '',
      },
    });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Pick a time" subtitle={anyDoctor ? 'Earliest available doctor' : doctorName} />

      <View style={styles.steps}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.stepDot, s <= 2 && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={typography.meta}>
          {/* R3-09: "Video" only when the doctor has a video link. */}
          {hasVideoLink === true
            ? `Video consultation · ${CONSULT_MINUTES} min`
            : hasVideoLink === false
              ? `Consultation · ${CONSULT_MINUTES} min · chat (video link pending)`
              : `Consultation · ${CONSULT_MINUTES} min`}{' '}
          · times in IST
          {anyDoctor ? ". Pick a time and we'll book a doctor who is free then." : ''}
        </Text>

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
                  onPress={() => {
                    userPickedDay.current = true;
                    setSelectedDay(i);
                  }}
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
        </View>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Available times</Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={AppColors.primary} />
            </View>
          ) : anyError ? (
            <Text style={typography.meta} accessibilityRole="alert">
              Couldn&apos;t load times. Check your connection and pick the date again.
            </Text>
          ) : chips.length === 0 ? (
            <Text style={typography.meta}>
              No {anyDoctor ? 'free times' : 'slots'} on {DAYS[selectedDay].fullLabel}. Try another date.
            </Text>
          ) : (
            <View style={styles.slotsGrid}>
              {chips.map((slot) => {
                const unavailable = !slot.is_available;
                const active = selected?.id === slot.id;
                return (
                  <Pressable
                    key={slot.id}
                    disabled={unavailable}
                    style={[styles.slotChip, unavailable && styles.slotDisabled, active && styles.slotActive]}
                    onPress={() => setSelected(slot)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: unavailable }}
                    aria-selected={active}
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
        {selected && (
          <Text style={[typography.sectionLabel, styles.center0]}>
            {DAYS[selectedDay].fullLabel} · {formatTime(selected.time)}
            {selected.doctorName ? ` with ${selected.doctorName}` : ''}
          </Text>
        )}
        {hasVideoLink === false && (anyDoctor ? !!selected : true) ? (
          <Text style={[typography.caption, styles.center0]}>
            {anyDoctor && selected?.doctorName ? selected.doctorName : doctorName} hasn&apos;t set a video link yet.
            You can still book and message them about the consult.
          </Text>
        ) : null}
        <GradientButton label="Continue" disabled={!selected} onPress={goToConfirm} />
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
