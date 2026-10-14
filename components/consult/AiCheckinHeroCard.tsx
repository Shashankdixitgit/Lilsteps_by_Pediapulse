import { StyleSheet, Text, View } from 'react-native';

import { GradientButton } from '@/components/gradient-button';
import { useCompactWidth } from '@/components/home/useCompactWidth';
import { Sprout } from '@/components/mascot/Sprout';
import { HeroCard } from '@/components/ui/HeroCard';
import { AppColors, FontFamily } from '@/constants/theme';

export interface AiCheckinHeroCardProps {
  onStart: () => void;
}

/**
 * Light-green glass hero: h1 headline (22, one secondary-green phrase),
 * up to 3-line body (says what the check-in really does: warning signs +
 * a doctor summary, not a diagnosis), Sprout (care, 56) and the screen's single primary CTA.
 */
export function AiCheckinHeroCard({ onStart }: AiCheckinHeroCardProps) {
  // R2-05: at 200% zoom the mascot squeezed the headline to one syllable per
  // line; the decorative Sprout is dropped and the body is never cut.
  const compact = useCompactWidth();
  return (
    <HeroCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.title}>
            Check in <Text style={styles.titleAccent}>before you book</Text>
          </Text>
          <Text style={styles.desc} numberOfLines={compact ? undefined : 3}>
            Answer a few questions. We&apos;ll flag warning signs and write a summary for the doctor. It doesn&apos;t
            diagnose.
          </Text>
        </View>
        {compact ? null : <Sprout mood="care" size={56} />}
      </View>
      <GradientButton label="Start check-in" onPress={onStart} size="md" style={compact ? styles.startBtnFull : styles.startBtn} />
    </HeroCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: AppColors.forestDeep,
  },
  // Highlight in secondary (8.0:1 on heroFill); success would be < 4.5:1 at 22px.
  titleAccent: { fontFamily: FontFamily.bold, color: AppColors.secondary },
  desc: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurfaceVariant,
  },
  startBtn: { alignSelf: 'flex-start' },
  startBtnFull: { alignSelf: 'stretch' },
});
