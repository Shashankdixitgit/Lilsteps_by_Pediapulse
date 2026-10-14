import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHECKIN_HEADER_HEIGHT, CheckinHeader } from '@/components/checkin/CheckinHeader';
import { DateStrip, getNextDays } from '@/components/checkin/DateStrip';
import { DoctorPicker } from '@/components/checkin/DoctorPicker';
import { MentalHealthSupport } from '@/components/checkin/MentalHealthSupport';
import { SlotPicker } from '@/components/checkin/SlotPicker';
import { SummaryCard } from '@/components/checkin/SummaryCard';
import {
  CLINIC_TZ,
  CONSULT_MINUTES,
  appointmentEnded,
  doctorShortName,
  whenLabel,
  whenPhrase,
} from '@/components/consult/appointmentFormat';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { AppColors, CanvasFade, FontFamily, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { linkConversationToAppointment, useAppointments } from '@/hooks/useAppointments';
import { useCheckinSession } from '@/hooks/useCheckin';
import { useConversations } from '@/hooks/useConversations';
import { doctorHasVideoLink, type DoctorRow, useDoctors, useTimeSlots } from '@/hooks/useDoctors';
import { fetchFreeSlotsOn, useNextFreeSlots } from '@/hooks/useEarliestSlots';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';

function callEmergency() {
  Linking.openURL('tel:112').catch(() => {});
}

/**
 * Index of the first booking day with a free (and, today, not yet elapsed)
 * slot for this doctor; -1 when none is free, null when the lookup fails.
 */
async function firstFreeDayIndex(doctorId: string, isoDates: string[]): Promise<number | null> {
  const { data, error } = await supabase
    .from('time_slots')
    .select('date, time')
    .eq('doctor_id', doctorId)
    .eq('is_available', true)
    .gte('date', isoDates[0])
    .lte('date', isoDates[isoDates.length - 1]);
  if (error || !data) return null;
  const today = isoDates[0];
  const nowTime = new Date().toLocaleTimeString('en-GB', { timeZone: CLINIC_TZ, hour12: false });
  const freeDates = new Set(
    (data as { date: string; time: string }[])
      .filter((s) => s.date !== today || s.time > nowTime)
      .map((s) => s.date),
  );
  return isoDates.findIndex((d) => freeDates.has(d));
}

/** Consult wording for the selected doctor (R3-09): "Video" only with a link. */
function consultKindLabel(hasVideo: boolean): string {
  return hasVideo
    ? `Video consultation · ${CONSULT_MINUTES} min`
    : `Consultation · ${CONSULT_MINUTES} min · chat (video link pending)`;
}

export default function CheckinSummaryScreen() {
  const insets = useSafeAreaInsets();
  const { child: selectedChild, children } = useChild();
  // The chat screen passes the saved session id; the summary itself is read
  // back from checkin_sessions (useCheckin state does not survive the route).
  const { sessionId: sessionParam } = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = typeof sessionParam === 'string' && sessionParam.length > 0 ? sessionParam : null;
  const session = useCheckinSession(sessionId);
  // R3-07: the check-in belongs to one child, which may not be the child
  // selected on Home now. Name, pronouns, booking and chat all use it.
  const child = session.childId
    ? (children.find((c) => c.id === session.childId) ?? null)
    : selectedChild;
  const { doctors, loading: loadingDocs } = useDoctors();
  const { appointments, bookAppointment, refetch: refetchAppointments } = useAppointments(child?.id ?? null);
  const { startConversation } = useConversations(child?.id ?? null);
  const [openingChat, setOpeningChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const days = useMemo(() => getNextDays(), []);
  // R2-18: each doctor's next free time on the picker.
  const nextFreeSlots = useNextFreeSlots();
  const nextFree = useMemo(
    () => new Map(Array.from(nextFreeSlots.byDoctor.entries()).map(([id, s]) => [id, whenLabel(s.date, s.time)])),
    // byDoctor is rebuilt every render; the slot list is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nextFreeSlots.slots],
  );

  // R2-08: the parent-friendly headline, read straight from the saved row
  // (the shared session loader keeps only the fields it knows). R3-03: the
  // same goes for `emergencyNow` (call 112 now), read defensively.
  const [parentHeadline, setParentHeadline] = useState<string | null>(null);
  const [emergencyNow, setEmergencyNow] = useState(false);
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('checkin_sessions')
        .select('ai_summary')
        .eq('id', sessionId)
        .maybeSingle<{ ai_summary: Record<string, unknown> | null }>();
      // The edge function writes `parentSummary`; older rows may carry `parentHeadline`.
      const raw =
        data?.ai_summary?.parentSummary ?? data?.ai_summary?.parentHeadline ?? data?.ai_summary?.headline;
      if (cancelled) return;
      setParentHeadline(typeof raw === 'string' && raw.trim() ? raw.trim() : null);
      setEmergencyNow(data?.ai_summary?.emergencyNow === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, session.summary]);

  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<{ id: string; time: string } | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [bookedId, setBookedId] = useState<string | null>(null);
  const confirmed = bookedId !== null;
  const [booking, setBooking] = useState(false);
  // First day with a free slot for the selected doctor (-1: none this week).
  const [firstFreeDay, setFirstFreeDay] = useState<number | null>(null);

  // V1 / R3-02: start on a doctor who has a free slot today and a video
  // link, not simply the first name in the list. An urgent check-in then
  // prefers any doctor free today over one with only a video link; a routine
  // one the other way round. Runs once, before any choice.
  const [freeTodayIds, setFreeTodayIds] = useState<Set<string> | null>(null);
  // Bumped after a "slot was just taken" error, to re-read who is free (R3-21).
  const [freeVersion, setFreeVersion] = useState(0);
  // Why the first doctor was picked (R2-18); shown while that doctor stays selected.
  const [autoPick, setAutoPick] = useState<{ id: string; reason: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchFreeSlotsOn(days[0].isoDate)
      .then((free) => {
        if (!cancelled) setFreeTodayIds(new Set(free.map((f) => f.doctor_id)));
      })
      .catch(() => {
        if (!cancelled) setFreeTodayIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [days, freeVersion]);

  const summary = session.summary;
  const urgent = summary?.suggestedUrgency === 'urgent';

  useEffect(() => {
    if (doctors.length === 0 || selectedDoctorId || freeTodayIds === null || session.loading) return;
    const freeToday = (id: string) => freeTodayIds.has(id);
    const both: [DoctorRow | undefined, string] = [
      doctors.find((d) => doctorHasVideoLink(d) && freeToday(d.id)),
      'has a free slot today and a video link',
    ];
    const today: [DoctorRow | undefined, string] = [
      doctors.find((d) => freeToday(d.id)),
      'has a free slot today',
    ];
    const video: [DoctorRow | undefined, string] = [
      doctors.find((d) => doctorHasVideoLink(d)),
      'has a video link set up',
    ];
    const picks = urgent ? [both, today, video] : [both, video, today];
    const [found, reason] = picks.find(([d]) => !!d) ?? [undefined, ''];
    const best = found ?? doctors[0];
    setSelectedDoctorId(best.id);
    if (found) setAutoPick({ id: best.id, reason });
  }, [doctors, selectedDoctorId, freeTodayIds, session.loading, urgent]);

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) ?? doctors[0] ?? null;

  const { slots, loading: loadingSlots, refetch: refetchSlots } = useTimeSlots(
    selectedDoctorId,
    days[selectedDay].isoDate,
  );

  useEffect(() => {
    setSelectedSlot(null);
    setBookingError(null);
  }, [selectedDoctorId, selectedDay]);

  // Open on the first day this doctor has a free slot, not on a fully
  // booked Today. Urgent check-ins stay on Today: a later day is never
  // picked for the parent silently (the no-slot-today block says why).
  // Re-runs when the parent switches doctor, once the summary has loaded.
  useEffect(() => {
    if (!selectedDoctorId || session.loading) return;
    let cancelled = false;
    firstFreeDayIndex(selectedDoctorId, days.map((d) => d.isoDate)).then((idx) => {
      if (cancelled) return;
      setFirstFreeDay(idx);
      setSelectedDay(urgent || idx === null || idx < 0 ? 0 : idx);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedDoctorId, days, urgent, session.loading, freeVersion]);

  const childName = child?.name ?? 'Your child';
  const childSex = child?.sex ?? null;
  // The session's child is not in this account's list (should not happen).
  const childMissing = !!session.childId && !child && children.length > 0;
  // 'urgent' means "seen today"; days[0] is today (clinic time). This is
  // about the SELECTED doctor only (R3-02).
  const noSlotToday = urgent && firstFreeDay !== null && firstFreeDay !== 0;
  const earliestDay = firstFreeDay !== null && firstFreeDay > 0 ? days[firstFreeDay] : null;
  // Other doctors who still have a slot today, for a one-tap switch.
  const othersFreeToday = doctors.filter((d) => d.id !== selectedDoctorId && !!freeTodayIds?.has(d.id));
  // A consult was already booked from this summary (the parent came back).
  const existingBooking = session.booking;
  const existingDoctor = existingBooking ? doctors.find((d) => d.id === existingBooking.doctor_id) : null;
  const bookingLaterThanToday = urgent && selectedDay !== 0;
  const notTodayAdvice = `${childName} should be seen today. If there's no slot today, visit a clinic or hospital today.`;
  // R2-08: the urgency banner says what was booked instead of booking advice.
  const bookedLabel = existingBooking
    ? `${existingDoctor?.name ?? 'the doctor'}, ${whenPhrase(existingBooking.date, existingBooking.time)}`
    : null;
  const today = days[0].isoDate;
  // R3-08: this child already has an upcoming consult that doesn't have this
  // summary; the parent can add it so that doctor reads the check-in.
  const attachable = existingBooking
    ? null
    : (appointments.find(
        (a) =>
          a.status === 'upcoming' &&
          a.ai_summary_id !== sessionId &&
          a.date >= today &&
          !appointmentEnded(a.date, a.time),
      ) ?? null);
  const attachDoctor = attachable ? doctors.find((d) => d.id === attachable.doctor_id) : null;
  const attachDoctorName = attachDoctor?.name ?? attachable?.doctors?.name ?? 'your doctor';
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  // R2-22: no booking form under "couldn't find this check-in".
  const showBookingForm = !existingBooking && (session.loading || !!summary);

  async function handleAttach() {
    if (!attachable || !sessionId || attaching) return;
    setAttaching(true);
    setAttachError(null);
    const { error } = await supabase.rpc('attach_checkin_to_appointment', {
      p_appointment_id: attachable.id,
      p_session_id: sessionId,
    });
    setAttaching(false);
    if (error) {
      setAttachError("Couldn't add the summary to that consult. Please try again.");
      return;
    }
    // The session loader now finds this consult as the booking for the summary.
    session.retry();
    refetchAppointments();
  }

  function switchDoctor(id: string) {
    setAutoPick(null);
    setSelectedDoctorId(id);
  }

  async function handleConfirm() {
    if (!selectedSlot || !selectedDoctor || !child || !sessionId || !summary) return;
    setBooking(true);
    setBookingError(null);
    try {
      const appt = await bookAppointment({
        child_id: child.id,
        doctor_id: selectedDoctor.id,
        date: days[selectedDay].isoDate,
        time: selectedSlot.time,
        slot_id: selectedSlot.id,
        ai_summary_id: sessionId,
        concern: summary.chiefComplaint,
      });
      setBookedId(appt.id);
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : 'Booking failed.';
      setBookingError(`Couldn't book: ${msg} Please pick another time.`);
      setSelectedSlot(null);
      refetchSlots();
      // R3-21: the doctor cards' "Next free" and who is free today change too.
      nextFreeSlots.refetch();
      setFreeVersion((v) => v + 1);
    } finally {
      setBooking(false);
    }
  }

  async function handleStartChat() {
    if (!child || !selectedDoctor || openingChat) return;
    setOpeningChat(true);
    setChatError(null);
    try {
      const convo = await startConversation({
        child_id: child.id,
        doctor_id: selectedDoctor.id,
        appointment_id: bookedId ?? undefined,
      });
      // One chat per child + doctor: point an existing one at this consult too,
      // so the doctor knows which booking the message is about.
      if (bookedId && convo.appointment_id !== bookedId) {
        await linkConversationToAppointment(convo.id, bookedId);
      }
      router.replace(`/chat/${convo.id}`);
    } catch {
      setChatError("Couldn't open the chat. Please try again.");
    } finally {
      setOpeningChat(false);
    }
  }

  if (confirmed) {
    const when = selectedSlot ? whenPhrase(days[selectedDay].isoDate, selectedSlot.time) : days[selectedDay].fullLabel;
    return (
      <View style={[styles.screen, styles.successScreen, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.successBody}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={28} color={AppColors.success} />
          </View>
          <Text style={[typography.heading, styles.centerText]}>You&apos;re booked</Text>
          <Text style={[typography.body, styles.centerText]}>
            {childName}&apos;s summary is with {selectedDoctor?.name ?? 'the doctor'}. See you {when}.
          </Text>
          <Text style={[typography.meta, styles.centerText]}>
            {consultKindLabel(doctorHasVideoLink(selectedDoctor))}.{' '}
            {doctorHasVideoLink(selectedDoctor)
              ? 'Your video link appears in Upcoming consultations before the consult.'
              : 'You can message the doctor before the consult.'}
          </Text>
          {urgent ? (
            <View style={styles.urgentNote} accessibilityRole="alert">
              <Ionicons name="alert-circle" size={18} color={AppColors.danger} style={styles.urgentIcon} />
              <View style={styles.urgentText}>
                {bookingLaterThanToday ? <Text style={typography.bodySM}>{notTodayAdvice}</Text> : null}
                <Text style={typography.bodySM}>
                  If {childName} gets worse before then, call 112.
                </Text>
                <TextButton
                  label="Call 112"
                  tone="danger"
                  onPress={callEmergency}
                  accessibilityLabel="Call 112, emergency services"
                  style={styles.callLink}
                />
              </View>
            </View>
          ) : null}
          {chatError ? (
            <Text style={[typography.bodySM, styles.errorText]} accessibilityRole="alert">
              {chatError}
            </Text>
          ) : null}
        </View>
        <View style={styles.successActions}>
          <GradientButton label="Go to home" onPress={() => router.replace('/(tabs)')} />
          <GradientButton
            variant="ghost"
            label={`Message ${doctorShortName(selectedDoctor?.name)}`}
            onPress={handleStartChat}
            loading={openingChat}
            style={styles.selfCenter}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CheckinHeader title="Pre-visit summary" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + CHECKIN_HEADER_HEIGHT,
            // Room for the footer, plus the urgent note when it shows.
            paddingBottom: (bookingLaterThanToday ? 180 : 100) + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
      >
        {session.loading ? (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="small" color={AppColors.primary} />
            <Text style={typography.meta}>Loading summary…</Text>
          </View>
        ) : summary ? (
          <>
            {/* C2: crisis puts 112 first: the urgency banner (a crisis is always
                urgent) carries the only Call 112 card; Tele-MANAS follows it. */}
            <SummaryCard
              summary={{ ...summary, parentHeadline }}
              childName={childName}
              sex={childSex}
              showUrgency
              booked={!!existingBooking}
              bookedLabel={bookedLabel}
              bookedToday={existingBooking ? existingBooking.date === today : null}
              emergencyNow={emergencyNow}
            >
              {summary.mentalHealth ? (
                <MentalHealthSupport
                  level={summary.mentalHealth}
                  childName={childName}
                  sex={childSex}
                  hideBooking
                  hideDangerCard={summary.suggestedUrgency === 'urgent'}
                />
              ) : null}
            </SummaryCard>
          </>
        ) : (
          <View style={styles.errorCard} accessibilityRole="alert">
            <Text style={[typography.bodySM, styles.errorText]}>
              {session.error ?? "We couldn't load the summary."}
            </Text>
            <View style={styles.errorActions}>
              {sessionId ? <GradientButton label="Try again" variant="outline" size="sm" onPress={session.retry} /> : null}
              <TextButton label="Start a new check-in" onPress={() => router.replace('/checkin')} />
            </View>
          </View>
        )}

        {/* The urgency banner above says "Booked: <doctor, time>" (R2-08). */}
        {existingBooking ? (
          <TextButton label="Go to home" onPress={() => router.replace('/(tabs)')} chevron style={styles.callLink} />
        ) : null}

        {childMissing ? (
          <Text style={[typography.bodySM, styles.errorText]} accessibilityRole="alert">
            This check-in is for a child who isn&apos;t on this account any more, so it can&apos;t be booked.
          </Text>
        ) : null}

        {/* R3-08: add this summary to the child's upcoming consult. */}
        {summary && attachable ? (
          <View style={styles.attachCard}>
            <Text style={typography.bodySM}>
              {childName} already has a consult with {attachDoctorName},{' '}
              {whenPhrase(attachable.date, attachable.time)}. Add this summary so the doctor can read it before
              the consult.
            </Text>
            {urgent && attachable.date !== today ? (
              <Text style={[typography.bodySM, styles.errorText]}>
                That consult isn&apos;t today. {childName} should be seen today, so also book a slot below or visit a
                clinic today.
              </Text>
            ) : null}
            {attachError ? (
              <Text style={[typography.bodySM, styles.errorText]} accessibilityRole="alert">
                {attachError}
              </Text>
            ) : null}
            <GradientButton
              variant="outline"
              label={`Add this summary to your consult with ${doctorShortName(attachDoctorName)}, ${whenPhrase(attachable.date, attachable.time)}`}
              onPress={handleAttach}
              loading={attaching}
            />
          </View>
        ) : null}

        {!showBookingForm ? null : (
        <>
        {/* R3-02: about the selected doctor only. The urgent banner above
            carries the Call 112 action. */}
        {noSlotToday && selectedDay === 0 && selectedDoctor ? (
          <View style={styles.urgentNote} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={18} color={AppColors.danger} style={styles.urgentIcon} />
            <View style={styles.urgentText}>
              <Text style={[typography.bodySM, styles.urgentTitle]}>
                {doctorShortName(selectedDoctor.name)} has no slot today
              </Text>
              {othersFreeToday.length > 0 ? (
                <>
                  <Text style={typography.bodySM}>These doctors still have a slot today:</Text>
                  {othersFreeToday.map((d) => (
                    <TextButton
                      key={d.id}
                      label={`Switch to ${doctorShortName(d.name)}${nextFree.get(d.id) ? ` · ${nextFree.get(d.id)}` : ''}`}
                      onPress={() => switchDoctor(d.id)}
                      chevron
                      style={styles.callLink}
                    />
                  ))}
                </>
              ) : (
                <Text style={typography.bodySM}>
                  No doctor has a slot today. Please take {childName} to a clinic or hospital today, or call 112.
                </Text>
              )}
              {earliestDay ? (
                <Text style={typography.meta}>
                  The earliest slot with {doctorShortName(selectedDoctor.name)} is {earliestDay.fullLabel}. You can
                  also book it below for a follow-up.
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={typography.headingSM}>Choose a doctor</Text>
          {loadingDocs ? (
            <ActivityIndicator size="small" color={AppColors.primary} />
          ) : (
            <DoctorPicker
              doctors={doctors}
              selectedId={selectedDoctorId}
              onSelect={setSelectedDoctorId}
              nextFree={nextFree}
              nextFreeLoaded={!nextFreeSlots.loading && !nextFreeSlots.error}
            />
          )}
          {selectedDoctor && autoPick?.id === selectedDoctor.id ? (
            <Text style={typography.meta}>
              Picked for you because this doctor {autoPick.reason}. You can choose another doctor.
            </Text>
          ) : null}
          {selectedDoctor && !doctorHasVideoLink(selectedDoctor) ? (
            <Text style={typography.meta}>
              {doctorShortName(selectedDoctor.name)}&apos;s video link is pending, so this is chat only for now. You
              can still book and message the doctor before the consult.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Pick a date</Text>
          <Text style={typography.meta}>
            {consultKindLabel(doctorHasVideoLink(selectedDoctor))} · times in IST
          </Text>
          <DateStrip days={days} selectedIndex={selectedDay} onSelect={setSelectedDay} />
        </View>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Pick a time</Text>
          {loadingSlots ? (
            <ActivityIndicator size="small" color={AppColors.primary} />
          ) : (
            <SlotPicker
              slots={slots}
              selectedId={selectedSlot?.id ?? null}
              onSelect={(slot) => {
                setBookingError(null);
                setSelectedSlot({ id: slot.id, time: slot.time });
              }}
            />
          )}
        </View>
        </>
        )}
      </ScrollView>

      {!showBookingForm ? null : (
      <View style={styles.footerWrapper} pointerEvents="box-none">
        <LinearGradient
          colors={[
            CanvasFade.a0,
            CanvasFade.a25,
            CanvasFade.a69,
            AppColors.surface,
          ]}
          locations={[0, 0.25, 0.5, 0.7]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {bookingLaterThanToday ? (
            <View style={[styles.urgentNote, styles.footerNote]} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color={AppColors.danger} style={styles.urgentIcon} />
              <Text style={[typography.bodySM, styles.urgentText]}>{notTodayAdvice}</Text>
            </View>
          ) : null}
          {bookingError ? (
            <Text style={[typography.bodySM, styles.errorText, styles.footerError]} accessibilityRole="alert">
              {bookingError}
            </Text>
          ) : null}
          <GradientButton
            label={
              selectedSlot && selectedDoctor
                ? `Confirm · ${doctorShortName(selectedDoctor.name)}, ${whenPhrase(days[selectedDay].isoDate, selectedSlot.time)}`
                : 'Confirm booking'
            }
            disabled={!selectedSlot || booking || !summary || !child}
            loading={booking}
            onPress={handleConfirm}
          />
        </View>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  scroll: { paddingHorizontal: 20, gap: 24 },

  loadingSection: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  errorCard: {
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.dangerBorder,
    backgroundColor: AppColors.dangerSurface,
  },
  errorActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  errorText: { color: AppColors.danger },
  footerError: { paddingBottom: 8, backgroundColor: AppColors.surface },
  footerNote: { marginBottom: 8 },

  urgentNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    gap: 8,
    padding: 12,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.dangerBorder,
    backgroundColor: AppColors.dangerSurface,
  },
  urgentIcon: { marginTop: 1 },
  urgentTitle: { fontFamily: FontFamily.semibold, color: AppColors.danger },
  callLink: { alignSelf: 'flex-start' },
  urgentText: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },

  section: { gap: 8 },
  attachCard: {
    gap: 8,
    padding: 12,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.card,
  },

  footerWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 12 },

  successScreen: { paddingHorizontal: 20, justifyContent: 'space-between' },
  successBody: { alignItems: 'center', gap: 12, paddingTop: 48 },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.successSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  centerText: { textAlign: 'center' },
  successActions: { gap: 4 },
  selfCenter: { alignSelf: 'center' },
});
