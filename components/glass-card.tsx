import { StyleSheet, View, ViewProps } from 'react-native';

import { HeroBackdrop, heroCardStyle } from '@/components/ui/HeroCard';
import { AppColors, Radius, Shadow } from '@/constants/theme';

type CardTone = 'default' | 'mint' | 'sunshine' | 'info' | 'forest';

interface GlassCardProps extends ViewProps {
  tone?: CardTone;
  /**
   * Adds the soft navy-tinted card shadow, but ONLY on `tone="forest"`
   * (heroes). Plain cards are border-only; the prop is a no-op on them.
   */
  elevated?: boolean;
}

const TONES: Record<CardTone, { backgroundColor: string; borderColor: string; borderWidth: number }> = {
  default: { backgroundColor: AppColors.card, borderColor: AppColors.border, borderWidth: 1 },
  mint: { backgroundColor: AppColors.greenWash, borderColor: AppColors.mintBorder, borderWidth: 1 },
  sunshine: { backgroundColor: AppColors.sunshineSurface, borderColor: AppColors.warningBorder, borderWidth: 1 },
  info: { backgroundColor: AppColors.infoSurface, borderColor: AppColors.infoBorder, borderWidth: 1 },
  // `forest` is now the lavender glass hero (name kept for call sites). See components/ui/HeroCard.
  forest: { backgroundColor: AppColors.heroFill, borderColor: AppColors.heroBorder, borderWidth: 1 },
};

/**
 * White hairline-bordered card (padding 16, no shadow) with optional tones (name kept for call-site
 * compatibility; there is no frosted glass). `forest` renders the lavender
 * glass hero (lavender gradient + white sheen), same as <HeroCard />. Never
 * combine `elevated` with overflow:'hidden' on the same view.
 */
export function GlassCard({ children, style, tone = 'default', elevated, ...props }: GlassCardProps) {
  return (
    <View
      style={[
        styles.card,
        TONES[tone],
        tone === 'forest' && heroCardStyle.card,
        elevated && tone === 'forest' && styles.elevated,
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
  elevated: {
    boxShadow: Shadow.card,
  },
});
