import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { AppColors, Radius, Size } from '@/constants/theme';
import { typography } from '@/styles/global';

type IconName = keyof typeof Ionicons.glyphMap;

export interface SettingsRowProps {
  icon: IconName;
  title: string;
  /** Short value on the right (13 muted); stacked under the title at large text sizes or on narrow screens. */
  value?: string;
  /** Data line under the title (e.g. allergy names). */
  detail?: string;
  onPress?: () => void;
  chevron?: boolean;
  /** Right slot (e.g. a Switch). Replaces `value`. */
  right?: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'neutral';
  divider?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** One settings/list row: 36 icon well, 15 SemiBold title, optional value /
 *  detail / right slot, chevron. Used on Profile and its sub-screens. */
export function SettingsRow({
  icon,
  title,
  value,
  detail,
  onPress,
  chevron,
  right,
  tone = 'default',
  divider,
  accessibilityLabel,
  accessibilityHint,
}: SettingsRowProps) {
  const { width, fontScale } = useWindowDimensions();
  // At 200% zoom or on a narrow phone a value beside the title squeezes both
  // to "Priv…" / "Del…" (R3-05): put the value on its own line under the title.
  const stackValue = fontScale >= 1.3 || width / Math.max(fontScale, 1) < 340;
  const showValue = !!value && !right;
  const well =
    tone === 'warning'
      ? { bg: AppColors.warningSurface, fg: AppColors.warning }
      : tone === 'danger'
        ? { bg: AppColors.dangerSurface, fg: AppColors.danger }
        : tone === 'neutral'
          ? { bg: AppColors.surfaceContainer, fg: AppColors.onSurfaceVariant }
          : { bg: AppColors.mintSurface, fg: AppColors.secondary };
  const content: ReactNode = (
    <>
      {/* Decorative: dropped in the stacked layout so the words get the room. */}
      {stackValue ? null : (
        <View style={[styles.well, { backgroundColor: well.bg }]}>
          <Ionicons name={icon} size={Size.iconRow} color={well.fg} />
        </View>
      )}
      <View style={showValue && !stackValue ? styles.rowTextSide : styles.rowTextFlex}>
        <Text style={typography.title}>{title}</Text>
        {showValue && stackValue ? <Text style={typography.meta}>{value}</Text> : null}
        {detail ? (
          <Text style={typography.meta}>
            {detail}
          </Text>
        ) : null}
      </View>
      {showValue && !stackValue ? (
        <Text style={[typography.meta, styles.rowValue]} numberOfLines={2}>
          {value}
        </Text>
      ) : null}
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={AppColors.outlineVariant} /> : null}
    </>
  );
  return (
    <View>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          {content}
        </Pressable>
      ) : (
        <View style={styles.row} accessibilityLabel={accessibilityLabel}>
          {content}
        </View>
      )}
      {divider ? <View style={[styles.divider, stackValue && styles.dividerStacked]} /> : null}
    </View>
  );
}

/** White bordered card that groups SettingsRows. */
export function SettingsCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowPressed: { backgroundColor: AppColors.surfaceContainerLow },
  well: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Title keeps priority; the value takes what is left and wraps (never "…").
  rowTextSide: { flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 2 },
  rowTextFlex: { flex: 1, minWidth: 0, gap: 2 },
  rowValue: { flexShrink: 1, maxWidth: '50%', minWidth: 0, textAlign: 'right' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.border,
    marginLeft: 16 + Size.iconWell + 12,
  },
  dividerStacked: { marginLeft: 16 },
});
