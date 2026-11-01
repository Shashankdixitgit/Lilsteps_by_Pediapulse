import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GradientButton } from '@/components/gradient-button';
import { StatusPill } from '@/components/ui/StatusPill';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { confirmReleaseSlot, SLOT_NOT_KEPT_TEXT, SLOT_RELEASED_TEXT, useConsultCheckout } from '@/hooks/useConsultCheckout';
import { cancelConsult, CONSULT_PRICE_LABEL } from '@/lib/consultPayment';

import { CONSULT_MINUTES, doctorInitial, doctorShortName, whenLabel } from './appointmentFormat';

export interface PendingPaymentCardProps {
  appointmentId: string;
  childId: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  /** Until when the time is held for the family. */
  holdExpiresAt: string | null;
  /** A follow-up the doctor booked (0051), not a booking the parent started. */
  followUp: boolean;
  /** Paid, cancelled or run out: reload the list. */
  onSettled: () => void;
}

/** Whole minutes left on a hold (at least 1 while it lasts); null when unknown. */
function minutesLeft(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  return ms > 0 ? Math.max(1, Math.ceil(ms / 60_000)) : 0;
}

/**
 * A booking waiting for this family to pay, shown on Home and the Consult
 * tab while its hold lasts:
 * - the parent's own booking whose payment was not finished (they left the
 *   payment page): "Finish paying ₹449" or "Cancel" (gives the slot back);
 * - a follow-up the doctor booked (0051): "Pay ₹449".
 * Paying goes through the same checkout as any booking (useConsultCheckout),
 * and the server confirms it.
 */
export function PendingPaymentCard({
  appointmentId,
  childId,
  doctorId,
  doctorName,
  date,
  time,
  holdExpiresAt,
  followUp,
  onSettled,
}: PendingPaymentCardProps) {
  const { checkout, paying, notice } = useConsultCheckout();
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  /** The payment page didn't open and the hold was let go: only the message stays. */
  const [released, setReleased] = useState(false);
  const [releasedNote, setReleasedNote] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const when = whenLabel(date, time);
  const left = minutesLeft(holdExpiresAt, now);

  // Count down; when the hold runs out, the list drops the card.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left === 0 && !released) onSettled();
  }, [left, released, onSettled]);

  async function pay() {
    setError(null);
    try {
      const paidId = await checkout(
        async () => ({ id: appointmentId }),
        { childId, doctorId, date, time },
        `${doctorName}, ${when}`,
        // A doctor's follow-up is kept even if the payment page fails to open.
        !followUp,
      );
      if (paidId) onSettled();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't open the payment page. Please try again.";
      setError(msg);
      if (msg === SLOT_NOT_KEPT_TEXT) setReleased(true);
    }
  }

  async function cancel() {
    if (!(await confirmReleaseSlot(when))) return;
    setError(null);
    setCancelling(true);
    try {
      await cancelConsult(appointmentId);
      // Say so before the card goes (review should-fix 6).
      setReleased(true);
      setReleasedNote(true);
      setTimeout(onSettled, 2500);
    } catch {
      setError("Couldn't cancel the booking. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  const expiresText =
    left === null ? null : left === 0 ? 'The time to pay has run out' : `Expires in ${left} min`;
  const busy = paying || cancelling;

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{doctorInitial(doctorName)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.doctor}>{doctorName}</Text>
          <Text style={styles.spec}>{followUp ? 'Follow-up booked by your doctor' : 'Booking not paid yet'}</Text>
          <View style={styles.pill}>
            <StatusPill tone="warning" label="Waiting for payment" />
          </View>
        </View>
      </View>
      <View style={styles.whenBlock}>
        <Text style={styles.when}>{when}</Text>
        <View style={styles.modeRow}>
          <Ionicons name="videocam-outline" size={14} color={AppColors.muted} />
          <Text style={styles.spec}>Video · {CONSULT_MINUTES} min</Text>
        </View>
      </View>
      <Text style={styles.body}>
        {followUp
          ? `Pay ${CONSULT_PRICE_LABEL} to confirm this follow-up.`
          : `The slot is kept for you while you pay ${CONSULT_PRICE_LABEL}.`}
        {expiresText ? ` ${expiresText}.` : ''}
      </Text>
      {released ? null : (
      <GradientButton
        label={followUp ? `Pay ${CONSULT_PRICE_LABEL}` : `Finish paying ${CONSULT_PRICE_LABEL}`}
        onPress={pay}
        loading={paying}
        disabled={busy}
        accessibilityLabel={`${followUp ? 'Pay' : 'Finish paying'} ${CONSULT_PRICE_LABEL} for the consult with ${doctorName}, ${when}`}
      />
      )}
      {followUp || released ? null : (
        <GradientButton
          variant="ghost"
          label="Cancel"
          onPress={cancel}
          loading={cancelling}
          disabled={busy}
          style={styles.selfCenter}
          accessibilityLabel={`Cancel the unpaid booking with ${doctorShortName(doctorName)}, ${when}`}
        />
      )}
      {notice || error || releasedNote ? (
        <Text style={[styles.hint, error ? styles.error : null]} accessibilityRole="alert">
          {error ?? (releasedNote ? SLOT_RELEASED_TEXT : notice)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    borderStyle: 'dashed',
    padding: 16,
    gap: 12,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pill: { flexDirection: 'row', marginTop: 4 },
  avatar: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 13, color: AppColors.primary },
  info: { flex: 1, minWidth: 0, gap: 2 },
  doctor: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  spec: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  whenBlock: { gap: 2 },
  when: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 22, color: AppColors.onSurface },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.onSurface },
  hint: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
  error: { color: AppColors.danger },
  selfCenter: { alignSelf: 'center' },
});
