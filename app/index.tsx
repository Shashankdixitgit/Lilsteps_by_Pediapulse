import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { Sprout } from '@/components/mascot/Sprout';
import { HeroBackdrop, HeroBadge, heroCardStyle } from '@/components/ui/HeroCard';
import { AppColors, FontFamily, ForestRamp, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { dbg } from '@/lib/debug';
import { typography } from '@/styles/global';

// Stepping stones: precomputed solid greens rising from forest to mint.
const STONES = [40, 68, 100, 136, 176].map((h, i) => ({ h, color: ForestRamp[i] }));

export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const { session, loading, hasChildren } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    dbg.nav('Splash effect', { loading, hasSession: !!session, hasChildren, hasNavigated: hasNavigated.current });
    if (loading || hasNavigated.current) return;
    if (session && hasChildren !== null) {
      hasNavigated.current = true;
      const target = hasChildren ? '/(tabs)' : '/(onboarding)/parent-details';
      dbg.nav(`Splash → ${target}`);
      router.replace(target as '/(tabs)');
    }
  }, [session, loading, hasChildren]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      {/* Top bar — plain wordmark, like the site's nav */}
      <Animated.View entering={FadeIn.duration(500)} style={styles.topBar}>
        <View style={styles.markTile}>
          <View style={[styles.markDot, styles.markDotLarge]} />
          <View style={styles.markDotRow}>
            <View style={styles.markDot} />
            <View style={styles.markDot} />
          </View>
        </View>
        <Text style={styles.wordmark}>LilSteps</Text>
      </Animated.View>

      {/* Hero card: light-green glass, the one bold element */}
      <Animated.View
        entering={FadeIn.delay(100).duration(600)}
        style={[heroCardStyle.card, heroCardStyle.elevated, styles.hero]}
      >
        <HeroBackdrop />
        <HeroBadge label="Pediatric health suite" />

        {/* Stepping stones with Sprout on top: a nod to the name and to growth */}
        <View style={styles.stepsWrap} pointerEvents="none">
          <View style={styles.steps}>
            {STONES.map((stone, i) => (
              <View key={stone.h} style={styles.stoneCol}>
                {i === STONES.length - 1 ? (
                  <Sprout mood="wave" size={56} entrance style={styles.sproutOnStone} />
                ) : null}
                {i === 1 || i === 3 ? <View style={styles.footprint} /> : null}
                <View style={[styles.step, { height: stone.h, backgroundColor: stone.color }]} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.heroBody}>
          <Animated.Text entering={FadeInUp.delay(250).duration(600)} style={[typography.display, styles.headline]}>
            Every little step,{'\n'}
            <Text style={styles.headlineAccent}>gently guided.</Text>
          </Animated.Text>
          <Animated.Text entering={FadeInUp.delay(350).duration(600)} style={[typography.body, styles.subhead]}>
            A calm, doctor-built home for your child&apos;s vaccines, growth, records and consults.
          </Animated.Text>

          <Animated.View entering={FadeInDown.delay(450).duration(600)}>
            <GradientButton
              label="Get started"
              onPress={() => router.push('/(auth)/signup')}
              size="lg"
              style={styles.heroCta}
            />
          </Animated.View>
        </View>
      </Animated.View>

      {/* Secondary action: text only, so "Get started" stays the one primary */}
      <Animated.View entering={FadeInDown.delay(550).duration(600)} style={styles.bottomSection}>
        <GradientButton
          variant="ghost"
          label="I already have an account"
          onPress={() => router.push('/(auth)/login')}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.surface,
    paddingHorizontal: 20,
    gap: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  markTile: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  markDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: AppColors.onPrimary,
  },
  markDotLarge: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: AppColors.mint,
  },
  markDotRow: {
    flexDirection: 'row',
    gap: 3,
  },
  wordmark: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    letterSpacing: -0.3,
    color: AppColors.onSurface,
  },
  hero: {
    flex: 1,
    paddingBottom: 24,
  },
  stepsWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingVertical: 24,
  },
  steps: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  stoneCol: {
    alignItems: 'center',
  },
  step: {
    width: 28,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
  },
  footprint: {
    width: 10,
    height: 14,
    borderRadius: 6,
    backgroundColor: AppColors.onPrimary,
    opacity: 0.9,
    marginBottom: 6,
  },
  sproutOnStone: {
    marginBottom: -6,
  },
  heroBody: {
    gap: 12,
  },
  headline: {
    maxWidth: 300,
  },
  // Display-size highlight: success (4.3:1, large text) reads as green next to forestDeep, like the home greeting.
  headlineAccent: {
    fontFamily: FontFamily.bold,
    color: AppColors.success,
  },
  subhead: {
    maxWidth: 320,
  },
  heroCta: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  bottomSection: {
    alignItems: 'center',
  },
});
