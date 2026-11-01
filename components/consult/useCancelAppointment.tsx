/**
 * Cancel an appointment the safe way: ask first, then say what happened.
 * Used by Home and the Consult tab so both behave the same.
 *
 * - Ask: lib/confirm (native Alert; in-app dialog on web) with Keep /
 *   Cancel consult. The question says whether the payment comes back
 *   (2 h or more before the start: yes; later: no). The server decides.
 * - Result: an inline notice ("Cancelled …" or the error) read out by
 *   screen readers via a polite live region.
 */
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { confirmAsync } from '@/lib/confirm';

import { type CancelOutcome, REFUND_FAILED_TEXT } from '@/lib/consultPayment';

import { appointmentStart, doctorShortName, whenLabel } from './appointmentFormat';

/** Same cut-off as the server (REFUND_CUTOFF_MS in _shared/razorpay.ts). */
const REFUND_CUTOFF_MS = 2 * 60 * 60 * 1000;

export interface CancellableAppointment {
  id: string;
  date: string;
  time: string;
  doctorName: string;
  /** Booked with a Care Plan consult (appointments.paid_with_plan): the question talks about the plan, not money. */
  paidWithPlan?: boolean;
  /**
   * The child the consult is for. Home and the Consult tab list the active
   * child's consults, so this defaults to the active child.
   */
  childName?: string | null;
}

export interface CancelNoticeState {
  tone: 'success' | 'danger';
  text: string;
}

function askToConfirm(title: string, message: string): Promise<boolean> {
  return confirmAsync(title, message, { confirmLabel: 'Cancel consult', cancelLabel: 'Keep', destructive: true });
}

/** Accessible name for a Cancel button: names the doctor and the time. */
export function cancelLabel(a: CancellableAppointment): string {
  return `Cancel consult with ${a.doctorName}, ${whenLabel(a.date, a.time)}`;
}

export function useCancelAppointment(
  cancel: (id: string) => Promise<CancelOutcome | void>,
) {
  const [notice, setNotice] = useState<CancelNoticeState | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { child } = useChild();
  const activeChildName = child?.name ?? null;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const requestCancel = useCallback(
    async (a: CancellableAppointment) => {
      if (cancellingId) return;
      const when = whenLabel(a.date, a.time);
      // R2-22: a parent of two must know whose consult this is.
      const childName = a.childName ?? activeChildName;
      const early = appointmentStart(a.date, a.time).getTime() - Date.now() >= REFUND_CUTOFF_MS;
      const ok = await askToConfirm(
        childName ? `Cancel ${childName}'s consult?` : 'Cancel this consult?',
        `${childName ? `${childName} with ` : ''}${a.doctorName} · ${when}. The slot will be released for other families. ` +
          (a.paidWithPlan
            ? early
              ? 'The consult goes back to your Care Plan, as long as that plan month hasn’t ended.'
              : 'It starts in less than 2 hours, so this Care Plan consult counts as used.'
            : early
              ? 'If you paid, the full amount is refunded.'
              : 'It starts in less than 2 hours. If you paid, it is not refunded.'),
      );
      if (!ok) return;
      setCancellingId(a.id);
      setNotice(null);
      if (timer.current) clearTimeout(timer.current);
      try {
        const result = await cancel(a.id);
        const refundLine =
          result?.plan === 'returned'
            ? ' The consult has gone back to your Care Plan.'
            : result?.plan === 'used'
            ? ' It was less than 2 hours before the consult, so this Care Plan consult counts as used.'
            : result?.plan === 'expired'
            ? ' The plan month it was booked in has ended, so it can’t go back to your plan. Nothing more was charged.'
            : result?.plan === 'rebook_owed'
            ? ' The plan month has ended, so the clinic will book a free consult for you.'
            : result?.refund === 'started'
            ? ' Your refund has started; it reaches your account in 5–7 working days.'
            : result?.refund === 'failed'
              ? ` ${REFUND_FAILED_TEXT}`
              : result?.late
              ? ' It was less than 2 hours before the consult, so the payment is not refunded.'
              : '';
        setNotice({
          tone: 'success',
          text: `Cancelled ${childName ? `${childName}'s` : 'your'} consult with ${doctorShortName(a.doctorName)} (${when}).${refundLine}`,
        });
        timer.current = setTimeout(() => setNotice(null), refundLine ? 10000 : 6000);
      } catch (e) {
        const msg = e instanceof Error && e.message ? e.message : 'Please try again.';
        setNotice({ tone: 'danger', text: `Couldn't cancel. ${msg}` });
      } finally {
        setCancellingId(null);
      }
    },
    [cancel, cancellingId, activeChildName],
  );

  return { requestCancel, notice, cancellingId };
}

/** Inline result line for a cancel (success or error). */
export function CancelNotice({ notice }: { notice: CancelNoticeState | null }) {
  if (!notice) return null;
  const danger = notice.tone === 'danger';
  return (
    <View
      style={[styles.notice, danger ? styles.noticeDanger : styles.noticeSuccess]}
      accessibilityLiveRegion="polite"
      accessibilityRole={danger ? 'alert' : 'text'}
      aria-live="polite"
    >
      <Ionicons
        name={danger ? 'alert-circle' : 'checkmark-circle'}
        size={16}
        color={danger ? AppColors.danger : AppColors.success}
        style={styles.icon}
      />
      <Text style={[styles.text, { color: danger ? AppColors.danger : AppColors.success }]}>{notice.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  noticeSuccess: { backgroundColor: AppColors.successSurface, borderColor: AppColors.successBorder },
  noticeDanger: { backgroundColor: AppColors.dangerSurface, borderColor: AppColors.dangerBorder },
  icon: { marginTop: 1 },
  text: { flex: 1, fontFamily: FontFamily.medium, fontSize: 13, lineHeight: 18 },
});
