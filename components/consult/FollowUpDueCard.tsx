import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GradientButton } from '@/components/gradient-button';
import { StatusPill } from '@/components/ui/StatusPill';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useConsultCheckout } from '@/hooks/useConsultCheckout';
import { CONSULT_PRICE_LABEL } from '@/lib/consultPayment';

import { CONSULT_MINUTES, doctorInitial, whenLabel } from './appointmentFormat';

export interface FollowUpDueCardProps {
  appointmentId: string;
  childId: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  /** Until when the time is held for the family. */
  holdExpiresAt: string | null;
  /** Paid (or the hold ended): reload the list. */
  onSettled: () => void;
}

/** "Mon 2 Nov, 5:30 pm" in clinic time, for "held until". */
function heldUntilLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * A follow-up the doctor booked (0051) that waits for this family to pay.
 * Shown under Upcoming as "Waiting for payment" with a Pay button; paying
 * goes through the same checkout as any booking (useConsultCheckout), and
 * the server confirms it.
 */
export function FollowUpDueCard({
  appointmentId,
  childId,
  doctorId,
  doctorName,
  date,
  time,
  holdExpiresAt,
  onSettled,
}: FollowUpDueCardProps) {
  const { checkout, paying, notice } = useConsultCheckout();
  const [error, setError] = useState<string | null>(null);
  const when = whenLabel(date, time);
  const until = heldUntilLabel(holdExpiresAt);

  async function pay() {
    setError(null);
    try {
      const paidId = await checkout(
        async () => ({ id: appointmentId }),
        { childId, doctorId, date, time },
        `${doctorName}, ${when}`,
      );
      if (paidId) onSettled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the payment page. Please try again.");
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{doctorInitial(doctorName)}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.doctor}>{doctorName}</Text>
          <Text style={styles.spec}>Follow-up booked by your doctor</Text>
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
        Pay {CONSULT_PRICE_LABEL} to confirm this follow-up.
        {until ? ` The time is kept for you until ${until}.` : ''}
      </Text>
      <GradientButton
        label={`Pay ${CONSULT_PRICE_LABEL}`}
        onPress={pay}
        loading={paying}
        disabled={paying}
        accessibilityLabel={`Pay ${CONSULT_PRICE_LABEL} to confirm the follow-up with ${doctorName}, ${when}`}
      />
      {notice || error ? (
        <Text style={[styles.hint, error ? styles.error : null]} accessibilityRole="alert">
          {error ?? notice}
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
});
