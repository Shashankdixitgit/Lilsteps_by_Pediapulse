import { StyleSheet, Text, View } from 'react-native';

import { StatusPill } from '@/components/ui/StatusPill';
import { AppColors, FontFamily } from '@/constants/theme';

import { whenLabel } from './appointmentFormat';

export interface CancelledConsultItemProps {
  doctorName: string;
  date: string;
  time: string;
  /** What the parent wrote when booking, if anything. */
  concern: string | null;
  /** e.g. "Cancelled · refund started" (cancelledStatusLabel). */
  statusLabel: string;
  /** Cancelled by the doctor rather than the family. */
  byDoctor: boolean;
  /** Hairline top divider when stacked inside one parent list card. */
  divider?: boolean;
  /** Pill style: cancelled (default) or waiting for the doctor's notes. */
  tone?: 'cancelled' | 'waiting';
}

/**
 * A cancelled consult in "Past consultations": same row shape as
 * ConsultHistoryItem, not tappable (there is no consult record to open),
 * with a neutral status pill saying what happened to the payment.
 */
export function CancelledConsultItem({
  doctorName,
  date,
  time,
  concern,
  statusLabel,
  byDoctor,
  divider,
  tone = 'cancelled',
}: CancelledConsultItemProps) {
  const meta = `${whenLabel(date, time)} · ${doctorName}`;
  const title = concern?.trim() || 'Consultation';
  return (
    <View
      style={[styles.row, divider && styles.divider]}
      accessible
      accessibilityLabel={`${title}, ${meta}. ${statusLabel}${byDoctor && tone === 'cancelled' ? ', cancelled by the doctor' : ''}`}
    >
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.meta}>{meta}</Text>
      <View style={styles.pillRow}>
        <StatusPill
          tone={tone === 'waiting' ? 'info' : 'neutral'}
          icon={tone === 'waiting' ? 'time-outline' : 'close-circle-outline'}
          label={statusLabel}
        />
        {byDoctor ? <Text style={styles.meta}>by the doctor</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 60, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.border },
  title: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  meta: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
});
