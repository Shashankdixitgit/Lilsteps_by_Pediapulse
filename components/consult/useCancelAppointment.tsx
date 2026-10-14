/**
 * Cancel an appointment the safe way: ask first, then say what happened.
 * Used by Home and the Consult tab so both behave the same.
 *
 * - Ask: lib/confirm (native Alert; in-app dialog on web) with Keep /
 *   Cancel consult.
 * - Result: an inline notice ("Cancelled …" or the error) read out by
 *   screen readers via a polite live region.
 */
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { confirmAsync } from '@/lib/confirm';

import { doctorShortName, whenLabel } from './appointmentFormat';

export interface CancellableAppointment {
  id: string;
  date: string;
  time: string;
  doctorName: string;
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

export function useCancelAppointment(cancel: (id: string) => Promise<void>) {
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
      const ok = await askToConfirm(
        childName ? `Cancel ${childName}'s consult?` : 'Cancel this consult?',
        `${childName ? `${childName} with ` : ''}${a.doctorName} · ${when}. The slot will be released for other families.`,
      );
      if (!ok) return;
      setCancellingId(a.id);
      setNotice(null);
      if (timer.current) clearTimeout(timer.current);
      try {
        await cancel(a.id);
        setNotice({
          tone: 'success',
          text: `Cancelled ${childName ? `${childName}'s` : 'your'} consult with ${doctorShortName(a.doctorName)} (${when}).`,
        });
        timer.current = setTimeout(() => setNotice(null), 6000);
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
