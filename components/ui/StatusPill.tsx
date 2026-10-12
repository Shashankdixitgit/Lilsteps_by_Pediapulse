import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius } from '@/constants/theme';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<StatusTone, { fg: string; bg: string; border: string; icon: keyof typeof Ionicons.glyphMap }> = {
  success: { fg: AppColors.success, bg: AppColors.successSurface, border: AppColors.successBorder, icon: 'checkmark-circle' },
  warning: { fg: AppColors.warning, bg: AppColors.warningSurface, border: AppColors.warningBorder, icon: 'time' },
  danger: { fg: AppColors.danger, bg: AppColors.dangerSurface, border: AppColors.dangerBorder, icon: 'alert-circle' },
  info: { fg: AppColors.info, bg: AppColors.infoSurface, border: AppColors.infoBorder, icon: 'information-circle' },
  neutral: { fg: AppColors.onSurfaceVariant, bg: AppColors.surfaceContainer, border: AppColors.border, icon: 'ellipse-outline' },
};

interface StatusPillProps {
  tone: StatusTone;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * List-row mode: a 6px coloured dot + label text, no fill, no border, no
   * icon. Still colour + label. Use for calm statuses (upcoming, given).
   */
  dot?: boolean;
}

/** Semantic status pill (24 high): always colour + icon + label (never colour alone). `dot` for list rows. */
export function StatusPill({ tone, label, icon, dot }: StatusPillProps) {
  const t = TONES[tone];
  if (dot) {
    return (
      <View style={styles.dotWrap}>
        <View style={[styles.dot, { backgroundColor: t.fg }]} />
        <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Ionicons name={icon ?? t.icon} size={12} color={t.fg} />
      <Text style={[styles.label, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  label: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  dotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
