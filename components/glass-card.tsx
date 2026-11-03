import { StyleSheet, View, ViewProps } from 'react-native';

import { HeroBackdrop, heroCardStyle } from '@/components/ui/HeroCard';
import { AppColors, Radius, Shadow } from '@/constants/theme';

type CardTone = 'default' | 'mint' | 'sunshine' | 'info' | 'forest';

interface GlassCardProps extends ViewProps {
  tone?: CardTone;
  /**
   * Kept for call sites. Heroes (`tone="forest"`) always get the navy outline
   * + solid offset shadow; plain cards always get the soft lift.
   */
  elevated?: boolean;
  /** Key card: navy outline + solid offset shadow (HitRate-style). */
  strong?: boolean;
}

const TONES: Record<CardTone, { backgroundColor: string; borderColor: string; borderWidth: number }> = {
  default: { backgroundColor: AppColors.card, borderColor: AppColors.hairline, borderWidth: 1 },
  mint: { backgroundColor: AppColors.greenWash, borderColor: AppColors.mintBorder, borderWidth: 1 },
  sunshine: { backgroundColor: AppColors.sunshineSurface, borderColor: AppColors.warningBorder, borderWidth: 1 },
  info: { backgroundColor: AppColors.infoSurface, borderColor: AppColors.infoBorder, borderWidth: 1 },
  // `forest` is now the lavender glass hero (name kept for call sites). See components/ui/HeroCard.
  forest: { backgroundColor: AppColors.heroFill, borderColor: AppColors.heroBorder, borderWidth: 1 },
};

/**
 * Card (padding 16) in the clinic website's style (name kept for call-site
 * compatibility; there is no frosted glass). Default: white, hairline edge,
 * soft lift. `strong` and the `forest` hero: navy outline sitting on a solid
 * navy offset shadow. `forest` also renders the lavender hero backdrop, same
 * as <HeroCard />.
 */
export function GlassCard({ children, style, tone = 'default', elevated, strong, ...props }: GlassCardProps) {
  const key = strong || tone === 'forest';
  return (
    <View
      style={[
        styles.card,
        TONES[tone],
        tone === 'forest' && heroCardStyle.card,
        key ? styles.strong : tone === 'default' ? styles.lift : null,
        style,
      ]}
      {...props}
    >
      {tone === 'forest' ? <HeroBackdrop /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    padding: 16,
  },
  lift: {
    boxShadow: Shadow.lift,
  },
  strong: {
    borderColor: AppColors.ink,
    boxShadow: Shadow.hardLg,
  },
});
