import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewProps, ViewStyle } from 'react-native';

import { AppColors, FontFamily, Radius, Shadow } from '@/constants/theme';

interface HeroBackdropProps {
  /** Outer corner radius of the card (default Radius.xl). */
  radius?: number;
}

/**
 * The light-green glass layers of a hero card: a gentle mint gradient plus a
 * white sheen over the top ~45%. Absolutely positioned and non-interactive, so
 * it can sit as the first child of any container (View, PressableScale) that
 * uses `heroCardStyle`. Clips itself to the radius, so the container does not
 * need overflow:'hidden' (keeps the box shadow intact).
 */
export function HeroBackdrop({ radius = Radius.xl }: HeroBackdropProps) {
  const inner = Math.max(0, radius - 1);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: inner, overflow: 'hidden' }]}>
      <LinearGradient
        colors={[AppColors.heroFill, AppColors.heroFillEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[AppColors.heroSheen, AppColors.heroSheenEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.sheen}
      />
    </View>
  );
}

interface HeroCardProps extends ViewProps {
  /** Soft forest-tinted shadow (default true). Pass false if the card clips (overflow:'hidden'). */
  elevated?: boolean;
}

/**
 * Big feature card: light mint with a touch of glass (very subtle, not
 * frosted). Content rules: titles forestDeep, body onSurfaceVariant,
 * highlights secondary, pills `heroPill` + mintBorder, CTA = default
 * GradientButton (deep-green pill). Never put `mint` text on it.
 */
export function HeroCard({ children, style, elevated = true, ...props }: HeroCardProps) {
  return (
    <View style={[heroCardStyle.card, elevated && heroCardStyle.elevated, style]} {...props}>
      <HeroBackdrop />
      {children}
    </View>
  );
}

/** Base container style for a hero (use with <HeroBackdrop /> as first child). */
export const heroCardStyle = StyleSheet.create({
  card: {
    backgroundColor: AppColors.heroFill,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.heroBorder,
    padding: 20,
  },
  elevated: {
    boxShadow: Shadow.card,
  },
});

interface HeroBadgeProps {
  label: string;
  /** Leading icon; defaults to a small green dot. */
  icon?: ReactNode;
  /** Kept for call-site compatibility; badges always render at `sm` now. */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

/** Glassy pill on a light hero: 70% white, mintBorder hairline, secondary text. */
export function HeroBadge({ label, icon, style }: HeroBadgeProps) {
  return (
    <View style={[styles.badge, style]}>
      {icon ?? <View style={styles.badgeDot} />}
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: AppColors.heroPill,
    borderWidth: 1,
    borderColor: AppColors.mintBorder,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.success,
  },
  badgeText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: AppColors.secondary,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
  },
});
