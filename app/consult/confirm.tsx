/**
 * Booking Confirmation — Step 3 (final)
 *
 * Shows the summary, holds the slot via useAppointments.bookAppointment,
 * takes the ₹449 payment (useConsultCheckout → Razorpay) — or, with a Care
 * Plan consult left this month, books it with the plan instead (no payment
 * page; the server checks the plan, 0053) — then renders a success state
 * in-place. The consult is only booked once the server says so.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CONSULT_MINUTES,
  doctorInitial,
  doctorShortName,
  formatSlotTime as formatTime,
  JOIN_OPENS_MINUTES,
  whenPhrase,
} from '@/components/consult/appointmentFormat';
import { GradientButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { typography } from '@/styles/global';
import { useChild } from '@/context/child';
import { supabase } from '@/lib/supabase';
import { linkConversationToAppointment, useAppointments } from '@/hooks/useAppointments';
import { useCarePlan } from '@/hooks/useCarePlan';
import { useConsultCheckout } from '@/hooks/useConsultCheckout';
import { CARE_PLAN_CONSULTS, creditsLeft, viewOf } from '@/lib/carePlan';
import { CONSULT_PRICE_LABEL } from '@/lib/consultPayment';
import { useConversations } from '@/hooks/useConversations';

interface DoctorInfo {
  name: string;
  specialisation: string;
  hospital: string;
  has_meet_link: boolean;
  has_google_calendar: boolean;
}

/** Messages hold_slot (0045, from book_slot 0015/0020) raises on purpose; safe to show as they are. */
const BOOKING_MESSAGES = [
  'Please sign in again to book.',
  'Child not found.',
  'This slot no longer exists.',
  'This slot was just taken.',
  'This slot has already passed.',
  'This doctor is not taking bookings right now.',
  'Please update LilSteps to book.',
];

/**
 * Plain wording for a failed booking. Our own reasons are shown; anything
 * else (network "Failed to fetch", timeouts, server text) gets one calm line.
 */
function bookingErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message.trim() : '';
  const known = BOOKING_MESSAGES.find((m) => msg === m);
  if (known) return `Couldn't book: ${known} Please go back and pick another time.`;
  // hold_slot's two-holds limit names its own wait; show it as it is.
  if (msg.startsWith('You already have two bookings waiting for payment.')) return msg;
  if (/fetch|network|timed? ?out|offline/i.test(msg)) {
    return "Couldn't book: no connection. Check your internet and tap the Pay button again.";
  }
  return "Couldn't book this time. Please try again, or go back and pick another time.";
}

