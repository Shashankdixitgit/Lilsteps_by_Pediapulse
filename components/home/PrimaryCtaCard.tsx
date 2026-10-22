import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { TextButton } from '@/components/gradient-button';
import { useCompactWidth } from '@/components/home/useCompactWidth';
import { Sprout } from '@/components/mascot/Sprout';
import { HeroBackdrop, HeroBadge, heroCardStyle } from '@/components/ui/HeroCard';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Radius } from '@/constants/theme';

interface PrimaryCtaCardProps {
  title: string;
  subtitle: string;
  onPress: () => void;
  /** Label of the deep-purple pill (default "Start check-in"). */
  ctaLabel?: string;
  /** Optional hero badge. Off by default (the subtitle already says it). */
  badge?: string;
  /** Optional ghost text link under the pill (e.g. "Book a doctor"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Lavender glass hero card for the AI check-in: forestDeep title (17 Bold),
 * short subtitle, static Sprout (care, 56) and a deep-purple pill CTA. The
 * pressable area is the card body (no nested buttons); the optional ghost
 * link sits beside it as its own button, inside the same hero.
 */
export function PrimaryCtaCard({
  title,
  subtitle,
  onPress,
  ctaLabel = 'Start check-in',
  badge,
  secondaryLabel,
  onSecondary,
}: PrimaryCtaCardProps) {
  const hasSecondary = !!secondaryLabel && !!onSecondary;
  // Narrow window (200% zoom): drop the mascot so words don't break mid-word.
  const compact = useCompactWidth();
  return (
    <View style={[heroCardStyle.card, heroCardStyle.elevated, styles.card]}>
      <HeroBackdrop />
      <PressableScale
        onPress={onPress}
        hapticOnPress
        scaleTo={0.98}
        accessibilityLabel={`${title}. ${subtitle}. ${ctaLabel}`}
        style={styles.body}
      >
        {badge ? <HeroBadge label={badge} /> : null}
        <View style={styles.inner}>
          <View style={styles.textBlock}>
            <Text style={styles.title}>{title}</Text>
            {/* No line cap: at 200% text the subtitle wraps instead of "…". */}
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          {compact ? null : <Sprout mood="care" size={56} />}
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaLabel}>{ctaLabel}</Text>
          <View style={styles.ctaCircle}>
            <Ionicons name="arrow-forward" size={16} color={AppColors.primary} style={styles.ctaArrow} />
          </View>
        </View>
      </PressableScale>
      {hasSecondary ? (
        <TextButton label={secondaryLabel} onPress={onSecondary} chevron style={styles.secondary} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
  },
  body: {
    gap: 12,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: AppColors.forestDeep,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurfaceVariant,
  },
  cta: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 6,
    paddingLeft: 18,
    paddingRight: 6,
    borderRadius: Radius.full,
    backgroundColor: AppColors.primary,
  },
  ctaLabel: {
    flexShrink: 1,
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.onPrimary,
  },
  ctaCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaArrow: {
    transform: [{ rotate: '-45deg' }],
  },
  secondary: {
    alignSelf: 'flex-start',
    paddingHorizontal: 0,
    marginBottom: -8,
  },
});
