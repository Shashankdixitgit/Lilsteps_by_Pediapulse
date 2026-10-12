import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { AppColors, FontFamily, Size } from '@/constants/theme';

interface ScreenHeaderProps {
  /** 17 SemiBold, left-aligned next to the back button. */
  title?: string;
  /** Optional one-line 13 muted subtitle under the title (e.g. doctor name). */
  subtitle?: string;
  /** Defaults to `router.back()`. */
  onBack?: () => void;
  /** Hide the back button (e.g. a success state). */
  hideBack?: boolean;
  /** Keep the back button visible but inactive (e.g. while saving). */
  backDisabled?: boolean;
  /** Extra content after the title (e.g. a status dot). */
  titleAccessory?: ReactNode;
  /** Right slot: a TextButton or a 40x40 `HeaderIconButton`. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one stack-screen header: plain `arrow-back` 22 in a 40x40 hit area
 * (no circle, fill or border), 17 SemiBold title left-aligned, optional right
 * slot. Height 52, no bottom border. Does not add the safe-area inset; the
 * screen keeps doing that.
 */
export function ScreenHeader({ title, subtitle, onBack, hideBack, backDisabled, titleAccessory, right, style }: ScreenHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      {hideBack ? null : (
        <HeaderIconButton
          icon="arrow-back"
          onPress={onBack ?? (() => router.back())}
          disabled={backDisabled}
          accessibilityLabel="Go back"
        />
      )}
      <View style={[styles.titleWrap, hideBack && styles.titleWrapNoBack]}>
        {title ? (
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            {titleAccessory}
          </View>
        ) : null}
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

interface HeaderIconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
  disabled?: boolean;
}

/** 40x40 icon button, no fill and no border, icon 22. For headers. */
export function HeaderIconButton({ icon, onPress, accessibilityLabel, color = AppColors.onSurface, disabled }: HeaderIconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
    >
      <Ionicons name={icon} size={Size.iconHeader} color={disabled ? AppColors.outlineVariant : color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    height: Size.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 4,
  },
  titleWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  titleWrapNoBack: {
    paddingLeft: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: AppColors.onSurface,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 16,
    color: AppColors.muted,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: Size.iconBtn,
    height: Size.iconBtn,
    borderRadius: Size.iconBtn / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: AppColors.surfaceContainer,
  },
});
