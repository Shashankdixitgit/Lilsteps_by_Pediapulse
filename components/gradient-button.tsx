import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Size } from '@/constants/theme';

interface GradientButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  /**
   * `dark` (default): deep-purple pill, white label, white circle with a purple arrow.
   *          This is also THE CTA on lavender glass heroes (HeroCard).
   * `light`: white pill, ink label, black circle with a white arrow. Only on a
   *          solid primary surface (rare now: heroes are lavender).
   * `outline`: white pill, 1px borderStrong, primary label, no arrow.
   * `ghost`: text-only secondary action. No fill, no border, `secondary`
   *          label, 44 hit area. Use for every non-primary action.
   * `danger`: text-only destructive action (Sign out): `danger` label.
   */
  variant?: 'dark' | 'light' | 'outline' | 'ghost' | 'danger';
  /** Ghost/danger only: trailing chevron-forward 14. */
  chevron?: boolean;
  /** Hide the circular arrow badge (e.g. for "Skip"/secondary flows). */
  showArrow?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /**
   * `md` 48 (default; the standard primary). `lg` 56 only on splash.
   * `sm` 32: small inline action pill (Book, Mark given); use with `outline`.
   */
  size?: 'lg' | 'md' | 'sm';
  accessibilityLabel?: string;
}

/**
 * Primary action button (name kept for call-site compatibility; there is no
 * gradient). Pill + arrow circle echo healthnivaran.in. Squishy press via
 * PressableScale, light haptic. Disabled never uses opacity: it switches to
 * a cool-grey fill with a muted label (AA).
 */
export function GradientButton({
  label,
  onPress,
  style,
  variant = 'dark',
  showArrow = true,
  disabled,
  loading,
  size = 'md',
  chevron,
  accessibilityLabel,
}: GradientButtonProps) {
  // Narrow pill (small phone, 200% zoom) or large text: drop the arrow badge
  // so the label keeps the room, and let it wrap to 2 lines (R3-16).
  // Window width, not the pill's: a short inline button keeps its arrow.
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const roomy = fontScale < 1.3 && windowWidth >= 340;
  const isText = variant === 'ghost' || variant === 'danger';
  if (isText) {
    return (
      <TextButton
        label={label}
        onPress={onPress}
        style={style}
        tone={variant === 'danger' ? 'danger' : 'secondary'}
        chevron={chevron}
        disabled={!!disabled || !!loading}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  const isLight = variant === 'light';
  const isOutline = variant === 'outline';
  const isSmall = size === 'sm';
  const hasLabel = label.length > 0;
  const inactive = !!disabled || !!loading;
  const withArrow = showArrow && roomy && hasLabel && !isOutline && !disabled && !isSmall;
  const height = size === 'lg' ? Size.buttonLarge : isSmall ? Size.buttonSmall : Size.buttonPrimary;
  // Arrow circle: 44 inside the 56 pill, 32 inside the 48 pill.
  const circle = size === 'lg' ? height - 12 : height - 16;
  const arrowInset = (height - circle) / 2;

  const bg = disabled
    ? AppColors.surfaceContainerHigh
    : isLight
      ? AppColors.card
      : isOutline
        ? AppColors.card
        : AppColors.primary;
  const bgPressed = disabled
    ? AppColors.surfaceContainerHigh
    : isLight || isOutline
      ? AppColors.surfaceContainer
      : AppColors.primaryDim;
  const labelColor = disabled
    ? AppColors.muted
    : isLight
      ? AppColors.ink
      : isOutline
        ? AppColors.primary
        : AppColors.onPrimary;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      hapticOnPress={!isOutline}
      accessibilityLabel={accessibilityLabel ?? (hasLabel ? label : undefined)}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      bg={bg}
      bgPressed={bgPressed}
      style={[
        styles.pill,
        // minHeight, not height: a 2-line label grows the pill instead of
        // spilling out of it.
        { minHeight: height, borderRadius: height / 2 },
        !isSmall && styles.pillPadded,
        isOutline && styles.outline,
        isSmall && styles.small,
        withArrow || (loading && !isSmall) ? (size === 'lg' ? styles.withArrowLg : styles.withArrow) : null,
        style,
      ]}
    >
      {/* Up to 2 lines at narrow widths / large text; the pill grows. */}
      <Text
        style={[styles.label, isSmall && styles.labelSmall, { color: labelColor }]}
        numberOfLines={isSmall ? 1 : 2}
        adjustsFontSizeToFit={isSmall}
        minimumFontScale={0.8}
      >
        {label}
      </Text>
      {loading && !isSmall ? (
        <View style={[styles.arrowCircle, { right: arrowInset, width: circle, height: circle, borderRadius: circle / 2 }]}>
          <ActivityIndicator size="small" color={isLight || isOutline ? AppColors.primary : AppColors.onPrimary} />
        </View>
      ) : withArrow ? (
        <View
          style={[
            styles.arrowCircle,
            { right: arrowInset, width: circle, height: circle, borderRadius: circle / 2 },
            isLight ? styles.arrowCircleLight : styles.arrowCircleDark,
          ]}
        >
          <Ionicons name="arrow-forward" size={size === 'lg' ? 18 : 16} color={isLight ? AppColors.onPrimary : AppColors.primary} style={styles.arrowIcon} />
        </View>
      ) : null}
    </PressableScale>
  );
}

interface TextButtonProps {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  tone?: 'secondary' | 'danger';
  chevron?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Secondary / ghost action: 15 SemiBold text, no fill, no border, 44 hit area,
 * optional trailing chevron. `tone="danger"` for destructive text actions.
 */
export function TextButton({
  label,
  onPress,
  style,
  tone = 'secondary',
  chevron,
  disabled,
  accessibilityLabel,
}: TextButtonProps) {
  const color = disabled ? AppColors.muted : tone === 'danger' ? AppColors.danger : AppColors.secondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.textBtn, pressed && styles.textBtnPressed, style]}
    >
      <Text style={[styles.textBtnLabel, { color }]}>{label}</Text>
      {chevron ? <Ionicons name="chevron-forward" size={14} color={color} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    borderCurve: 'continuous',
  },
  pillPadded: {
    paddingVertical: 6,
  },
  withArrow: {
    paddingHorizontal: 48,
  },
  withArrowLg: {
    paddingHorizontal: 56,
  },
  outline: {
    borderWidth: 1,
    borderColor: AppColors.borderStrong,
  },
  small: {
    paddingHorizontal: 14,
  },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  labelSmall: {
    fontSize: 13,
  },
  arrowCircle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowCircleDark: {
    backgroundColor: AppColors.card,
  },
  arrowCircleLight: {
    backgroundColor: AppColors.ink,
  },
  arrowIcon: {
    transform: [{ rotate: '-45deg' }],
  },
  textBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  textBtnPressed: {
    opacity: 0.6,
  },
  textBtnLabel: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    letterSpacing: -0.1,
  },
});
