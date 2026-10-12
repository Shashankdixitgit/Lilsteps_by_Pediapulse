import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius } from '@/constants/theme';

export interface SummaryDetail {
  label: string;
  value: string;
}

export interface CheckinSummaryShape {
  chiefComplaint: string;
  details: SummaryDetail[];
  relevantHistory?: string | null;
  allergyNote?: string | null;
}

export interface SummaryCardProps {
  summary: CheckinSummaryShape;
  childName: string;
}

/**
 * One white hairline card: "AI summary · Child" label, chief complaint (17),
 * detail rows with hairline separators, then history / allergy as plain rows
 * (no nested boxes). The allergy note keeps warning colour + icon + text.
 */
export function SummaryCard({ summary, childName }: SummaryCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={14} color={AppColors.secondary} />
        <Text style={styles.aiLabel}>AI summary</Text>
        <Text style={styles.childName} numberOfLines={1}>
          · {childName}
        </Text>
      </View>
      <Text style={styles.complaint}>{summary.chiefComplaint}</Text>

      {summary.details.length > 0 ? (
        <View>
          {summary.details.map((d) => (
            <View key={d.label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{d.label}</Text>
              <Text style={styles.detailValue}>{d.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!!summary.relevantHistory && (
        <View style={styles.noteRow}>
          <Ionicons name="time-outline" size={14} color={AppColors.outline} style={styles.noteIcon} />
          <Text style={styles.noteText}>{summary.relevantHistory}</Text>
        </View>
      )}

      {!!summary.allergyNote && (
        <View style={styles.noteRow}>
          <Ionicons name="warning-outline" size={14} color={AppColors.warning} style={styles.noteIcon} />
          <Text style={[styles.noteText, styles.warningText]}>{summary.allergyNote}</Text>
        </View>
      )}
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
    padding: 16,
    gap: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  aiLabel: { fontFamily: FontFamily.semibold, fontSize: 12, lineHeight: 16, color: AppColors.secondary },
  childName: { flexShrink: 1, fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
  complaint: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: AppColors.onSurface,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  detailLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.muted,
    flex: 1,
  },
  detailValue: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    flex: 2,
    textAlign: 'right',
  },
  noteRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  noteIcon: { marginTop: 2 },
  noteText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurfaceVariant,
    flex: 1,
  },
  warningText: { color: AppColors.warning },
});
