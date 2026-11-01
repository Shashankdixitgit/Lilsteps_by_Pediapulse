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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONSULT_MINUTES, formatSlotTime as formatTime, getBookingDays } from '@/components/consult/appointmentFormat';
import { DayStrip, TimeSlotGrid } from '@/components/consult/SlotPickerParts';
import { GradientButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { typography } from '@/styles/global';
import { setBookingConcern, takeSlotsNotice } from '@/lib/bookingDraft';
import { fetchOwnHoldsOn, type OwnHold } from '@/lib/consultPayment';
import { supabase } from '@/lib/supabase';
import { useDoctorVideoLink, useTimeSlots } from '@/hooks/useDoctors';
import { ANY_DOCTOR, fetchFreeSlotsOn, firstFreeDayIndex, type FreeSlot } from '@/hooks/useEarliestSlots';

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
  /** This family's own unpaid hold: tapping it resumes the payment. */
  ownHold?: boolean;
}

export default function SlotsScreen() {
  const insets = useSafeAreaInsets();
  const { doctorId: doctorParam } = useLocalSearchParams<{ doctorId: string }>();
  const { child } = useChild();
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
  const { slots: doctorSlots, loading: loadingDoctor, refetch: refetchDoctorSlots } = useTimeSlots(doctorId, selectedIso);

  // This family's own unpaid holds that day: shown as "Your held slot", not "Booked".
  const childId = child?.id ?? null;
  const [ownHolds, setOwnHolds] = useState<OwnHold[]>([]);
  const [holdsVersion, setHoldsVersion] = useState(0);
  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    fetchOwnHoldsOn(childId, selectedIso, doctorId)
      .then((rows) => {
        if (!cancelled) setOwnHolds(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [childId, selectedIso, doctorId, holdsVersion]);

  // Back on this screen (e.g. a held booking was just cancelled on confirm):
  // show the note once and reload, so the released slot reads as free.
  const [notice, setNotice] = useState<string | null>(null);
  const [anyVersion, setAnyVersion] = useState(0);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      const n = takeSlotsNotice();
      if (n) setNotice(n);
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetchDoctorSlots();
      setHoldsVersion((v) => v + 1);
      setAnyVersion((v) => v + 1);
    }, [refetchDoctorSlots]),
  );

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
  }, [anyDoctor, selectedIso, anyVersion]);

  const chips: SlotChip[] = useMemo(() => {
    const heldKey = (doctor: string, time: string) => `${doctor}|${time.slice(0, 5)}`;
    const held = new Set(ownHolds.map((h) => heldKey(h.doctor_id, h.time)));
    if (!anyDoctor) {
      return doctorSlots.map((s) => {
        const ownHold = !s.is_available && held.has(heldKey(s.doctor_id, s.time));
        return {
          id: s.id,
          time: s.time,
          is_available: s.is_available || ownHold,
          doctorId: s.doctor_id,
          doctorName: null,
          ownHold,
        };
      });
    }
    // One chip per time; rows arrive with the less busy doctor first. The
    // family's own held times come first, so they win over a free one.
    const seen = new Set<string>();
    const out: SlotChip[] = [];
    for (const h of ownHolds) {
      seen.add(h.time);
      out.push({
        id: `hold-${h.id}`,
        time: h.time,
        is_available: true,
        doctorId: h.doctor_id,
        doctorName: h.doctors?.name ?? null,
        ownHold: true,
      });
    }
    for (const s of anySlots) {
      if (seen.has(s.time)) continue;
      seen.add(s.time);
      out.push({ id: s.slot_id, time: s.time, is_available: true, doctorId: s.doctor_id, doctorName: s.doctor_name });
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }, [anyDoctor, doctorSlots, anySlots, ownHolds]);
  const loading = anyDoctor ? loadingAny : loadingDoctor;
  const linkDoctorId = anyDoctor ? (selected?.doctorId ?? null) : doctorId;
  const hasVideoLink = useDoctorVideoLink(linkDoctorId);

  useEffect(() => {
    setSelected(null);
  }, [selectedDay]);

  function goToConfirm(chip: SlotChip | null = selected) {
    if (!chip) return;
    if (chip.ownHold) {
      // Resume the held booking: confirm finds the hold and offers "Finish paying".
      const hold = ownHolds.find((h) => h.doctor_id === chip.doctorId && h.time.slice(0, 5) === chip.time.slice(0, 5));
      setBookingConcern(hold?.concern);
    }
    router.push({
      pathname: '/consult/confirm',
      params: {
        doctorId: chip.doctorId,
        dateIso: DAYS[selectedDay].iso,
        dateLabel: DAYS[selectedDay].fullLabel,
        time: chip.time,
        slotId: chip.ownHold ? '' : chip.id,
      },
    });
  }

  function pickChip(chip: SlotChip) {
    if (chip.ownHold) goToConfirm(chip);
    else setSelected(chip);
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

        {notice ? (
          <Text style={[typography.bodySM, styles.notice]} accessibilityRole="alert">
            {notice}
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text style={typography.headingSM}>Choose a date</Text>
          <DayStrip
            days={DAYS}
            selected={selectedDay}
            onSelect={(i) => {
              userPickedDay.current = true;
              setSelectedDay(i);
            }}
          />
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
            <TimeSlotGrid chips={chips} selectedId={selected?.id ?? null} onSelect={pickChip} />
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
        <GradientButton label="Continue" disabled={!selected} onPress={() => goToConfirm()} />
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

  center: { paddingVertical: 24, alignItems: 'center' },
  center0: { textAlign: 'center' },
  notice: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: AppColors.successBorder,
    backgroundColor: AppColors.successSurface,
    color: AppColors.success,
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
