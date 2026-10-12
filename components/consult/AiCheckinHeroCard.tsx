import { StyleSheet, Text, View } from 'react-native';

import { GradientButton } from '@/components/gradient-button';
import { Sprout } from '@/components/mascot/Sprout';
import { HeroCard } from '@/components/ui/HeroCard';
import { AppColors, FontFamily } from '@/constants/theme';

export interface AiCheckinHeroCardProps {
  onStart: () => void;
}

/**
 * Light-green glass hero: h1 headline (22, one secondary-green phrase),
 * 2-line body, Sprout (care, 56) and the screen's single primary CTA.
 */
export function AiCheckinHeroCard({ onStart }: AiCheckinHeroCardProps) {
  return (
    <HeroCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text style={styles.title}>
            Know what to do <Text style={styles.titleAccent}>in minutes</Text>
          </Text>
          <Text style={styles.desc} numberOfLines={2}>
            Answer a few gentle questions and get clear next steps.
          </Text>
        </View>
        <Sprout mood="care" size={56} />
      </View>
      <GradientButton label="Start check-in" onPress={onStart} size="md" style={styles.startBtn} />
    </HeroCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, gap: 4 },
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
});
