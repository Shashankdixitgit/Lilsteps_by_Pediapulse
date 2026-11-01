/**
 * Reschedule — move a paid, upcoming consult to another open time with the
 * same doctor. Free: the payment carries over and the video link stays.
 *
 * Rules (checked again by reschedule_appointment, 0051, via consult-payment):
 * 2 hours or more before the current start, at most 3 moves, the new time
 * must be open and in the future. The server emails the new time and puts a
 * note in the chat with the doctor.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  appointmentStart,
  formatSlotTime,
  getBookingDays,
  whenLabel,
} from '@/components/consult/appointmentFormat';
import { DayStrip, TimeSlotGrid, type TimeChip } from '@/components/consult/SlotPickerParts';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAuth } from '@/context/auth';
import { AppColors } from '@/constants/theme';
import { useTimeSlots } from '@/hooks/useDoctors';
import { firstFreeDayIndex } from '@/hooks/useEarliestSlots';
import { MAX_RESCHEDULES, RESCHEDULE_CUTOFF_MINUTES, rescheduleConsult } from '@/lib/consultPayment';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';
import { goBack } from '@/lib/navigation';

// Slots exist 14 clinic (IST) days ahead (0030 rolling generator).
const SLOT_DAYS = 14;

interface RescheduleAppointment {
  id: string;
  child_id: string;
  doctor_id: string;
  date: string;
  time: string;
  status: string;
  reschedule_count: number | null;
  doctors: { name: string } | null;
}

/** Why this consult can't be moved here, or null when it can. */
function blockedReason(a: RescheduleAppointment, now: Date): string | null {
  if (a.status !== 'upcoming') return 'Only an upcoming consult can be moved.';
  if ((a.reschedule_count ?? 0) >= MAX_RESCHEDULES) {
    return `This consult has already been moved ${MAX_RESCHEDULES} times, so it can't be moved again. You can message the doctor.`;
  }
  const minutesLeft = (appointmentStart(a.date, a.time).getTime() - now.getTime()) / 60_000;
  if (minutesLeft < RESCHEDULE_CUTOFF_MINUTES) {
    return 'A consult can be moved up to 2 hours before it starts. Please message the doctor instead.';
  }
  return null;
}

export default function RescheduleScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  // The server emails the sign-in address; test logins never get mail.
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? '';
  const hasEmail = !!email && !email.endsWith('lilsteps.dev');
  const [appt, setAppt] = useState<RescheduleAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);
  const [selected, setSelected] = useState<TimeChip | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<string | null>(null);

  const DAYS = useMemo(
    () => getBookingDays(SLOT_DAYS).map((d) => ({ label: d.label, date: d.sub, iso: d.isoDate, fullLabel: d.fullLabel })),
    [],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from('appointments')
        .select('id, child_id, doctor_id, date, time, status, reschedule_count, doctors(name)')
        .eq('id', id)
        .maybeSingle<RescheduleAppointment>();
      if (cancelled) return;
      if (err || !data) setLoadFailed(true);
      else setAppt(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Open on the first day this doctor has a free time, not on a full Today.
  const userPickedDay = useRef(false);
  const apptDoctorId = appt?.doctor_id ?? null;
  useEffect(() => {
    if (!apptDoctorId) return;
    let cancelled = false;
    firstFreeDayIndex(apptDoctorId, DAYS.map((d) => d.iso)).then((idx) => {
      if (!cancelled && !userPickedDay.current) setSelectedDay(idx);
    });
    return () => {
      cancelled = true;
    };
  }, [apptDoctorId, DAYS]);

  const selectedIso = DAYS[selectedDay].iso;
  const { slots, loading: loadingSlots, refetch } = useTimeSlots(appt?.doctor_id ?? null, selectedIso);

  const doctorName = appt?.doctors?.name ?? 'your doctor';
  const blocked = appt ? blockedReason(appt, new Date()) : null;

  async function save() {
    if (!appt || !selected) return;
    setSaving(true);
    setError(null);
    try {
      const moved = await rescheduleConsult(appt.id, selected.id);
      setMovedTo(whenLabel(moved.date, moved.time));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't move the consult. Please try again.");
      // The time may have just been taken: show the day as it is now.
      refetch();
      setSelected(null);
    } finally {
      setSaving(false);
    }
  }

  function renderBody() {
    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={AppColors.primary} />
        </View>
      );
    }
    if (loadFailed || !appt) {
      return (
        <View style={styles.center}>
          <Text style={[typography.body, styles.centerText]}>We couldn&apos;t find this consult.</Text>
          <TextButton label="Go back" onPress={goBack} />
        </View>
      );
    }
    if (movedTo) {
      return (
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark" size={28} color={AppColors.primary} />
          </View>
          <Text style={[typography.headingSM, styles.centerText]} accessibilityRole="header">
            Your consult is moved.
          </Text>
          <Text style={[typography.bodySM, styles.centerText]}>
            {movedTo} with {doctorName}. Nothing more to pay, and the video link stays the same.
            {hasEmail ? " We'll email you the new time." : ''}
          </Text>
          <GradientButton label="Done" onPress={goBack} style={styles.wide} />
        </View>
      );
    }
    if (blocked) {
      return (
        <View style={styles.center}>
          <Text style={[typography.body, styles.centerText]}>{blocked}</Text>
          <TextButton label="Go back" onPress={goBack} />
        </View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={typography.meta}>
          Now: {whenLabel(appt.date, appt.time)}. Moving is free: your payment carries over. Times in IST.
        </Text>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Choose a date</Text>
          <DayStrip
            days={DAYS}
            selected={selectedDay}
            onSelect={(i) => {
              userPickedDay.current = true;
              setSelectedDay(i);
              setSelected(null);
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Available times</Text>
          {loadingSlots ? (
            <View style={styles.centerRow}>
              <ActivityIndicator size="small" color={AppColors.primary} />
            </View>
          ) : slots.length === 0 ? (
            <Text style={typography.meta}>
              No times with {doctorName} on {DAYS[selectedDay].fullLabel}. Try another date.
            </Text>
          ) : (
            <TimeSlotGrid chips={slots} selectedId={selected?.id ?? null} onSelect={setSelected} />
          )}
        </View>
      </ScrollView>
    );
  }

  const showBar = !!appt && !blocked && !movedTo && !loading;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Reschedule" subtitle={appt ? doctorName : undefined} />
      {renderBody()}
      {showBar ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          {error ? (
            <Text style={[typography.bodySM, styles.error]} accessibilityRole="alert">
              {error}
            </Text>
          ) : selected ? (
            <Text style={[typography.sectionLabel, styles.centerText]}>
              {DAYS[selectedDay].fullLabel} · {formatSlotTime(selected.time)}
            </Text>
          ) : null}
          <GradientButton
            label={selected ? 'Move my consult' : 'Pick a new time'}
            disabled={!selected || saving}
            loading={saving}
            onPress={save}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },
  section: { gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  centerRow: { paddingVertical: 24, alignItems: 'center' },
  centerText: { textAlign: 'center' },
  error: { color: AppColors.danger, textAlign: 'center' },
  wide: { alignSelf: 'stretch', marginTop: 16 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    backgroundColor: AppColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
});