export default function ConfirmScreen() {
  const insets = useSafeAreaInsets();
  const { child } = useChild();
  const { doctorId, dateIso, dateLabel, time, slotId, issue } = useLocalSearchParams<{
    doctorId: string;
    dateIso: string;
    dateLabel: string;
    time: string;
    slotId: string;
    issue: string;
  }>();
  const { bookAppointment } = useAppointments(child?.id ?? null);
  const { startConversation } = useConversations(child?.id ?? null);
  const [openingChat, setOpeningChat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const { checkout, checkoutWithPlan, resumeFor, releaseHold, paying: booking, notice: payNotice, awaitingPayment } =
    useConsultCheckout();
  // Care Plan consults left this month (0 without a plan): offered before ₹449.
  const { plan, reload: reloadPlan } = useCarePlan();
  const planLeft = creditsLeft(plan);
  const planView = viewOf(plan);
  const planUsedUp =
    planLeft === 0 && (planView.kind === 'active' || planView.kind === 'ending' || planView.kind === 'ended');
  const [bookedWithPlan, setBookedWithPlan] = useState(false);
  // The booked appointment's id (set on success); the chat is linked to it.
  const [bookedId, setBookedId] = useState<string | null>(null);
  const confirmed = bookedId !== null;

  useEffect(() => {
    if (!doctorId) return;
    (async () => {
      const { data } = await supabase
        .from('doctors')
        .select('name, specialisation, hospital, has_meet_link, has_google_calendar')
        .eq('id', doctorId)
        .maybeSingle<DoctorInfo>();
      if (data) setDoctor(data);
    })();
  }, [doctorId]);

  // Came back to this slot with a payment left unfinished: offer to finish it.
  const childId = child?.id;
  useEffect(() => {
    if (!childId || !doctorId || !dateIso || !time) return;
    void resumeFor({ childId, doctorId, date: dateIso, time });
    // Once per slot; resumeFor is a fresh function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, doctorId, dateIso, time]);

  const childName = child?.name ?? 'Your child';
  // describe → slots pass this as a route param (already decoded).
  const issueText = (issue ?? '').trim();

  async function confirmBooking() {
    if (!child || !doctorId || !dateIso || !time) return;
    setError(null);
    try {
      const paidId = await checkout(
        () =>
          bookAppointment({
            child_id: child.id,
            doctor_id: doctorId,
            date: dateIso,
            time,
            slot_id: slotId || undefined,
            concern: issueText || undefined,
          }),
        { childId: child.id, doctorId, date: dateIso, time },
        `${doctor?.name ?? 'your doctor'}, ${whenPhrase(dateIso, time)}`,
      );
      if (paidId) setBookedId(paidId);
    } catch (e) {
      // Inline (Alert.alert is a no-op on web).
      setError(bookingErrorText(e));
    }
  }

  async function bookWithPlan() {
    if (!child || !doctorId || !dateIso || !time) return;
    setError(null);
    try {
      const planBookedId = await checkoutWithPlan(
        () =>
          bookAppointment({
            child_id: child.id,
            doctor_id: doctorId,
            date: dateIso,
            time,
            slot_id: slotId || undefined,
            concern: issueText || undefined,
          }),
        { childId: child.id, doctorId, date: dateIso, time },
      );
      if (planBookedId) {
        setBookedWithPlan(true);
        setBookedId(planBookedId);
      } else {
        // Used up a moment ago (another booking): show the new count.
        void reloadPlan();
      }
    } catch (e) {
      setError(bookingErrorText(e));
    }
  }

  async function cancelHold() {
    setError(null);
    try {
      await releaseHold();
      router.back();
    } catch {
      setError("Couldn't cancel the booking. Please try again.");
    }
  }

  async function messageDoctor() {
    if (!child || !doctorId || openingChat) return;
    setOpeningChat(true);
    setError(null);
    try {
      const convo = await startConversation({
        child_id: child.id,
        doctor_id: doctorId,
        appointment_id: bookedId ?? undefined,
      });
      // One chat per child + doctor: point an existing one at this consult too,
      // so the doctor knows which booking the message is about.
      if (bookedId && convo.appointment_id !== bookedId) {
        await linkConversationToAppointment(convo.id, bookedId);
      }
      router.replace(`/chat/${convo.id}`);
    } catch {
      setError("Couldn't open the chat. Please try again.");
    } finally {
      setOpeningChat(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (confirmed) {
    const when = dateIso && time ? whenPhrase(dateIso, time) : (dateLabel ?? '');
    return (
      <View style={[styles.screen, styles.successScreen, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.successBody}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={28} color={AppColors.success} />
          </View>
          <Text style={[typography.heading, styles.centerText]}>You&apos;re booked</Text>
          <Text style={[typography.body, styles.centerText]}>
            {childName} will see {doctor?.name ?? 'the doctor'}
            {when ? ` ${when}` : ''}.
          </Text>
          {bookedWithPlan ? (
            <Text style={[typography.bodySM, styles.centerText]}>Booked with your Care Plan. Nothing to pay.</Text>
          ) : null}
          <Text style={[typography.meta, styles.centerText]}>
            {doctor && !doctor.has_meet_link && !doctor.has_google_calendar
              ? `Video · ${CONSULT_MINUTES} min. ${doctorShortName(doctor.name)} hasn't set a video link yet. Message them to agree how you'll connect.`
              : `Video · ${CONSULT_MINUTES} min. Join video opens in Upcoming consultations ${JOIN_OPENS_MINUTES} min before the start.`}
          </Text>
          {error ? (
            <Text style={[typography.bodySM, styles.errorText]} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </View>
        <View style={styles.successActions}>
          <GradientButton label="Go to home" onPress={() => router.replace('/(tabs)')} />
          <GradientButton
            variant="ghost"
            label={`Message ${doctorShortName(doctor?.name)}`}
            onPress={messageDoctor}
            loading={openingChat}
            style={styles.selfCenter}
          />
        </View>
      </View>
    );
  }

  // ── Review state ───────────────────────────────────────────────────────────
  const initial = doctorInitial(doctor?.name);
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Confirm booking" backDisabled={booking} />

      <View style={styles.steps}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.stepDot, s <= 3 && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={typography.heading}>Review and confirm</Text>

        <View style={styles.card}>
          <View style={styles.docRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.docText}>
              <Text style={styles.docName} numberOfLines={1}>
                {doctor?.name ?? 'Doctor'}
              </Text>
              {doctor?.specialisation ? (
                <Text style={typography.meta} numberOfLines={1}>
                  {doctor.specialisation}
                </Text>
              ) : null}
              {doctor?.hospital ? (
                <Text style={typography.caption} numberOfLines={1}>
                  {doctor.hospital}
                </Text>
              ) : null}
            </View>
          </View>
          <DetailRow label="Patient" value={childName} />
          <DetailRow label="Date" value={dateLabel ?? ''} />
          <DetailRow label="Time" value={time ? formatTime(time) : ''} />
          <DetailRow label="Mode" value={`Video · ${CONSULT_MINUTES} min`} />
          {issueText.length > 0 && <DetailRow label="Concern" value={issueText} />}
          <DetailRow label="Fee" value={planLeft > 0 ? `Care Plan, or ${CONSULT_PRICE_LABEL}` : CONSULT_PRICE_LABEL} />
        </View>

        <View style={styles.policyNote}>
          <Ionicons name="shield-checkmark-outline" size={Size.iconMeta} color={AppColors.secondary} />
          <Text style={[typography.caption, styles.flex]}>
            {planLeft > 0
              ? `A plan consult cancelled 2 hours or more before it starts, or cancelled by the doctor, goes back to your plan. If you pay ${CONSULT_PRICE_LABEL}, the usual full-refund rules apply.`
              : 'Paid securely through Razorpay. Cancel 2 hours or more before the consult for a full refund. If the doctor cancels, you get a full refund.'}
          </Text>
        </View>

        {payNotice ? (
          <Text style={[typography.bodySM, styles.noticeText]} accessibilityLiveRegion="polite" aria-live="polite">
            {payNotice}
          </Text>
        ) : null}

        {error ? (
          <Text style={[typography.bodySM, styles.errorText]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {planUsedUp ? (
          <Text style={[typography.caption, styles.planNote]}>
            You’ve used this month’s {CARE_PLAN_CONSULTS} plan consults, so this one is {CONSULT_PRICE_LABEL}.
          </Text>
        ) : null}
        {planLeft > 0 ? (
          <GradientButton
            label={`Use 1 of your plan consults (${planLeft} left)`}
            onPress={bookWithPlan}
            loading={booking}
            disabled={booking}
          />
        ) : null}
        <GradientButton
          variant={planLeft > 0 ? 'outline' : 'dark'}
          label={
            awaitingPayment
              ? `Finish paying ${CONSULT_PRICE_LABEL}`
              : planLeft > 0
                ? `Pay ${CONSULT_PRICE_LABEL} instead`
                : `Pay ${CONSULT_PRICE_LABEL} and book`
          }
          onPress={confirmBooking}
          loading={booking && planLeft === 0}
          disabled={booking}
          style={planLeft > 0 ? styles.secondAction : undefined}
        />
        {awaitingPayment ? (
          <GradientButton
            variant="ghost"
            label="Cancel booking"
            onPress={cancelHold}
            disabled={booking}
            style={styles.selfCenter}
          />
        ) : null}
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[typography.meta, styles.detailLabel]}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  steps: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
  stepDot: { flex: 1, height: 3, borderRadius: 999, backgroundColor: AppColors.border },
  stepDotActive: { backgroundColor: AppColors.primary },

  scroll: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },

  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 15, color: AppColors.primary },
  docText: { flex: 1, gap: 2 },
  docName: { ...typography.title, lineHeight: 20 },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  detailLabel: { width: 72, lineHeight: 20 },
  detailValue: { ...typography.title, lineHeight: 20, flex: 1, textAlign: 'right' },

  policyNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  flex: { flex: 1 },
  noticeText: { color: AppColors.onSurfaceVariant, textAlign: 'center' },
  planNote: { textAlign: 'center', marginBottom: 8 },
  secondAction: { marginTop: 8 },

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: AppColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },

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
  errorText: { color: AppColors.danger, textAlign: 'center' },
  successActions: { gap: 4 },
  selfCenter: { alignSelf: 'center' },
});
